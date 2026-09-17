-- Keep SECURITY DEFINER helpers outside the exposed public API schema.
-- Existing RLS policies keep pointing to the same function OIDs after the schema move.

create schema if not exists private;

alter function public.is_business_member(uuid) set schema private;
alter function public.is_business_owner(uuid) set schema private;

grant usage on schema private to authenticated, service_role;

revoke all on function private.is_business_member(uuid) from public, anon;
revoke all on function private.is_business_owner(uuid) from public, anon;

grant execute on function private.is_business_member(uuid) to authenticated, service_role;
grant execute on function private.is_business_owner(uuid) to authenticated, service_role;
