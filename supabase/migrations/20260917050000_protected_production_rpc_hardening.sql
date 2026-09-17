-- Reservation and production must be able to calculate owner-protected recipe rows
-- for authorized business members without granting those members SELECT on the Cofre tables.
-- The RPCs run with definer rights, but both perform an explicit tenant-membership check first.
alter function public.reserve_order_inventory(uuid) security definer;
alter function public.reserve_order_inventory(uuid) set search_path = '';

alter function public.start_order_production(uuid) security definer;
alter function public.start_order_production(uuid) set search_path = '';

revoke all on function public.reserve_order_inventory(uuid) from public, anon;
revoke all on function public.start_order_production(uuid) from public, anon;
grant execute on function public.reserve_order_inventory(uuid) to authenticated, service_role;
grant execute on function public.start_order_production(uuid) to authenticated, service_role;
