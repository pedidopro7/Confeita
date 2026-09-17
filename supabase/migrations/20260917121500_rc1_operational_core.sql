-- Confeita RC1 operational core

alter table public.customers
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists restrictions text,
  add column if not exists preferences text;

alter table public.order_payments
  add column if not exists idempotency_key text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create unique index if not exists order_payments_business_idempotency_uk
  on public.order_payments (business_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists order_payments_order_paid_idx
  on public.order_payments (business_id, order_id, status, paid_at desc);

alter table public.purchases
  add column if not exists idempotency_key text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create unique index if not exists purchases_business_idempotency_uk
  on public.purchases (business_id, idempotency_key)
  where idempotency_key is not null;

drop policy if exists tenant_insert on public.order_payments;
drop policy if exists tenant_update on public.order_payments;
drop policy if exists tenant_delete on public.order_payments;
create policy order_payments_insert_roles on public.order_payments
  for insert to authenticated
  with check (private.has_business_role(business_id, array['owner','manager','finance','service']::text[]));
create policy order_payments_update_roles on public.order_payments
  for update to authenticated
  using (private.has_business_role(business_id, array['owner','manager','finance']::text[]))
  with check (private.has_business_role(business_id, array['owner','manager','finance']::text[]));
create policy order_payments_delete_roles on public.order_payments
  for delete to authenticated
  using (private.has_business_role(business_id, array['owner','manager','finance']::text[]));

drop policy if exists tenant_insert on public.financial_transactions;
drop policy if exists tenant_update on public.financial_transactions;
drop policy if exists tenant_delete on public.financial_transactions;
create policy financial_transactions_insert_roles on public.financial_transactions
  for insert to authenticated
  with check (private.has_business_role(business_id, array['owner','manager','finance','service','stock']::text[]));
create policy financial_transactions_update_roles on public.financial_transactions
  for update to authenticated
  using (private.has_business_role(business_id, array['owner','manager','finance']::text[]))
  with check (private.has_business_role(business_id, array['owner','manager','finance']::text[]));
create policy financial_transactions_delete_roles on public.financial_transactions
  for delete to authenticated
  using (private.has_business_role(business_id, array['owner','manager','finance']::text[]));

create or replace view public.order_financial_summary
with (security_invoker = true)
as
select
  o.business_id,
  o.id as order_id,
  o.total,
  o.deposit_required,
  coalesce(sum(op.amount) filter (where op.status = 'paid'), 0)::numeric(14,2) as paid,
  greatest(o.total - coalesce(sum(op.amount) filter (where op.status = 'paid'), 0), 0)::numeric(14,2) as balance,
  case
    when coalesce(sum(op.amount) filter (where op.status = 'paid'), 0) <= 0 then 'unpaid'
    when coalesce(sum(op.amount) filter (where op.status = 'paid'), 0) + 0.005 >= o.total then 'paid'
    else 'partial'
  end as payment_status,
  case
    when o.deposit_required <= 0 then true
    else coalesce(sum(op.amount) filter (where op.status = 'paid'), 0) + 0.005 >= o.deposit_required
  end as deposit_satisfied
from public.orders o
left join public.order_payments op
  on op.order_id = o.id and op.business_id = o.business_id
group by o.business_id, o.id, o.total, o.deposit_required;

revoke all on public.order_financial_summary from anon;
grant select on public.order_financial_summary to authenticated, service_role;

create or replace function public.record_order_payment(
  p_order_id uuid,
  p_amount numeric,
  p_method text,
  p_notes text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
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

  select o.business_id, o.status, o.total, o.deposit_required
  into v_business_id, v_status, v_total, v_deposit
  from public.orders o
  where o.id = p_order_id
  for update;

  if v_business_id is null or not private.has_business_role(v_business_id, array['owner','manager','finance','service']::text[]) then
    raise exception 'order_not_found_or_forbidden';
  end if;
  if v_status in ('canceled','refunded') then raise exception 'order_does_not_accept_payment'; end if;

  if v_key is not null then
    select op.id into v_existing
    from public.order_payments op
    where op.business_id = v_business_id and op.idempotency_key = v_key;
    if v_existing is not null then
      select coalesce(sum(amount) filter (where status='paid'),0) into v_paid
      from public.order_payments where order_id=p_order_id and business_id=v_business_id;
      return jsonb_build_object('ok',true,'payment_id',v_existing,'paid',v_paid,'balance',greatest(v_total-v_paid,0),'duplicate',true);
    end if;
  end if;

  select coalesce(sum(op.amount) filter (where op.status='paid'),0)
  into v_paid
  from public.order_payments op
  where op.order_id = p_order_id and op.business_id = v_business_id;

  v_balance := greatest(v_total - v_paid, 0);
  if p_amount > v_balance + 0.005 then raise exception 'payment_exceeds_balance'; end if;

  insert into public.order_payments (
    business_id, order_id, amount, method, status, paid_at, notes, idempotency_key, created_by
  ) values (
    v_business_id, p_order_id, p_amount, trim(p_method), 'paid', now(), nullif(trim(p_notes),''), v_key, auth.uid()
  ) returning id into v_payment_id;

  insert into public.financial_transactions (
    business_id, type, category, amount, status, paid_at, reference_type, reference_id, description
  ) values (
    v_business_id, 'income', 'order_payment', p_amount, 'paid', now(), 'order_payment', v_payment_id,
    'Recebimento de encomenda'
  );

  v_paid := v_paid + p_amount;

  if v_status = 'draft' and v_deposit > 0 then
    update public.orders set status='awaiting_deposit', updated_at=now() where id=p_order_id;
    insert into public.order_status_history (business_id,order_id,from_status,to_status,changed_by,note)
    values (v_business_id,p_order_id,'draft','awaiting_deposit',auth.uid(),'Aguardando sinal');
    v_status := 'awaiting_deposit';
  end if;

  if v_status = 'awaiting_deposit' and (v_deposit <= 0 or v_paid + 0.005 >= v_deposit) then
    select public.reserve_order_inventory(p_order_id) into v_reservation;
  end if;

  insert into public.audit_logs (business_id,user_id,action,entity_type,entity_id,metadata)
  values (v_business_id,auth.uid(),'payment_recorded','order',p_order_id,
    jsonb_build_object('payment_id',v_payment_id,'amount',p_amount,'method',trim(p_method)));

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'paid', v_paid,
    'balance', greatest(v_total-v_paid,0),
    'deposit_satisfied', (v_deposit <= 0 or v_paid + 0.005 >= v_deposit),
    'reservation', v_reservation
  );
end;
$$;

revoke all on function public.record_order_payment(uuid,numeric,text,text,text) from public, anon;
grant execute on function public.record_order_payment(uuid,numeric,text,text,text) to authenticated, service_role;

create or replace function public.refund_order_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_order_id uuid;
  v_amount numeric;
  v_status text;
begin
  select business_id,order_id,amount,status into v_business_id,v_order_id,v_amount,v_status
  from public.order_payments where id=p_payment_id for update;

  if v_business_id is null or not private.has_business_role(v_business_id,array['owner','manager','finance']::text[]) then
    raise exception 'payment_not_found_or_forbidden';
  end if;
  if v_status <> 'paid' then raise exception 'payment_is_not_refundable'; end if;

  update public.order_payments set status='refunded' where id=p_payment_id;
  insert into public.financial_transactions (
    business_id,type,category,amount,status,paid_at,reference_type,reference_id,description
  ) values (
    v_business_id,'expense','refund',v_amount,'paid',now(),'order_payment',p_payment_id,'Estorno de recebimento'
  );
  insert into public.audit_logs (business_id,user_id,action,entity_type,entity_id,metadata)
  values (v_business_id,auth.uid(),'payment_refunded','order',v_order_id,jsonb_build_object('payment_id',p_payment_id,'amount',v_amount));
  return jsonb_build_object('ok',true,'order_id',v_order_id,'amount',v_amount);
end;
$$;

revoke all on function public.refund_order_payment(uuid) from public, anon;
grant execute on function public.refund_order_payment(uuid) to authenticated, service_role;

create or replace function public.record_inventory_purchase_batch(
  p_supplier_id uuid,
  p_items jsonb,
  p_payment_method text default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security invoker
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
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then
    raise exception 'purchase_requires_items';
  end if;

  v_item := p_items->0;
  v_item_id := nullif(v_item->>'inventory_item_id','')::uuid;
  select i.business_id into v_business_id from public.inventory_items i where i.id=v_item_id and i.active=true;
  if v_business_id is null or not private.has_business_role(v_business_id,array['owner','manager','stock']::text[]) then
    raise exception 'inventory_item_not_found_or_forbidden';
  end if;

  if p_supplier_id is not null and not exists(select 1 from public.suppliers s where s.id=p_supplier_id and s.business_id=v_business_id) then
    raise exception 'supplier_not_found_or_forbidden';
  end if;

  if v_key is not null then
    select id into v_existing from public.purchases where business_id=v_business_id and idempotency_key=v_key;
    if v_existing is not null then return v_existing; end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := nullif(v_item->>'inventory_item_id','')::uuid;
    v_qty := nullif(v_item->>'quantity','')::numeric;
    v_unit := nullif(trim(v_item->>'unit'),'');
    v_cost := nullif(v_item->>'total_cost','')::numeric;
    if v_item_id is null or v_qty is null or v_qty <= 0 or v_unit is null or v_cost is null or v_cost < 0 then
      raise exception 'invalid_purchase_item';
    end if;
    if v_item_id = any(v_seen) then raise exception 'duplicate_inventory_item_in_purchase'; end if;
    v_seen := array_append(v_seen,v_item_id);
    if not exists(select 1 from public.inventory_items i where i.id=v_item_id and i.business_id=v_business_id and i.active=true) then
      raise exception 'inventory_item_not_found_or_forbidden';
    end if;
    v_total := v_total + v_cost;
  end loop;

  insert into public.purchases (business_id,supplier_id,total,payment_method,notes,idempotency_key,created_by)
  values (v_business_id,p_supplier_id,v_total,nullif(trim(p_payment_method),''),nullif(trim(p_notes),''),v_key,auth.uid())
  returning id into v_purchase_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_item->>'inventory_item_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_unit := trim(v_item->>'unit');
    v_cost := (v_item->>'total_cost')::numeric;
    v_lot := nullif(trim(v_item->>'lot_code'),'');
    v_exp := nullif(v_item->>'expires_at','')::date;

    select i.base_unit,coalesce(nullif(trim(i.purchase_unit),''),i.base_unit),greatest(coalesce(i.purchase_unit_multiplier,1),0.0001),coalesce(i.average_unit_cost,0)
    into v_base_unit,v_purchase_unit,v_multiplier,v_old_avg
    from public.inventory_items i where i.id=v_item_id and i.business_id=v_business_id for update;

    if lower(v_unit)=lower(v_purchase_unit) and lower(v_purchase_unit)<>lower(v_base_unit) then
      v_base_qty := v_qty*v_multiplier;
    else
      v_base_qty := public.convert_inventory_quantity(v_qty,v_unit,v_base_unit);
    end if;
    if v_base_qty <= 0 then raise exception 'invalid_base_quantity'; end if;
    v_unit_cost := case when v_base_qty>0 then v_cost/v_base_qty else 0 end;

    select coalesce(sum(m.quantity_delta),0) into v_on_hand
    from public.inventory_movements m
    where m.business_id=v_business_id and m.inventory_item_id=v_item_id;

    v_new_avg := ((greatest(v_on_hand,0)*v_old_avg)+v_cost)/nullif(greatest(v_on_hand,0)+v_base_qty,0);

    insert into public.purchase_items (business_id,purchase_id,inventory_item_id,quantity,unit,total_cost,lot_code,expires_at)
    values (v_business_id,v_purchase_id,v_item_id,v_qty,v_unit,v_cost,v_lot,v_exp);

    insert into public.inventory_movements (business_id,inventory_item_id,movement_type,quantity_delta,unit,unit_cost,reference_type,reference_id,notes,created_by)
    values (v_business_id,v_item_id,'PURCHASE',v_base_qty,v_base_unit,v_unit_cost,'purchase',v_purchase_id,'Entrada por compra',auth.uid());

    update public.inventory_items
      set average_unit_cost=coalesce(v_new_avg,v_unit_cost),updated_at=now()
      where id=v_item_id and business_id=v_business_id;

    if v_lot is not null or v_exp is not null then
      insert into public.inventory_batches (business_id,inventory_item_id,lot_code,expires_at,received_at,quantity_received,quantity_remaining,unit_cost)
      values (v_business_id,v_item_id,v_lot,v_exp,current_date,v_base_qty,v_base_qty,v_unit_cost);
    end if;
  end loop;

  insert into public.financial_transactions (business_id,type,category,amount,status,paid_at,reference_type,reference_id,description)
  values (v_business_id,'expense','purchase',v_total,'paid',now(),'purchase',v_purchase_id,'Compra de insumos');

  insert into public.audit_logs (business_id,user_id,action,entity_type,entity_id,metadata)
  values (v_business_id,auth.uid(),'purchase_recorded','purchase',v_purchase_id,jsonb_build_object('total',v_total,'items',jsonb_array_length(p_items)));

  return v_purchase_id;
end;
$$;

revoke all on function public.record_inventory_purchase_batch(uuid,jsonb,text,text,text) from public, anon;
grant execute on function public.record_inventory_purchase_batch(uuid,jsonb,text,text,text) to authenticated, service_role;

create or replace function private.seed_production_steps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists(select 1 from public.production_steps ps where ps.production_order_id=new.id) then
    insert into public.production_steps (business_id,production_order_id,title,sort_order)
    values
      (new.business_id,new.id,'Preparar',10),
      (new.business_id,new.id,'Produzir',20),
      (new.business_id,new.id,'Montar / finalizar',30),
      (new.business_id,new.id,'Decorar',40),
      (new.business_id,new.id,'Embalar',50),
      (new.business_id,new.id,'Conferir',60);
  end if;
  return new;
end;
$$;
revoke all on function private.seed_production_steps() from public, anon, authenticated;
grant execute on function private.seed_production_steps() to service_role;

drop trigger if exists trg_seed_production_steps on public.production_orders;
create trigger trg_seed_production_steps
after insert on public.production_orders
for each row execute function private.seed_production_steps();

insert into public.production_steps (business_id,production_order_id,title,sort_order)
select po.business_id,po.id,v.title,v.sort_order
from public.production_orders po
cross join (values ('Preparar',10),('Produzir',20),('Montar / finalizar',30),('Decorar',40),('Embalar',50),('Conferir',60)) as v(title,sort_order)
where not exists(select 1 from public.production_steps ps where ps.production_order_id=po.id);

create or replace function public.toggle_production_step(p_step_id uuid,p_completed boolean)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare v_business_id uuid; v_order_id uuid;
begin
  select ps.business_id,po.order_id into v_business_id,v_order_id
  from public.production_steps ps
  join public.production_orders po on po.id=ps.production_order_id
  where ps.id=p_step_id;
  if v_business_id is null or not private.has_business_role(v_business_id,array['owner','manager','production']::text[]) then
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
revoke all on function public.toggle_production_step(uuid,boolean) from public,anon;
grant execute on function public.toggle_production_step(uuid,boolean) to authenticated,service_role;

create or replace function public.set_production_actual_qty(p_production_order_id uuid,p_actual_qty numeric)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare v_business_id uuid; v_planned numeric; v_order_id uuid;
begin
  if p_actual_qty is null or p_actual_qty < 0 then raise exception 'invalid_actual_quantity'; end if;
  select business_id,planned_qty,order_id into v_business_id,v_planned,v_order_id
  from public.production_orders where id=p_production_order_id for update;
  if v_business_id is null or not private.has_business_role(v_business_id,array['owner','manager','production']::text[]) then
    raise exception 'production_order_not_found_or_forbidden';
  end if;
  update public.production_orders set actual_qty=p_actual_qty,updated_at=now() where id=p_production_order_id;
  insert into public.audit_logs (business_id,user_id,action,entity_type,entity_id,metadata)
  values (v_business_id,auth.uid(),'production_yield_recorded','production_order',p_production_order_id,
    jsonb_build_object('planned_qty',v_planned,'actual_qty',p_actual_qty,'difference',p_actual_qty-v_planned));
  return jsonb_build_object('ok',true,'order_id',v_order_id,'difference',p_actual_qty-v_planned);
end;
$$;
revoke all on function public.set_production_actual_qty(uuid,numeric) from public,anon;
grant execute on function public.set_production_actual_qty(uuid,numeric) to authenticated,service_role;

create or replace view public.customer_metrics
with (security_invoker = true)
as
select
  c.business_id,
  c.id as customer_id,
  count(o.id) filter (where o.status not in ('canceled','refunded'))::int as order_count,
  coalesce(sum(o.total) filter (where o.status not in ('canceled','refunded')),0)::numeric(14,2) as revenue,
  coalesce(avg(o.total) filter (where o.status not in ('canceled','refunded')),0)::numeric(14,2) as average_ticket,
  max(o.scheduled_at) filter (where o.status not in ('canceled','refunded')) as last_order_at
from public.customers c
left join public.orders o on o.customer_id=c.id and o.business_id=c.business_id
group by c.business_id,c.id;
revoke all on public.customer_metrics from anon;
grant select on public.customer_metrics to authenticated,service_role;

create or replace view public.supplier_price_history
with (security_invoker = true)
as
select
  p.business_id,
  p.supplier_id,
  pi.inventory_item_id,
  i.name as item_name,
  p.purchased_at,
  pi.quantity,
  pi.unit,
  pi.total_cost,
  case when pi.quantity>0 then pi.total_cost/pi.quantity else 0 end as purchase_unit_price
from public.purchases p
join public.purchase_items pi on pi.purchase_id=p.id and pi.business_id=p.business_id
join public.inventory_items i on i.id=pi.inventory_item_id and i.business_id=pi.business_id;
revoke all on public.supplier_price_history from anon;
grant select on public.supplier_price_history to authenticated,service_role;

create or replace view public.subscription_access_summary
with (security_invoker = true)
as
select
  s.business_id,
  s.plan_code,
  s.status,
  s.trial_ends_at,
  s.current_period_end,
  s.cancel_at_period_end,
  case
    when s.status='trialing' and (s.trial_ends_at is null or s.trial_ends_at>now()) then 'write'
    when s.status='active' then 'write'
    when s.status='grace_period' then 'write'
    when s.status in ('past_due','canceled','suspended') then 'read_only'
    else 'read_only'
  end as access_mode
from public.subscriptions s;
revoke all on public.subscription_access_summary from anon;
grant select on public.subscription_access_summary to authenticated,service_role;

create index if not exists notifications_unread_idx on public.notifications (business_id,user_id,created_at desc) where read_at is null;
create index if not exists customer_tags_gin_idx on public.customers using gin(tags);
