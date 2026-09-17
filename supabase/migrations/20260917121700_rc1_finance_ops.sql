alter table public.expenses add column if not exists idempotency_key text, add column if not exists created_by uuid references auth.users(id) on delete set null;
create unique index if not exists expenses_business_idempotency_uk on public.expenses(business_id,idempotency_key) where idempotency_key is not null;

drop policy if exists tenant_insert on public.expenses;
drop policy if exists tenant_update on public.expenses;
drop policy if exists tenant_delete on public.expenses;
create policy expenses_insert_roles on public.expenses for insert to authenticated with check (private.has_business_role(business_id,array['owner','manager','finance']::text[]));
create policy expenses_update_roles on public.expenses for update to authenticated using (private.has_business_role(business_id,array['owner','manager','finance']::text[])) with check (private.has_business_role(business_id,array['owner','manager','finance']::text[]));
create policy expenses_delete_roles on public.expenses for delete to authenticated using (private.has_business_role(business_id,array['owner','manager','finance']::text[]));

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
security invoker
set search_path=''
as $$
declare v_expense_id uuid; v_existing uuid; v_key text := nullif(trim(p_idempotency_key),'');
begin
  if not private.has_business_role(p_business_id,array['owner','manager','finance']::text[]) then raise exception 'business_forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_expense_amount'; end if;
  if nullif(trim(p_description),'') is null then raise exception 'expense_description_required'; end if;
  if v_key is not null then
    select id into v_existing from public.expenses where business_id=p_business_id and idempotency_key=v_key;
    if v_existing is not null then return v_existing; end if;
  end if;
  insert into public.expenses(business_id,category,description,amount,occurred_at,idempotency_key,created_by)
  values(p_business_id,coalesce(nullif(trim(p_category),''),'outros'),trim(p_description),p_amount,coalesce(p_occurred_at,current_date),v_key,auth.uid())
  returning id into v_expense_id;
  insert into public.financial_transactions(business_id,type,category,amount,status,paid_at,reference_type,reference_id,description)
  values(p_business_id,'expense',coalesce(nullif(trim(p_category),''),'outros'),p_amount,'paid',now(),'expense',v_expense_id,trim(p_description));
  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,metadata)
  values(p_business_id,auth.uid(),'expense_recorded','expense',v_expense_id,jsonb_build_object('amount',p_amount,'category',p_category));
  return v_expense_id;
end;
$$;
revoke all on function public.record_manual_expense(uuid,text,text,numeric,date,text) from public,anon;
grant execute on function public.record_manual_expense(uuid,text,text,numeric,date,text) to authenticated,service_role;
