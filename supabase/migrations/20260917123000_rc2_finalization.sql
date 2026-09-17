-- RC2 finalization: quote fulfillment/deposit + stock count + fulfillment RPCs

alter table public.quotes
  add column if not exists fulfillment_type text not null default 'pickup',
  add column if not exists deposit_required numeric not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.quotes'::regclass
      and conname='quotes_fulfillment_type_check'
  ) then
    alter table public.quotes
      add constraint quotes_fulfillment_type_check
      check (fulfillment_type in ('pickup','delivery'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.quotes'::regclass
      and conname='quotes_deposit_required_check'
  ) then
    alter table public.quotes
      add constraint quotes_deposit_required_check
      check (deposit_required >= 0);
  end if;
end $$;

create index if not exists idx_quotes_business_status_desired
  on public.quotes(business_id,status,desired_at);

create or replace function public.apply_inventory_count(
  p_counts jsonb,
  p_note text default 'Conferência de estoque'
)
returns jsonb
language plpgsql
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
       or not private.has_business_role(v_business_id,array['owner','manager','stock']::text[]) then
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
      ) values (
        v_business_id,v_item_id,'INVENTORY_ADJUSTMENT',v_delta,v_base_unit,
        'inventory_count',coalesce(nullif(trim(p_note),''),'Conferência de estoque'),auth.uid()
      );
      v_adjusted := v_adjusted+1;
    end if;
  end loop;

  return jsonb_build_object('ok',true,'adjusted',v_adjusted);
end;
$$;

revoke all on function public.apply_inventory_count(jsonb,text) from public, anon;
grant execute on function public.apply_inventory_count(jsonb,text) to authenticated;

create or replace function public.mark_order_out_for_delivery(p_order_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_status text;
  v_fulfillment text;
begin
  select o.business_id,o.status,o.fulfillment_type
    into v_business_id,v_status,v_fulfillment
  from public.orders o
  where o.id=p_order_id
  for update;

  if v_business_id is null
     or not private.has_business_role(v_business_id,array['owner','manager','service']::text[]) then
    raise exception 'order_not_found_or_forbidden';
  end if;
  if v_fulfillment <> 'delivery' then raise exception 'order_is_not_delivery'; end if;
  if v_status <> 'ready' then raise exception 'order_is_not_ready'; end if;

  update public.orders set status='out_for_delivery',updated_at=now() where id=p_order_id;
  insert into public.order_status_history(
    business_id,order_id,from_status,to_status,changed_by,note
  ) values (
    v_business_id,p_order_id,'ready','out_for_delivery',auth.uid(),'Pedido saiu para entrega'
  );
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.complete_order_fulfillment(p_order_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_status text;
  v_fulfillment text;
begin
  select o.business_id,o.status,o.fulfillment_type
    into v_business_id,v_status,v_fulfillment
  from public.orders o
  where o.id=p_order_id
  for update;

  if v_business_id is null
     or not private.has_business_role(v_business_id,array['owner','manager','service']::text[]) then
    raise exception 'order_not_found_or_forbidden';
  end if;

  if v_fulfillment='delivery' and v_status <> 'out_for_delivery' then
    raise exception 'delivery_must_be_out_for_delivery_before_completion';
  end if;
  if v_fulfillment='pickup' and v_status <> 'ready' then
    raise exception 'pickup_order_is_not_ready';
  end if;

  update public.orders set status='completed',updated_at=now() where id=p_order_id;
  insert into public.order_status_history(
    business_id,order_id,from_status,to_status,changed_by,note
  ) values (
    v_business_id,p_order_id,v_status,'completed',auth.uid(),
    case when v_fulfillment='delivery' then 'Entrega concluída' else 'Pedido retirado' end
  );
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.mark_order_out_for_delivery(uuid) from public, anon;
grant execute on function public.mark_order_out_for_delivery(uuid) to authenticated;
revoke all on function public.complete_order_fulfillment(uuid) from public, anon;
grant execute on function public.complete_order_fulfillment(uuid) to authenticated;
