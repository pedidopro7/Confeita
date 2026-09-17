-- Confeita v1: recipe explosion, inventory reservation and production lifecycle

create or replace function public.recipe_inventory_requirements(
  p_recipe_version_id uuid,
  p_output_qty numeric default null
)
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
with recursive recipe_tree as (
  select
    rv.id as recipe_version_id,
    case
      when p_output_qty is null then 1::numeric
      else p_output_qty / nullif(rv.yield_qty, 0)
    end as factor,
    array[rv.recipe_id]::uuid[] as visited_recipes
  from public.recipe_versions rv
  where rv.id = p_recipe_version_id

  union all

  select
    srv.id,
    rt.factor * rc.quantity / nullif(srv.yield_qty, 0),
    rt.visited_recipes || sr.id
  from recipe_tree rt
  join public.recipe_components rc
    on rc.recipe_version_id = rt.recipe_version_id
   and rc.component_type = 'sub_recipe'
  join public.recipes sr
    on sr.id = rc.sub_recipe_id
   and sr.active_version_id is not null
  join public.recipe_versions srv
    on srv.id = sr.active_version_id
  where not (sr.id = any(rt.visited_recipes))
), raw_requirements as (
  select
    rc.inventory_item_id,
    sum(rc.quantity * rt.factor) as quantity,
    rc.unit
  from recipe_tree rt
  join public.recipe_components rc
    on rc.recipe_version_id = rt.recipe_version_id
   and rc.component_type = 'inventory_item'
  group by rc.inventory_item_id, rc.unit
)
select rr.inventory_item_id, rr.quantity, rr.unit
from raw_requirements rr
where rr.inventory_item_id is not null and rr.quantity > 0;
$$;

grant execute on function public.recipe_inventory_requirements(uuid, numeric) to authenticated;
revoke execute on function public.recipe_inventory_requirements(uuid, numeric) from anon;

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

  if v_business_id is null or not public.is_business_member(v_business_id) then
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
    sum(req.quantity),
    req.unit,
    'active'
  from public.order_items oi
  cross join lateral public.recipe_inventory_requirements(
    oi.recipe_version_id,
    oi.quantity
  ) req
  where oi.order_id = p_order_id
    and oi.recipe_version_id is not null
  group by req.inventory_item_id, req.unit;

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

  if v_business_id is null or not public.is_business_member(v_business_id) then
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
    oi.quantity,
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

  update public.orders set status = 'production', updated_at = now() where id = p_order_id;
  insert into public.order_status_history (business_id, order_id, from_status, to_status, changed_by, note)
  values (v_business_id, p_order_id, v_status, 'production', auth.uid(), 'Produção iniciada e estoque consumido');

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.start_order_production(uuid) to authenticated;
revoke execute on function public.start_order_production(uuid) from anon;

create or replace function public.finish_order_production(p_order_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_business_id uuid;
  v_status text;
begin
  select business_id, status into v_business_id, v_status
  from public.orders where id = p_order_id for update;

  if v_business_id is null or not public.is_business_member(v_business_id) then
    raise exception 'order_not_found_or_forbidden';
  end if;

  if v_status <> 'production' then
    raise exception 'order_is_not_in_production';
  end if;

  update public.production_orders
     set status = 'done', completed_at = now(), updated_at = now()
   where order_id = p_order_id and status = 'in_progress';

  update public.orders set status = 'ready', updated_at = now() where id = p_order_id;
  insert into public.order_status_history (business_id, order_id, from_status, to_status, changed_by, note)
  values (v_business_id, p_order_id, v_status, 'ready', auth.uid(), 'Produção concluída');

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.finish_order_production(uuid) to authenticated;
revoke execute on function public.finish_order_production(uuid) from anon;

create or replace function public.cancel_order_and_release(p_order_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_business_id uuid;
  v_status text;
begin
  select business_id, status into v_business_id, v_status
  from public.orders where id = p_order_id for update;

  if v_business_id is null or not public.is_business_member(v_business_id) then
    raise exception 'order_not_found_or_forbidden';
  end if;

  if v_status in ('production','ready','out_for_delivery','completed','refunded') then
    raise exception 'order_cannot_be_canceled_without_manual_adjustment';
  end if;

  update public.inventory_reservations
     set status = 'released', updated_at = now()
   where order_id = p_order_id and status = 'active';

  update public.orders set status = 'canceled', updated_at = now() where id = p_order_id;
  insert into public.order_status_history (business_id, order_id, from_status, to_status, changed_by, note)
  values (v_business_id, p_order_id, v_status, 'canceled', auth.uid(), 'Pedido cancelado; reservas liberadas');

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.cancel_order_and_release(uuid) to authenticated;
revoke execute on function public.cancel_order_and_release(uuid) from anon;
