-- Automatic purchase planning for confirmed orders plus minimum stock.
create or replace function public.purchase_plan(
  p_business_id uuid,
  p_days integer default 7
)
returns table (
  inventory_item_id uuid,
  item_name text,
  base_unit text,
  purchase_unit text,
  purchase_unit_multiplier numeric,
  min_stock numeric,
  on_hand numeric,
  required_qty numeric,
  projected_balance numeric,
  buy_qty_base numeric,
  suggested_purchase_qty numeric,
  estimated_cost numeric,
  earliest_due timestamptz,
  orders_count bigint,
  supplier_id uuid,
  supplier_name text,
  supplier_whatsapp text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_days integer := greatest(coalesce(p_days, 7), 1);
begin
  if not exists (
    select 1
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
  ) then
    raise exception 'business_not_found_or_forbidden';
  end if;

  return query
  with selected_orders as (
    select o.id, o.scheduled_at
    from public.orders o
    where o.business_id = p_business_id
      and o.status = 'confirmed'
      and (o.scheduled_at is null or o.scheduled_at <= now() + make_interval(days => v_days))
  ),
  reserved as (
    select
      r.inventory_item_id,
      sum(r.quantity) as required_qty,
      min(so.scheduled_at) filter (where so.scheduled_at is not null) as earliest_due,
      count(distinct r.order_id) as orders_count
    from public.inventory_reservations r
    join selected_orders so on so.id = r.order_id
    where r.business_id = p_business_id
      and r.status = 'active'
    group by r.inventory_item_id
  ),
  movement_totals as (
    select m.inventory_item_id, sum(m.quantity_delta) as on_hand
    from public.inventory_movements m
    where m.business_id = p_business_id
    group by m.inventory_item_id
  )
  select
    i.id,
    i.name,
    i.base_unit,
    coalesce(nullif(i.purchase_unit, ''), i.base_unit),
    greatest(coalesce(i.purchase_unit_multiplier, 1), 0.0001),
    coalesce(i.min_stock, 0),
    coalesce(mt.on_hand, 0),
    coalesce(r.required_qty, 0),
    coalesce(mt.on_hand, 0) - coalesce(r.required_qty, 0),
    greatest(0, coalesce(r.required_qty, 0) + coalesce(i.min_stock, 0) - coalesce(mt.on_hand, 0)),
    case
      when greatest(0, coalesce(r.required_qty, 0) + coalesce(i.min_stock, 0) - coalesce(mt.on_hand, 0)) <= 0 then 0
      else ceil(
        greatest(0, coalesce(r.required_qty, 0) + coalesce(i.min_stock, 0) - coalesce(mt.on_hand, 0))
        / greatest(coalesce(i.purchase_unit_multiplier, 1), 0.0001)
      )
    end,
    greatest(0, coalesce(r.required_qty, 0) + coalesce(i.min_stock, 0) - coalesce(mt.on_hand, 0)) * coalesce(i.average_unit_cost, 0),
    r.earliest_due,
    coalesce(r.orders_count, 0),
    ls.supplier_id,
    ls.supplier_name,
    ls.supplier_whatsapp
  from public.inventory_items i
  left join movement_totals mt on mt.inventory_item_id = i.id
  left join reserved r on r.inventory_item_id = i.id
  left join lateral (
    select s.id as supplier_id, s.name as supplier_name, s.whatsapp as supplier_whatsapp
    from public.purchase_items pi
    join public.purchases p
      on p.id = pi.purchase_id
     and p.business_id = pi.business_id
    join public.suppliers s
      on s.id = p.supplier_id
     and s.business_id = p.business_id
    where pi.business_id = i.business_id
      and pi.inventory_item_id = i.id
    order by p.purchased_at desc
    limit 1
  ) ls on true
  where i.business_id = p_business_id
    and i.active = true
    and greatest(0, coalesce(r.required_qty, 0) + coalesce(i.min_stock, 0) - coalesce(mt.on_hand, 0)) > 0
  order by
    case when r.earliest_due is null then 1 else 0 end,
    r.earliest_due,
    i.name;
end;
$$;

revoke all on function public.purchase_plan(uuid,integer) from public, anon;
grant execute on function public.purchase_plan(uuid,integer) to authenticated, service_role;
