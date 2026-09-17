create or replace function private.normalize_order_initial_status()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='draft' and coalesce(new.deposit_required,0)>0 then
    new.status:='awaiting_deposit';
  end if;
  return new;
end;
$$;
revoke all on function private.normalize_order_initial_status() from public,anon,authenticated;
grant execute on function private.normalize_order_initial_status() to service_role;

drop trigger if exists trg_normalize_order_initial_status on public.orders;
create trigger trg_normalize_order_initial_status
before insert on public.orders
for each row execute function private.normalize_order_initial_status();
