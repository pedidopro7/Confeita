-- Keep privileged recipe/stock calculations out of the exposed API schema.
-- Public RPCs remain SECURITY INVOKER and only forward to private implementations.

alter function public.reserve_order_inventory(uuid) set schema private;
alter function private.reserve_order_inventory(uuid) rename to reserve_order_inventory_internal;
alter function private.reserve_order_inventory_internal(uuid) security definer;
alter function private.reserve_order_inventory_internal(uuid) set search_path = '';

alter function public.start_order_production(uuid) set schema private;
alter function private.start_order_production(uuid) rename to start_order_production_internal;
alter function private.start_order_production_internal(uuid) security definer;
alter function private.start_order_production_internal(uuid) set search_path = '';

revoke all on function private.reserve_order_inventory_internal(uuid) from public, anon;
revoke all on function private.start_order_production_internal(uuid) from public, anon;
grant execute on function private.reserve_order_inventory_internal(uuid) to authenticated, service_role;
grant execute on function private.start_order_production_internal(uuid) to authenticated, service_role;

create or replace function public.reserve_order_inventory(p_order_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.reserve_order_inventory_internal(p_order_id);
$$;

create or replace function public.start_order_production(p_order_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.start_order_production_internal(p_order_id);
$$;

revoke all on function public.reserve_order_inventory(uuid) from public, anon;
revoke all on function public.start_order_production(uuid) from public, anon;
grant execute on function public.reserve_order_inventory(uuid) to authenticated, service_role;
grant execute on function public.start_order_production(uuid) to authenticated, service_role;
