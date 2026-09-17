-- Let purchases use a custom purchase unit (pacote, caixa, fardo...) configured per item.
create or replace function public.record_inventory_purchase(
  p_inventory_item_id uuid,
  p_supplier_id uuid,
  p_quantity numeric,
  p_unit text,
  p_total_cost numeric,
  p_lot_code text default null,
  p_expires_at date default null,
  p_payment_method text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_base_unit text;
  v_purchase_unit text;
  v_purchase_multiplier numeric;
  v_old_avg numeric;
  v_on_hand numeric;
  v_base_qty numeric;
  v_purchase_unit_cost numeric;
  v_new_avg numeric;
  v_purchase_id uuid;
begin
  if p_quantity <= 0 or p_total_cost < 0 then
    raise exception 'invalid_purchase_values';
  end if;

  select
    i.business_id,
    i.base_unit,
    coalesce(nullif(trim(i.purchase_unit), ''), i.base_unit),
    greatest(coalesce(i.purchase_unit_multiplier, 1), 0.0001),
    coalesce(i.average_unit_cost, 0)
  into
    v_business_id,
    v_base_unit,
    v_purchase_unit,
    v_purchase_multiplier,
    v_old_avg
  from public.inventory_items i
  where i.id = p_inventory_item_id and i.active = true;

  if v_business_id is null or not private.has_business_role(v_business_id, array['owner','manager','stock']::text[]) then
    raise exception 'inventory_item_not_found_or_forbidden';
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers s where s.id = p_supplier_id and s.business_id = v_business_id
  ) then
    raise exception 'supplier_not_found_or_forbidden';
  end if;

  if lower(trim(p_unit)) = lower(trim(v_purchase_unit)) and lower(trim(v_purchase_unit)) <> lower(trim(v_base_unit)) then
    v_base_qty := p_quantity * v_purchase_multiplier;
  else
    v_base_qty := public.convert_inventory_quantity(p_quantity, p_unit, v_base_unit);
  end if;

  if v_base_qty <= 0 then raise exception 'invalid_base_quantity'; end if;
  v_purchase_unit_cost := p_total_cost / v_base_qty;

  select coalesce(sum(m.quantity_delta), 0)
  into v_on_hand
  from public.inventory_movements m
  where m.business_id = v_business_id and m.inventory_item_id = p_inventory_item_id;

  v_new_avg := ((greatest(v_on_hand, 0) * v_old_avg) + p_total_cost)
    / nullif(greatest(v_on_hand, 0) + v_base_qty, 0);

  insert into public.purchases (business_id, supplier_id, total, payment_method, notes)
  values (v_business_id, p_supplier_id, p_total_cost, nullif(trim(p_payment_method), ''), nullif(trim(p_notes), ''))
  returning id into v_purchase_id;

  insert into public.purchase_items (
    business_id, purchase_id, inventory_item_id, quantity, unit, total_cost, lot_code, expires_at
  ) values (
    v_business_id, v_purchase_id, p_inventory_item_id, p_quantity, p_unit, p_total_cost,
    nullif(trim(p_lot_code), ''), p_expires_at
  );

  insert into public.inventory_movements (
    business_id, inventory_item_id, movement_type, quantity_delta, unit, unit_cost,
    reference_type, reference_id, notes, created_by
  ) values (
    v_business_id, p_inventory_item_id, 'PURCHASE', v_base_qty, v_base_unit, v_purchase_unit_cost,
    'purchase', v_purchase_id, 'Entrada por compra', auth.uid()
  );

  update public.inventory_items
  set average_unit_cost = coalesce(v_new_avg, v_purchase_unit_cost), updated_at = now()
  where id = p_inventory_item_id and business_id = v_business_id;

  if nullif(trim(p_lot_code), '') is not null or p_expires_at is not null then
    insert into public.inventory_batches (
      business_id, inventory_item_id, lot_code, expires_at, received_at,
      quantity_received, quantity_remaining, unit_cost
    ) values (
      v_business_id, p_inventory_item_id, nullif(trim(p_lot_code), ''), p_expires_at, current_date,
      v_base_qty, v_base_qty, v_purchase_unit_cost
    );
  end if;

  return v_purchase_id;
end;
$$;

revoke all on function public.record_inventory_purchase(uuid,uuid,numeric,text,numeric,text,date,text,text) from public, anon;
grant execute on function public.record_inventory_purchase(uuid,uuid,numeric,text,numeric,text,date,text,text) to authenticated, service_role;
