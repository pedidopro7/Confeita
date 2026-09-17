-- Role helper used for sensitive operational rows without exposing membership internals.
create or replace function private.has_business_role(p_business_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = (select auth.uid())
      and bm.status = 'active'
      and bm.role = any(p_roles)
  );
$$;

revoke all on function private.has_business_role(uuid, text[]) from public, anon;
grant execute on function private.has_business_role(uuid, text[]) to authenticated, service_role;

-- Recipe metadata may be read by members so the operational engine can reference an
-- opaque recipe/version id, but only the owner may create, mutate or remove formulas.
alter policy tenant_insert on public.recipes
  with check (private.is_business_owner(business_id));
alter policy tenant_update on public.recipes
  using (private.is_business_owner(business_id))
  with check (private.is_business_owner(business_id));
alter policy tenant_delete on public.recipes
  using (private.is_business_owner(business_id));

-- Reservation rows expose the ingredient/quantity relationship of a specific order.
-- Limit direct visibility and writes to roles that legitimately manage stock.
alter policy tenant_select on public.inventory_reservations
  using (private.has_business_role(business_id, array['owner','manager','stock']::text[]));
alter policy tenant_insert on public.inventory_reservations
  with check (private.has_business_role(business_id, array['owner','manager','stock']::text[]));
alter policy tenant_update on public.inventory_reservations
  using (private.has_business_role(business_id, array['owner','manager','stock']::text[]))
  with check (private.has_business_role(business_id, array['owner','manager','stock']::text[]));
alter policy tenant_delete on public.inventory_reservations
  using (private.has_business_role(business_id, array['owner','manager','stock']::text[]));
