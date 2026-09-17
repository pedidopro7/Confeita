-- Recipe output scaling for configurable choices.
alter table public.product_options
  add column if not exists recipe_output_qty numeric(14,4) not null default 1 check (recipe_output_qty > 0);
alter table public.product_options
  add column if not exists recipe_output_unit text not null default 'un';

-- Resolve every recipe attached to an order item: the main product/variant formula
-- plus formulas attached to selected configurable options.
create or replace function public.order_inventory_requirements(p_order_id uuid)
returns table (
  inventory_item_id uuid,
  quantity numeric,
  unit text
)
language sql
stable
security invoker
set search_path = public
as $$
with requirements as (
  select req.inventory_item_id, req.quantity, req.unit
  from public.order_items oi
  cross join lateral public.recipe_inventory_requirements(
    oi.recipe_version_id,
    oi.quantity * coalesce(oi.recipe_output_qty, 1)
  ) req
  where oi.order_id = p_order_id
    and oi.recipe_version_id is not null

  union all

  select req.inventory_item_id, req.quantity, req.unit
  from public.order_items oi
  cross join lateral jsonb_array_elements(coalesce(oi.configuration -> 'options', '[]'::jsonb)) selected
  cross join lateral public.recipe_inventory_requirements(
    nullif(selected ->> 'recipeVersionId', '')::uuid,
    oi.quantity * coalesce(nullif(selected ->> 'recipeOutputQty', '')::numeric, 1)
  ) req
  where oi.order_id = p_order_id
    and nullif(selected ->> 'recipeVersionId', '') is not null
)
select inventory_item_id, sum(quantity) as quantity, unit
from requirements
group by inventory_item_id, unit;
$$;

grant execute on function public.order_inventory_requirements(uuid) to authenticated;
revoke execute on function public.order_inventory_requirements(uuid) from anon;

create or replace function public.reserve_order_inventory(p_order_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_business_id uuid;
  v_status text;
  v_missing jsonb;
begin
  select business_id, status into v_business_id, v_status
  from public.orders
  where id = p_order_id;

  if v_business_id is null or not private.is_business_member(v_business_id) then
    raise exception 'order_not_found_or_forbidden';
  end if;

  if v_status in ('production','ready','out_for_delivery','completed','canceled','refunded') then
    raise exception 'order_cannot_be_reserved_in_current_status';
  end if;

  update public.inventory_reservations
     set status = 'released', updated_at = now()
   where order_id = p_order_id and status = 'active';

  insert into public.inventory_reservations (
    business_id, order_id, inventory_item_id, quantity, unit, status
  )
  select
    v_business_id,
    p_order_id,
    req.inventory_item_id,
    req.quantity,
    req.unit,
    'active'
  from public.order_inventory_requirements(p_order_id) req;

  select coalesce(jsonb_agg(jsonb_build_object(
    'inventory_item_id', s.inventory_item_id,
    'name', s.name,
    'required', r.quantity,
    'available_before_reservation', s.available + r.quantity,
    'shortage', greatest(0, r.quantity - (s.available + r.quantity)),
    'unit', r.unit
  )) filter (where (s.available + r.quantity) < r.quantity), '[]'::jsonb)
  into v_missing
  from public.inventory_reservations r
  join public.inventory_stock_summary s
    on s.inventory_item_id = r.inventory_item_id
   and s.business_id = r.business_id
  where r.order_id = p_order_id and r.status = 'active';

  update public.orders
     set status = 'confirmed', updated_at = now()
   where id = p_order_id;

  insert into public.order_status_history (business_id, order_id, from_status, to_status, changed_by, note)
  values (v_business_id, p_order_id, v_status, 'confirmed', auth.uid(), 'Ingredientes reservados automaticamente');

  return jsonb_build_object('ok', true, 'shortages', coalesce(v_missing, '[]'::jsonb));
end;
$$;

grant execute on function public.reserve_order_inventory(uuid) to authenticated;
revoke execute on function public.reserve_order_inventory(uuid) from anon;

create or replace function public.start_order_production(p_order_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
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
    'name', s.name,
    'required', r.quantity,
    'on_hand', s.on_hand,
    'unit', r.unit
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
  select
    r.business_id,
    r.inventory_item_id,
    'PRODUCTION_CONSUMPTION',
    -r.quantity,
    r.unit,
    'order',
    p_order_id,
    'Consumo automático ao iniciar produção',
    auth.uid()
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
    oi.quantity * coalesce(oi.recipe_output_qty, 1),
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
      nullif(selected ->> 'recipeVersionId', '')::uuid as recipe_version_id,
      sum(oi.quantity * coalesce(nullif(selected ->> 'recipeOutputQty', '')::numeric, 1)) as planned_qty,
      max(o.scheduled_at) as scheduled_at
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    cross join lateral jsonb_array_elements(coalesce(oi.configuration -> 'options', '[]'::jsonb)) selected
    where oi.order_id = p_order_id
      and nullif(selected ->> 'recipeVersionId', '') is not null
    group by oi.business_id, oi.order_id, nullif(selected ->> 'recipeVersionId', '')::uuid
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

grant execute on function public.start_order_production(uuid) to authenticated;
revoke execute on function public.start_order_production(uuid) from anon;
