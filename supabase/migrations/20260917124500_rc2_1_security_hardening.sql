-- Confeita RC2.1 security hardening
-- Aligns UI/server permissions with database authorization.

create or replace function private.has_business_permission(
  p_business_id uuid,
  p_permission text,
  p_default_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.businesses b
      where b.id = p_business_id
        and b.owner_user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.business_members bm
      where bm.business_id = p_business_id
        and bm.user_id = (select auth.uid())
        and bm.status = 'active'
        and (
          bm.role = any(p_default_roles)
          or coalesce(bm.permissions -> p_permission, 'false'::jsonb) = 'true'::jsonb
        )
    );
$$;

revoke all on function private.has_business_permission(uuid,text,text[]) from public, anon;
grant execute on function private.has_business_permission(uuid,text,text[]) to authenticated;

-- Controlled order reservation. Internal engine remains private.
create or replace function public.reserve_order_inventory(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_id uuid;
begin
  select o.business_id into v_business_id
  from public.orders o
  where o.id = p_order_id;

  if v_business_id is null
     or not private.has_business_permission(
       v_business_id,'manage_orders',array['owner','manager','service']::text[]
     ) then
    raise exception 'order_not_found_or_forbidden';
  end if;

  return private.reserve_order_inventory_internal(p_order_id);
end;
$$;

revoke all on function private.reserve_order_inventory_internal(uuid) from public, anon, authenticated;
revoke all on function public.reserve_order_inventory(uuid) from public, anon;
grant execute on function public.reserve_order_inventory(uuid) to authenticated;

-- Controlled production start.
create or replace function public.start_order_production(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_id uuid;
begin
  select o.business_id into v_business_id
  from public.orders o
  where o.id = p_order_id;

  if v_business_id is null
     or not private.has_business_permission(
       v_business_id,'manage_production',array['owner','manager','production']::text[]
     ) then
    raise exception 'order_not_found_or_forbidden';
  end if;

  return private.start_order_production_internal(p_order_id);
end;
$$;

revoke all on function private.start_order_production_internal(uuid) from public, anon, authenticated;
revoke all on function public.start_order_production(uuid) from public, anon;
grant execute on function public.start_order_production(uuid) to authenticated;

create or replace function public.cancel_order_and_release(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_id uuid; v_status text;
begin
  select o.business_id,o.status into v_business_id,v_status
  from public.orders o
  where o.id=p_order_id
  for update;

  if v_business_id is null
     or not private.has_business_permission(
       v_business_id,'cancel_orders',array['owner','manager']::text[]
     ) then
    raise exception 'order_not_found_or_forbidden';
  end if;

  if v_status in ('production','ready','out_for_delivery','completed','refunded') then
    raise exception 'order_cannot_be_canceled_without_manual_adjustment';
  end if;

  update public.inventory_reservations
  set status='released',updated_at=now()
  where order_id=p_order_id and status='active';

  update public.orders
  set status='canceled',updated_at=now()
  where id=p_order_id;

  insert into public.order_status_history
    (business_id,order_id,from_status,to_status,changed_by,note)
  values
    (v_business_id,p_order_id,v_status,'canceled',auth.uid(),'Pedido cancelado; reservas liberadas');

  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.finish_order_production(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_id uuid; v_status text; v_incomplete integer;
begin
  select o.business_id,o.status into v_business_id,v_status
  from public.orders o
  where o.id=p_order_id
  for update;

  if v_business_id is null
     or not private.has_business_permission(
       v_business_id,'manage_production',array['owner','manager','production']::text[]
     ) then
    raise exception 'order_not_found_or_forbidden';
  end if;

  if v_status <> 'production' then
    raise exception 'order_is_not_in_production';
  end if;

  select count(*) into v_incomplete
  from public.production_steps ps
  join public.production_orders po on po.id=ps.production_order_id
  where po.order_id=p_order_id
    and po.status='in_progress'
    and ps.completed=false;

  if v_incomplete>0 then
    return jsonb_build_object(
      'ok',false,
      'reason','checklist_incomplete',
      'error','Conclua o checklist da produção antes de marcar como pronto.',
      'remaining_steps',v_incomplete
    );
  end if;

  update public.production_orders
  set status='done',completed_at=now(),updated_at=now()
  where order_id=p_order_id and status='in_progress';

  update public.orders
  set status='ready',updated_at=now()
  where id=p_order_id;

  insert into public.order_status_history
    (business_id,order_id,from_status,to_status,changed_by,note)
  values
    (v_business_id,p_order_id,v_status,'ready',auth.uid(),'Produção concluída após checklist');

  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.toggle_production_step(p_step_id uuid,p_completed boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_id uuid; v_order_id uuid;
begin
  select ps.business_id,po.order_id into v_business_id,v_order_id
  from public.production_steps ps
  join public.production_orders po on po.id=ps.production_order_id
  where ps.id=p_step_id;

  if v_business_id is null
     or not private.has_business_permission(
       v_business_id,'manage_production',array['owner','manager','production']::text[]
     ) then
    raise exception 'production_step_not_found_or_forbidden';
  end if;

  update public.production_steps
  set completed=p_completed,
      completed_at=case when p_completed then now() else null end,
      completed_by=case when p_completed then auth.uid() else null end
  where id=p_step_id and business_id=v_business_id;

  return jsonb_build_object('ok',true,'order_id',v_order_id);
end;
$$;

create or replace function public.set_production_actual_qty(
  p_production_order_id uuid,
  p_actual_qty numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_id uuid; v_planned numeric; v_order_id uuid;
begin
  if p_actual_qty is null or p_actual_qty < 0 then
    raise exception 'invalid_actual_quantity';
  end if;

  select po.business_id,po.planned_qty,po.order_id
  into v_business_id,v_planned,v_order_id
  from public.production_orders po
  where po.id=p_production_order_id
  for update;

  if v_business_id is null
     or not private.has_business_permission(
       v_business_id,'manage_production',array['owner','manager','production']::text[]
     ) then
    raise exception 'production_order_not_found_or_forbidden';
  end if;

  update public.production_orders
  set actual_qty=p_actual_qty,updated_at=now()
  where id=p_production_order_id;

  insert into public.audit_logs
    (business_id,user_id,action,entity_type,entity_id,metadata)
  values
    (v_business_id,auth.uid(),'production_yield_recorded','production_order',p_production_order_id,
     jsonb_build_object('planned_qty',v_planned,'actual_qty',p_actual_qty,'difference',p_actual_qty-v_planned));

  return jsonb_build_object('ok',true,'order_id',v_order_id,'difference',p_actual_qty-v_planned);
end;
$$;

create or replace function public.mark_order_out_for_delivery(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_id uuid; v_status text; v_fulfillment text;
begin
  select o.business_id,o.status,o.fulfillment_type
  into v_business_id,v_status,v_fulfillment
  from public.orders o
  where o.id=p_order_id
  for update;

  if v_business_id is null
     or not private.has_business_permission(
       v_business_id,'manage_orders',array['owner','manager','service']::text[]
     ) then
    raise exception 'order_not_found_or_forbidden';
  end if;

  if v_fulfillment <> 'delivery' then raise exception 'order_is_not_delivery'; end if;
  if v_status <> 'ready' then raise exception 'order_is_not_ready'; end if;

  update public.orders
  set status='out_for_delivery',updated_at=now()
  where id=p_order_id;

  insert into public.order_status_history
    (business_id,order_id,from_status,to_status,changed_by,note)
  values
    (v_business_id,p_order_id,'ready','out_for_delivery',auth.uid(),'Pedido saiu para entrega');

  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.complete_order_fulfillment(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_id uuid; v_status text; v_fulfillment text;
begin
  select o.business_id,o.status,o.fulfillment_type
  into v_business_id,v_status,v_fulfillment
  from public.orders o
  where o.id=p_order_id
  for update;

  if v_business_id is null
     or not private.has_business_permission(
       v_business_id,'manage_orders',array['owner','manager','service']::text[]
     ) then
    raise exception 'order_not_found_or_forbidden';
  end if;

  if v_fulfillment='delivery' and v_status <> 'out_for_delivery' then
    raise exception 'delivery_must_be_out_for_delivery_before_completion';
  end if;
  if v_fulfillment='pickup' and v_status <> 'ready' then
    raise exception 'pickup_order_is_not_ready';
  end if;

  update public.orders
  set status='completed',updated_at=now()
  where id=p_order_id;

  insert into public.order_status_history
    (business_id,order_id,from_status,to_status,changed_by,note)
  values
    (v_business_id,p_order_id,v_status,'completed',auth.uid(),
     case when v_fulfillment='delivery' then 'Entrega concluída' else 'Pedido retirado' end);

  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.record_inventory_loss(
  p_inventory_item_id uuid,
  p_quantity numeric,
  p_unit text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_id uuid; v_base_unit text; v_base_qty numeric; v_movement_id uuid;
begin
  if p_quantity<=0 then raise exception 'invalid_loss_quantity'; end if;

  select i.business_id,i.base_unit
  into v_business_id,v_base_unit
  from public.inventory_items i
  where i.id=p_inventory_item_id and i.active=true;

  if v_business_id is null
     or not private.has_business_permission(
       v_business_id,'adjust_stock',array['owner','manager','stock']::text[]
     ) then
    raise exception 'inventory_item_not_found_or_forbidden';
  end if;

  v_base_qty:=public.convert_inventory_quantity(p_quantity,p_unit,v_base_unit);

  insert into public.inventory_movements(
    business_id,inventory_item_id,movement_type,quantity_delta,unit,notes,created_by
  )
  values(
    v_business_id,p_inventory_item_id,'LOSS',-abs(v_base_qty),v_base_unit,
    coalesce(nullif(trim(p_reason),''),'Perda registrada'),auth.uid()
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

create or replace function public.apply_inventory_count(
  p_counts jsonb,
  p_note text default 'Conferência de estoque'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_item_id uuid;
  v_counted numeric;
  v_business_id uuid;
  v_base_unit text;
  v_on_hand numeric;
  v_delta numeric;
  v_adjusted integer := 0;
begin
  if jsonb_typeof(coalesce(p_counts,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_counts,'[]'::jsonb)) = 0 then
    raise exception 'inventory_count_requires_items';
  end if;

  for v_entry in select value from jsonb_array_elements(p_counts)
  loop
    v_item_id := nullif(v_entry->>'inventory_item_id','')::uuid;
    v_counted := nullif(v_entry->>'counted','')::numeric;

    if v_item_id is null or v_counted is null or v_counted < 0 then
      raise exception 'invalid_inventory_count';
    end if;

    select i.business_id,i.base_unit
    into v_business_id,v_base_unit
    from public.inventory_items i
    where i.id=v_item_id and i.active=true;

    if v_business_id is null
       or not private.has_business_permission(
         v_business_id,'adjust_stock',array['owner','manager','stock']::text[]
       ) then
      raise exception 'inventory_item_not_found_or_forbidden';
    end if;

    select coalesce(sum(m.quantity_delta),0)
    into v_on_hand
    from public.inventory_movements m
    where m.business_id=v_business_id
      and m.inventory_item_id=v_item_id;

    v_delta := v_counted-v_on_hand;

    if abs(v_delta) > 0.0000001 then
      insert into public.inventory_movements(
        business_id,inventory_item_id,movement_type,quantity_delta,unit,
        reference_type,notes,created_by
      )
      values(
        v_business_id,v_item_id,'INVENTORY_ADJUSTMENT',v_delta,v_base_unit,
        'inventory_count',coalesce(nullif(trim(p_note),''),'Conferência de estoque'),auth.uid()
      );
      v_adjusted := v_adjusted+1;
    end if;
  end loop;

  return jsonb_build_object('ok',true,'adjusted',v_adjusted);
end;
$$;

create or replace function public.record_manual_expense(
  p_business_id uuid,
  p_category text,
  p_description text,
  p_amount numeric,
  p_occurred_at date default current_date,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_expense_id uuid; v_existing uuid; v_key text := nullif(trim(p_idempotency_key),'');
begin
  if not private.has_business_permission(
    p_business_id,'manage_finance',array['owner','manager','finance']::text[]
  ) then
    raise exception 'business_forbidden';
  end if;

  if p_amount is null or p_amount <= 0 then raise exception 'invalid_expense_amount'; end if;
  if nullif(trim(p_description),'') is null then raise exception 'expense_description_required'; end if;

  if v_key is not null then
    select e.id into v_existing
    from public.expenses e
    where e.business_id=p_business_id and e.idempotency_key=v_key;
    if v_existing is not null then return v_existing; end if;
  end if;

  insert into public.expenses(
    business_id,category,description,amount,occurred_at,idempotency_key,created_by
  )
  values(
    p_business_id,coalesce(nullif(trim(p_category),''),'outros'),trim(p_description),
    p_amount,coalesce(p_occurred_at,current_date),v_key,auth.uid()
  )
  returning id into v_expense_id;

  insert into public.financial_transactions(
    business_id,type,category,amount,status,paid_at,reference_type,reference_id,description
  )
  values(
    p_business_id,'expense',coalesce(nullif(trim(p_category),''),'outros'),
    p_amount,'paid',now(),'expense',v_expense_id,trim(p_description)
  );

  insert into public.audit_logs(
    business_id,user_id,action,entity_type,entity_id,metadata
  )
  values(
    p_business_id,auth.uid(),'expense_recorded','expense',v_expense_id,
    jsonb_build_object('amount',p_amount,'category',p_category)
  );

  return v_expense_id;
end;
$$;

create or replace function public.record_inventory_purchase_batch(
  p_supplier_id uuid,
  p_items jsonb,
  p_payment_method text default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_purchase_id uuid;
  v_existing uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_unit text;
  v_cost numeric;
  v_lot text;
  v_exp date;
  v_base_unit text;
  v_purchase_unit text;
  v_multiplier numeric;
  v_old_avg numeric;
  v_on_hand numeric;
  v_base_qty numeric;
  v_unit_cost numeric;
  v_new_avg numeric;
  v_seen uuid[] := array[]::uuid[];
  v_key text := nullif(trim(p_idempotency_key),'');
begin
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then
    raise exception 'purchase_requires_items';
  end if;

  v_item := p_items->0;
  v_item_id := nullif(v_item->>'inventory_item_id','')::uuid;

  select i.business_id into v_business_id
  from public.inventory_items i
  where i.id=v_item_id and i.active=true;

  if v_business_id is null
     or not private.has_business_permission(
       v_business_id,'manage_purchases',array['owner','manager','stock']::text[]
     ) then
    raise exception 'inventory_item_not_found_or_forbidden';
  end if;

  if p_supplier_id is not null
     and not exists(
       select 1 from public.suppliers s
       where s.id=p_supplier_id and s.business_id=v_business_id
     ) then
    raise exception 'supplier_not_found_or_forbidden';
  end if;

  if v_key is not null then
    select p.id into v_existing
    from public.purchases p
    where p.business_id=v_business_id and p.idempotency_key=v_key;
    if v_existing is not null then return v_existing; end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := nullif(v_item->>'inventory_item_id','')::uuid;
    v_qty := nullif(v_item->>'quantity','')::numeric;
    v_unit := nullif(trim(v_item->>'unit'),'');
    v_cost := nullif(v_item->>'total_cost','')::numeric;

    if v_item_id is null or v_qty is null or v_qty <= 0
       or v_unit is null or v_cost is null or v_cost < 0 then
      raise exception 'invalid_purchase_item';
    end if;

    if v_item_id = any(v_seen) then
      raise exception 'duplicate_inventory_item_in_purchase';
    end if;
    v_seen := array_append(v_seen,v_item_id);

    if not exists(
      select 1
      from public.inventory_items i
      where i.id=v_item_id
        and i.business_id=v_business_id
        and i.active=true
    ) then
      raise exception 'inventory_item_not_found_or_forbidden';
    end if;

    v_total := v_total + v_cost;
  end loop;

  insert into public.purchases(
    business_id,supplier_id,total,payment_method,notes,idempotency_key,created_by
  )
  values(
    v_business_id,p_supplier_id,v_total,nullif(trim(p_payment_method),''),
    nullif(trim(p_notes),''),v_key,auth.uid()
  )
  returning id into v_purchase_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_item->>'inventory_item_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_unit := trim(v_item->>'unit');
    v_cost := (v_item->>'total_cost')::numeric;
    v_lot := nullif(trim(v_item->>'lot_code'),'');
    v_exp := nullif(v_item->>'expires_at','')::date;

    select
      i.base_unit,
      coalesce(nullif(trim(i.purchase_unit),''),i.base_unit),
      greatest(coalesce(i.purchase_unit_multiplier,1),0.0001),
      coalesce(i.average_unit_cost,0)
    into v_base_unit,v_purchase_unit,v_multiplier,v_old_avg
    from public.inventory_items i
    where i.id=v_item_id and i.business_id=v_business_id
    for update;

    if lower(v_unit)=lower(v_purchase_unit)
       and lower(v_purchase_unit)<>lower(v_base_unit) then
      v_base_qty := v_qty*v_multiplier;
    else
      v_base_qty := public.convert_inventory_quantity(v_qty,v_unit,v_base_unit);
    end if;

    if v_base_qty <= 0 then raise exception 'invalid_base_quantity'; end if;

    v_unit_cost := case when v_base_qty>0 then v_cost/v_base_qty else 0 end;

    select coalesce(sum(m.quantity_delta),0)
    into v_on_hand
    from public.inventory_movements m
    where m.business_id=v_business_id
      and m.inventory_item_id=v_item_id;

    v_new_avg := (
      (greatest(v_on_hand,0)*v_old_avg)+v_cost
    ) / nullif(greatest(v_on_hand,0)+v_base_qty,0);

    insert into public.purchase_items(
      business_id,purchase_id,inventory_item_id,quantity,unit,total_cost,lot_code,expires_at
    )
    values(
      v_business_id,v_purchase_id,v_item_id,v_qty,v_unit,v_cost,v_lot,v_exp
    );

    insert into public.inventory_movements(
      business_id,inventory_item_id,movement_type,quantity_delta,unit,unit_cost,
      reference_type,reference_id,notes,created_by
    )
    values(
      v_business_id,v_item_id,'PURCHASE',v_base_qty,v_base_unit,v_unit_cost,
      'purchase',v_purchase_id,'Entrada por compra',auth.uid()
    );

    update public.inventory_items
    set average_unit_cost=coalesce(v_new_avg,v_unit_cost),updated_at=now()
    where id=v_item_id and business_id=v_business_id;

    if v_lot is not null or v_exp is not null then
      insert into public.inventory_batches(
        business_id,inventory_item_id,lot_code,expires_at,received_at,
        quantity_received,quantity_remaining,unit_cost
      )
      values(
        v_business_id,v_item_id,v_lot,v_exp,current_date,
        v_base_qty,v_base_qty,v_unit_cost
      );
    end if;
  end loop;

  insert into public.financial_transactions(
    business_id,type,category,amount,status,paid_at,reference_type,reference_id,description
  )
  values(
    v_business_id,'expense','purchase',v_total,'paid',now(),
    'purchase',v_purchase_id,'Compra de insumos'
  );

  insert into public.audit_logs(
    business_id,user_id,action,entity_type,entity_id,metadata
  )
  values(
    v_business_id,auth.uid(),'purchase_recorded','purchase',v_purchase_id,
    jsonb_build_object('total',v_total,'items',jsonb_array_length(p_items))
  );

  return v_purchase_id;
end;
$$;

create or replace function public.record_order_payment(
  p_order_id uuid,
  p_amount numeric,
  p_method text,
  p_notes text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_status text;
  v_total numeric;
  v_deposit numeric;
  v_paid numeric;
  v_balance numeric;
  v_payment_id uuid;
  v_existing uuid;
  v_reservation jsonb;
  v_key text := nullif(trim(p_idempotency_key), '');
begin
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_payment_amount'; end if;
  if nullif(trim(p_method), '') is null then raise exception 'payment_method_required'; end if;

  select o.business_id,o.status,o.total,o.deposit_required
  into v_business_id,v_status,v_total,v_deposit
  from public.orders o
  where o.id=p_order_id
  for update;

  if v_business_id is null
     or not (
       private.has_business_permission(
         v_business_id,'manage_finance',array['owner','manager','finance']::text[]
       )
       or private.has_business_permission(
         v_business_id,'manage_orders',array['owner','manager','service']::text[]
       )
     ) then
    raise exception 'order_not_found_or_forbidden';
  end if;

  if v_status in ('canceled','refunded') then
    raise exception 'order_does_not_accept_payment';
  end if;

  if v_key is not null then
    select op.id into v_existing
    from public.order_payments op
    where op.business_id=v_business_id
      and op.idempotency_key=v_key;
    if v_existing is not null then
      select coalesce(sum(op.amount) filter (where op.status='paid'),0)
      into v_paid
      from public.order_payments op
      where op.order_id=p_order_id and op.business_id=v_business_id;

      return jsonb_build_object(
        'ok',true,'payment_id',v_existing,'paid',v_paid,
        'balance',greatest(v_total-v_paid,0),'duplicate',true
      );
    end if;
  end if;

  select coalesce(sum(op.amount) filter (where op.status='paid'),0)
  into v_paid
  from public.order_payments op
  where op.order_id=p_order_id and op.business_id=v_business_id;

  v_balance := greatest(v_total-v_paid,0);
  if p_amount > v_balance + 0.005 then raise exception 'payment_exceeds_balance'; end if;

  insert into public.order_payments(
    business_id,order_id,amount,method,status,paid_at,notes,idempotency_key,created_by
  )
  values(
    v_business_id,p_order_id,p_amount,trim(p_method),'paid',now(),
    nullif(trim(p_notes),''),v_key,auth.uid()
  )
  returning id into v_payment_id;

  insert into public.financial_transactions(
    business_id,type,category,amount,status,paid_at,reference_type,reference_id,description
  )
  values(
    v_business_id,'income','order_payment',p_amount,'paid',now(),
    'order_payment',v_payment_id,'Recebimento de encomenda'
  );

  v_paid := v_paid + p_amount;

  if v_status='draft' and v_deposit>0 then
    update public.orders
    set status='awaiting_deposit',updated_at=now()
    where id=p_order_id;

    insert into public.order_status_history(
      business_id,order_id,from_status,to_status,changed_by,note
    )
    values(
      v_business_id,p_order_id,'draft','awaiting_deposit',auth.uid(),'Aguardando sinal'
    );

    v_status := 'awaiting_deposit';
  end if;

  if v_status='awaiting_deposit'
     and (v_deposit<=0 or v_paid+0.005>=v_deposit) then
    select public.reserve_order_inventory(p_order_id) into v_reservation;
  end if;

  insert into public.audit_logs(
    business_id,user_id,action,entity_type,entity_id,metadata
  )
  values(
    v_business_id,auth.uid(),'payment_recorded','order',p_order_id,
    jsonb_build_object('payment_id',v_payment_id,'amount',p_amount,'method',trim(p_method))
  );

  return jsonb_build_object(
    'ok',true,
    'payment_id',v_payment_id,
    'paid',v_paid,
    'balance',greatest(v_total-v_paid,0),
    'deposit_satisfied',(v_deposit<=0 or v_paid+0.005>=v_deposit),
    'reservation',v_reservation
  );
end;
$$;

create or replace function public.refund_order_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_id uuid; v_order_id uuid; v_amount numeric; v_status text;
begin
  select op.business_id,op.order_id,op.amount,op.status
  into v_business_id,v_order_id,v_amount,v_status
  from public.order_payments op
  where op.id=p_payment_id
  for update;

  if v_business_id is null
     or not private.has_business_permission(
       v_business_id,'manage_finance',array['owner','manager','finance']::text[]
     ) then
    raise exception 'payment_not_found_or_forbidden';
  end if;

  if v_status <> 'paid' then raise exception 'payment_is_not_refundable'; end if;

  update public.order_payments
  set status='refunded'
  where id=p_payment_id;

  insert into public.financial_transactions(
    business_id,type,category,amount,status,paid_at,reference_type,reference_id,description
  )
  values(
    v_business_id,'expense','refund',v_amount,'paid',now(),
    'order_payment',p_payment_id,'Estorno de recebimento'
  );

  insert into public.audit_logs(
    business_id,user_id,action,entity_type,entity_id,metadata
  )
  values(
    v_business_id,auth.uid(),'payment_refunded','order',v_order_id,
    jsonb_build_object('payment_id',p_payment_id,'amount',v_amount)
  );

  return jsonb_build_object('ok',true,'order_id',v_order_id,'amount',v_amount);
end;
$$;

-- Restrict direct table writes by module.

-- CRM
drop policy if exists tenant_insert on public.customers;
drop policy if exists tenant_update on public.customers;
drop policy if exists tenant_delete on public.customers;
create policy customers_insert_permission on public.customers
  for insert to authenticated
  with check (private.has_business_permission(business_id,'view_customers',array['owner','manager','service']::text[]));
create policy customers_update_permission on public.customers
  for update to authenticated
  using (private.has_business_permission(business_id,'view_customers',array['owner','manager','service']::text[]))
  with check (private.has_business_permission(business_id,'view_customers',array['owner','manager','service']::text[]));
create policy customers_delete_permission on public.customers
  for delete to authenticated
  using (private.has_business_permission(business_id,'view_customers',array['owner','manager']::text[]));

-- Catalog
drop policy if exists tenant_insert on public.products;
drop policy if exists tenant_update on public.products;
drop policy if exists tenant_delete on public.products;
create policy products_insert_permission on public.products
  for insert to authenticated
  with check (private.has_business_permission(business_id,'manage_products',array['owner','manager']::text[]));
create policy products_update_permission on public.products
  for update to authenticated
  using (private.has_business_permission(business_id,'manage_products',array['owner','manager']::text[]))
  with check (private.has_business_permission(business_id,'manage_products',array['owner','manager']::text[]));
create policy products_delete_permission on public.products
  for delete to authenticated
  using (private.has_business_permission(business_id,'manage_products',array['owner','manager']::text[]));

drop policy if exists tenant_insert on public.product_variants;
drop policy if exists tenant_update on public.product_variants;
drop policy if exists tenant_delete on public.product_variants;
create policy product_variants_insert_permission on public.product_variants
  for insert to authenticated
  with check (private.has_business_permission(business_id,'manage_products',array['owner','manager']::text[]));
create policy product_variants_update_permission on public.product_variants
  for update to authenticated
  using (private.has_business_permission(business_id,'manage_products',array['owner','manager']::text[]))
  with check (private.has_business_permission(business_id,'manage_products',array['owner','manager']::text[]));
create policy product_variants_delete_permission on public.product_variants
  for delete to authenticated
  using (private.has_business_permission(business_id,'manage_products',array['owner','manager']::text[]));

drop policy if exists product_option_groups_insert on public.product_option_groups;
drop policy if exists product_option_groups_update on public.product_option_groups;
drop policy if exists product_option_groups_delete on public.product_option_groups;
create policy product_option_groups_insert_permission on public.product_option_groups
  for insert to authenticated
  with check (private.has_business_permission(business_id,'manage_products',array['owner','manager']::text[]));
create policy product_option_groups_update_permission on public.product_option_groups
  for update to authenticated
  using (private.has_business_permission(business_id,'manage_products',array['owner','manager']::text[]))
  with check (private.has_business_permission(business_id,'manage_products',array['owner','manager']::text[]));
create policy product_option_groups_delete_permission on public.product_option_groups
  for delete to authenticated
  using (private.has_business_permission(business_id,'manage_products',array['owner','manager']::text[]));

drop policy if exists product_options_insert on public.product_options;
drop policy if exists product_options_update on public.product_options;
drop policy if exists product_options_delete on public.product_options;
create policy product_options_insert_permission on public.product_options
  for insert to authenticated
  with check (private.has_business_permission(business_id,'manage_products',array['owner','manager']::text[]));
create policy product_options_update_permission on public.product_options
  for update to authenticated
  using (private.has_business_permission(business_id,'manage_products',array['owner','manager']::text[]))
  with check (private.has_business_permission(business_id,'manage_products',array['owner','manager']::text[]));
create policy product_options_delete_permission on public.product_options
  for delete to authenticated
  using (private.has_business_permission(business_id,'manage_products',array['owner','manager']::text[]));

-- Orders and quotes
drop policy if exists tenant_insert on public.orders;
drop policy if exists tenant_update on public.orders;
drop policy if exists tenant_delete on public.orders;
create policy orders_insert_permission on public.orders
  for insert to authenticated
  with check (private.has_business_permission(business_id,'manage_orders',array['owner','manager','service']::text[]));
create policy orders_update_permission on public.orders
  for update to authenticated
  using (private.has_business_permission(business_id,'manage_orders',array['owner','manager','service']::text[]))
  with check (private.has_business_permission(business_id,'manage_orders',array['owner','manager','service']::text[]));
create policy orders_delete_permission on public.orders
  for delete to authenticated
  using (private.has_business_permission(business_id,'manage_orders',array['owner','manager','service']::text[]));

drop policy if exists tenant_insert on public.order_items;
drop policy if exists tenant_update on public.order_items;
drop policy if exists tenant_delete on public.order_items;
create policy order_items_insert_permission on public.order_items
  for insert to authenticated
  with check (private.has_business_permission(business_id,'manage_orders',array['owner','manager','service']::text[]));
create policy order_items_update_permission on public.order_items
  for update to authenticated
  using (private.has_business_permission(business_id,'manage_orders',array['owner','manager','service']::text[]))
  with check (private.has_business_permission(business_id,'manage_orders',array['owner','manager','service']::text[]));
create policy order_items_delete_permission on public.order_items
  for delete to authenticated
  using (private.has_business_permission(business_id,'manage_orders',array['owner','manager','service']::text[]));

drop policy if exists tenant_insert on public.quotes;
drop policy if exists tenant_update on public.quotes;
drop policy if exists tenant_delete on public.quotes;
create policy quotes_insert_permission on public.quotes
  for insert to authenticated
  with check (private.has_business_permission(business_id,'manage_quotes',array['owner','manager','service']::text[]));
create policy quotes_update_permission on public.quotes
  for update to authenticated
  using (private.has_business_permission(business_id,'manage_quotes',array['owner','manager','service']::text[]))
  with check (private.has_business_permission(business_id,'manage_quotes',array['owner','manager','service']::text[]));
create policy quotes_delete_permission on public.quotes
  for delete to authenticated
  using (private.has_business_permission(business_id,'manage_quotes',array['owner','manager','service']::text[]));

drop policy if exists quote_items_insert on public.quote_items;
drop policy if exists quote_items_update on public.quote_items;
drop policy if exists quote_items_delete on public.quote_items;
create policy quote_items_insert_permission on public.quote_items
  for insert to authenticated
  with check (private.has_business_permission(business_id,'manage_quotes',array['owner','manager','service']::text[]));
create policy quote_items_update_permission on public.quote_items
  for update to authenticated
  using (private.has_business_permission(business_id,'manage_quotes',array['owner','manager','service']::text[]))
  with check (private.has_business_permission(business_id,'manage_quotes',array['owner','manager','service']::text[]));
create policy quote_items_delete_permission on public.quote_items
  for delete to authenticated
  using (private.has_business_permission(business_id,'manage_quotes',array['owner','manager','service']::text[]));

-- Purchasing and stock
drop policy if exists tenant_insert on public.suppliers;
drop policy if exists tenant_update on public.suppliers;
drop policy if exists tenant_delete on public.suppliers;
create policy suppliers_insert_permission on public.suppliers
  for insert to authenticated
  with check (private.has_business_permission(business_id,'manage_purchases',array['owner','manager','stock']::text[]));
create policy suppliers_update_permission on public.suppliers
  for update to authenticated
  using (private.has_business_permission(business_id,'manage_purchases',array['owner','manager','stock']::text[]))
  with check (private.has_business_permission(business_id,'manage_purchases',array['owner','manager','stock']::text[]));
create policy suppliers_delete_permission on public.suppliers
  for delete to authenticated
  using (private.has_business_permission(business_id,'manage_purchases',array['owner','manager','stock']::text[]));

drop policy if exists tenant_insert on public.purchases;
drop policy if exists tenant_update on public.purchases;
drop policy if exists tenant_delete on public.purchases;
create policy purchases_insert_permission on public.purchases
  for insert to authenticated
  with check (private.has_business_permission(business_id,'manage_purchases',array['owner','manager','stock']::text[]));
create policy purchases_update_permission on public.purchases
  for update to authenticated
  using (private.has_business_permission(business_id,'manage_purchases',array['owner','manager','stock']::text[]))
  with check (private.has_business_permission(business_id,'manage_purchases',array['owner','manager','stock']::text[]));
create policy purchases_delete_permission on public.purchases
  for delete to authenticated
  using (private.has_business_permission(business_id,'manage_purchases',array['owner','manager','stock']::text[]));

drop policy if exists tenant_insert on public.purchase_items;
drop policy if exists tenant_update on public.purchase_items;
drop policy if exists tenant_delete on public.purchase_items;
create policy purchase_items_insert_permission on public.purchase_items
  for insert to authenticated
  with check (private.has_business_permission(business_id,'manage_purchases',array['owner','manager','stock']::text[]));
create policy purchase_items_update_permission on public.purchase_items
  for update to authenticated
  using (private.has_business_permission(business_id,'manage_purchases',array['owner','manager','stock']::text[]))
  with check (private.has_business_permission(business_id,'manage_purchases',array['owner','manager','stock']::text[]));
create policy purchase_items_delete_permission on public.purchase_items
  for delete to authenticated
  using (private.has_business_permission(business_id,'manage_purchases',array['owner','manager','stock']::text[]));

drop policy if exists tenant_insert on public.inventory_items;
drop policy if exists tenant_update on public.inventory_items;
drop policy if exists tenant_delete on public.inventory_items;
create policy inventory_items_insert_permission on public.inventory_items
  for insert to authenticated
  with check (private.has_business_permission(business_id,'adjust_stock',array['owner','manager','stock']::text[]));
create policy inventory_items_update_permission on public.inventory_items
  for update to authenticated
  using (private.has_business_permission(business_id,'adjust_stock',array['owner','manager','stock']::text[]))
  with check (private.has_business_permission(business_id,'adjust_stock',array['owner','manager','stock']::text[]));
create policy inventory_items_delete_permission on public.inventory_items
  for delete to authenticated
  using (private.has_business_permission(business_id,'adjust_stock',array['owner','manager','stock']::text[]));

drop policy if exists tenant_insert on public.inventory_movements;
drop policy if exists tenant_update on public.inventory_movements;
drop policy if exists tenant_delete on public.inventory_movements;
create policy inventory_movements_insert_permission on public.inventory_movements
  for insert to authenticated
  with check (private.has_business_permission(business_id,'adjust_stock',array['owner','manager','stock']::text[]));
create policy inventory_movements_update_permission on public.inventory_movements
  for update to authenticated
  using (private.has_business_permission(business_id,'adjust_stock',array['owner','manager','stock']::text[]))
  with check (private.has_business_permission(business_id,'adjust_stock',array['owner','manager','stock']::text[]));
create policy inventory_movements_delete_permission on public.inventory_movements
  for delete to authenticated
  using (private.has_business_permission(business_id,'adjust_stock',array['owner','manager','stock']::text[]));

drop policy if exists tenant_insert on public.inventory_batches;
drop policy if exists tenant_update on public.inventory_batches;
drop policy if exists tenant_delete on public.inventory_batches;
create policy inventory_batches_insert_permission on public.inventory_batches
  for insert to authenticated
  with check (private.has_business_permission(business_id,'adjust_stock',array['owner','manager','stock']::text[]));
create policy inventory_batches_update_permission on public.inventory_batches
  for update to authenticated
  using (private.has_business_permission(business_id,'adjust_stock',array['owner','manager','stock']::text[]))
  with check (private.has_business_permission(business_id,'adjust_stock',array['owner','manager','stock']::text[]));
create policy inventory_batches_delete_permission on public.inventory_batches
  for delete to authenticated
  using (private.has_business_permission(business_id,'adjust_stock',array['owner','manager','stock']::text[]));

-- Production, reservations, payments and history become RPC-only for writes.
drop policy if exists tenant_insert on public.production_orders;
drop policy if exists tenant_update on public.production_orders;
drop policy if exists tenant_delete on public.production_orders;

drop policy if exists tenant_insert on public.production_steps;
drop policy if exists tenant_update on public.production_steps;
drop policy if exists tenant_delete on public.production_steps;

drop policy if exists tenant_insert on public.inventory_reservations;
drop policy if exists tenant_update on public.inventory_reservations;
drop policy if exists tenant_delete on public.inventory_reservations;

drop policy if exists order_payments_insert_roles on public.order_payments;
drop policy if exists order_payments_update_roles on public.order_payments;
drop policy if exists order_payments_delete_roles on public.order_payments;

drop policy if exists order_status_history_insert on public.order_status_history;

drop policy if exists financial_transactions_insert_roles on public.financial_transactions;
drop policy if exists financial_transactions_update_roles on public.financial_transactions;
drop policy if exists financial_transactions_delete_roles on public.financial_transactions;

-- Finance reads/writes.
drop policy if exists tenant_select on public.expenses;
drop policy if exists expenses_insert_roles on public.expenses;
drop policy if exists expenses_update_roles on public.expenses;
drop policy if exists expenses_delete_roles on public.expenses;
create policy expenses_select_permission on public.expenses
  for select to authenticated
  using (
    private.has_business_permission(business_id,'manage_finance',array['owner','manager','finance']::text[])
    or private.has_business_permission(business_id,'view_revenue',array['owner','manager','finance']::text[])
  );
create policy expenses_insert_permission on public.expenses
  for insert to authenticated
  with check (private.has_business_permission(business_id,'manage_finance',array['owner','manager','finance']::text[]));
create policy expenses_update_permission on public.expenses
  for update to authenticated
  using (private.has_business_permission(business_id,'manage_finance',array['owner','manager','finance']::text[]))
  with check (private.has_business_permission(business_id,'manage_finance',array['owner','manager','finance']::text[]));
create policy expenses_delete_permission on public.expenses
  for delete to authenticated
  using (private.has_business_permission(business_id,'manage_finance',array['owner','manager','finance']::text[]));

drop policy if exists tenant_select on public.financial_transactions;
create policy financial_transactions_select_permission on public.financial_transactions
  for select to authenticated
  using (
    private.has_business_permission(business_id,'manage_finance',array['owner','manager','finance']::text[])
    or private.has_business_permission(business_id,'view_revenue',array['owner','manager','finance']::text[])
  );

drop policy if exists tenant_select on public.order_payments;
create policy order_payments_select_permission on public.order_payments
  for select to authenticated
  using (
    private.has_business_permission(business_id,'manage_finance',array['owner','manager','finance']::text[])
    or private.has_business_permission(business_id,'manage_orders',array['owner','manager','service']::text[])
  );

-- Audit log is append-only for members.
drop policy if exists tenant_update on public.audit_logs;
drop policy if exists tenant_delete on public.audit_logs;

-- Recipe access log should only be written by the owner-side Cofre flow.
drop policy if exists tenant_insert on public.recipe_access_logs;
create policy recipe_access_logs_owner_insert on public.recipe_access_logs
  for insert to authenticated
  with check (private.is_business_owner(business_id));

-- Explicit RPC execute grants after recreation.
do $$
declare fn regprocedure;
begin
  foreach fn in array array[
    'public.cancel_order_and_release(uuid)'::regprocedure,
    'public.finish_order_production(uuid)'::regprocedure,
    'public.toggle_production_step(uuid,boolean)'::regprocedure,
    'public.set_production_actual_qty(uuid,numeric)'::regprocedure,
    'public.mark_order_out_for_delivery(uuid)'::regprocedure,
    'public.complete_order_fulfillment(uuid)'::regprocedure,
    'public.record_inventory_loss(uuid,numeric,text,text)'::regprocedure,
    'public.apply_inventory_count(jsonb,text)'::regprocedure,
    'public.record_manual_expense(uuid,text,text,numeric,date,text)'::regprocedure,
    'public.record_inventory_purchase_batch(uuid,jsonb,text,text,text)'::regprocedure,
    'public.record_order_payment(uuid,numeric,text,text,text)'::regprocedure,
    'public.refund_order_payment(uuid)'::regprocedure
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
