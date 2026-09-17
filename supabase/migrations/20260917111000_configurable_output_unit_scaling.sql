-- Ensure product/variant/option output units are converted to each recipe's yield unit
-- before reserving stock or creating production quantities.

create or replace function public.order_inventory_requirements(p_order_id uuid)
returns table (inventory_item_id uuid, quantity numeric, unit text)
language sql
stable
security invoker
set search_path = ''
as $$
with requirements as (
  select req.inventory_item_id, req.quantity, req.unit
  from public.order_items oi
  join public.recipe_versions rv on rv.id = oi.recipe_version_id
  cross join lateral public.recipe_inventory_requirements(
    oi.recipe_version_id,
    public.convert_inventory_quantity(
      oi.quantity * coalesce(oi.recipe_output_qty, 1),
      coalesce(nullif(oi.recipe_output_unit, ''), rv.yield_unit),
      rv.yield_unit
    )
  ) req
  where oi.order_id = p_order_id
    and oi.recipe_version_id is not null

  union all

  select req.inventory_item_id, req.quantity, req.unit
  from public.order_items oi
  cross join lateral jsonb_array_elements(coalesce(oi.configuration -> 'options', '[]'::jsonb)) selected
  join public.recipe_versions rv on rv.id = nullif(selected ->> 'recipeVersionId', '')::uuid
  cross join lateral public.recipe_inventory_requirements(
    rv.id,
    public.convert_inventory_quantity(
      oi.quantity * coalesce(nullif(selected ->> 'recipeOutputQty', '')::numeric, 1),
      coalesce(nullif(selected ->> 'recipeOutputUnit', ''), rv.yield_unit),
      rv.yield_unit
    )
  ) req
  where oi.order_id = p_order_id
    and nullif(selected ->> 'recipeVersionId', '') is not null
)
select inventory_item_id, sum(quantity), unit
from requirements
group by inventory_item_id, unit;
$$;

revoke all on function public.order_inventory_requirements(uuid) from public, anon;
grant execute on function public.order_inventory_requirements(uuid) to authenticated, service_role;

create or replace function private.start_order_production_internal(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_status text;
  v_shortages jsonb;
begin
  select business_id, status into v_business_id, v_status
  from public.orders where id = p_order_id for update;

  if v_business_id is null or not private.is_business_member(v_business_id) then
    raise exception 'order_not_found_or_forbidden';
  end if;
  if v_status <> 'confirmed' then
    raise exception 'order_must_be_confirmed_before_production';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', s.name, 'required', r.quantity, 'on_hand', s.on_hand, 'unit', r.unit
  )), '[]'::jsonb)
  into v_shortages
  from public.inventory_reservations r
  join public.inventory_stock_summary s
    on s.business_id = r.business_id
   and s.inventory_item_id = r.inventory_item_id
  where r.order_id = p_order_id
    and r.status = 'active'
    and s.on_hand < r.quantity;

  if jsonb_array_length(v_shortages) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_stock', 'shortages', v_shortages);
  end if;

  insert into public.inventory_movements (
    business_id, inventory_item_id, movement_type, quantity_delta, unit,
    reference_type, reference_id, notes, created_by
  )
  select r.business_id, r.inventory_item_id, 'PRODUCTION_CONSUMPTION', -r.quantity, r.unit,
         'order', p_order_id, 'Consumo automático ao iniciar produção', auth.uid()
  from public.inventory_reservations r
  where r.order_id = p_order_id and r.status = 'active';

  update public.inventory_reservations
     set status = 'consumed', updated_at = now()
   where order_id = p_order_id and status = 'active';

  insert into public.production_orders (
    business_id, order_id, recipe_id, recipe_version_id, status,
    planned_qty, unit, scheduled_at, started_at
  )
  select
    oi.business_id,
    oi.order_id,
    rv.recipe_id,
    oi.recipe_version_id,
    'in_progress',
    public.convert_inventory_quantity(
      oi.quantity * coalesce(oi.recipe_output_qty, 1),
      coalesce(nullif(oi.recipe_output_unit, ''), rv.yield_unit),
      rv.yield_unit
    ),
    rv.yield_unit,
    o.scheduled_at,
    now()
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join public.recipe_versions rv on rv.id = oi.recipe_version_id
  where oi.order_id = p_order_id
    and oi.recipe_version_id is not null
    and not exists (
      select 1 from public.production_orders po
      where po.order_id = oi.order_id
        and po.recipe_version_id = oi.recipe_version_id
        and po.status <> 'canceled'
    );

  insert into public.production_orders (
    business_id, order_id, recipe_id, recipe_version_id, status,
    planned_qty, unit, scheduled_at, started_at
  )
  select
    choice.business_id,
    choice.order_id,
    rv.recipe_id,
    choice.recipe_version_id,
    'in_progress',
    choice.planned_qty,
    rv.yield_unit,
    choice.scheduled_at,
    now()
  from (
    select
      oi.business_id,
      oi.order_id,
      rv.id as recipe_version_id,
      sum(public.convert_inventory_quantity(
        oi.quantity * coalesce(nullif(selected ->> 'recipeOutputQty', '')::numeric, 1),
        coalesce(nullif(selected ->> 'recipeOutputUnit', ''), rv.yield_unit),
        rv.yield_unit
      )) as planned_qty,
      max(o.scheduled_at) as scheduled_at
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    cross join lateral jsonb_array_elements(coalesce(oi.configuration -> 'options', '[]'::jsonb)) selected
    join public.recipe_versions rv on rv.id = nullif(selected ->> 'recipeVersionId', '')::uuid
    where oi.order_id = p_order_id
      and nullif(selected ->> 'recipeVersionId', '') is not null
    group by oi.business_id, oi.order_id, rv.id
  ) choice
  join public.recipe_versions rv on rv.id = choice.recipe_version_id
  where not exists (
    select 1 from public.production_orders po
    where po.order_id = choice.order_id
      and po.recipe_version_id = choice.recipe_version_id
      and po.status <> 'canceled'
  );

  update public.orders set status = 'production', updated_at = now() where id = p_order_id;
  insert into public.order_status_history (business_id, order_id, from_status, to_status, changed_by, note)
  values (v_business_id, p_order_id, v_status, 'production', auth.uid(), 'Produção iniciada e estoque consumido');

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function private.start_order_production_internal(uuid) from public, anon, authenticated;
grant execute on function private.start_order_production_internal(uuid) to service_role;
