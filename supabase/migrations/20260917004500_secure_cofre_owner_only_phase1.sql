alter function public.set_updated_at() set search_path = pg_catalog;
revoke execute on function public.create_owner_membership() from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
revoke execute on function public.set_updated_at() from anon, authenticated;

drop policy if exists tenant_select on public.recipe_versions;
drop policy if exists tenant_insert on public.recipe_versions;
drop policy if exists tenant_update on public.recipe_versions;
drop policy if exists tenant_delete on public.recipe_versions;

create policy cofre_recipe_versions_select on public.recipe_versions
for select using (public.is_business_owner(business_id));
create policy cofre_recipe_versions_insert on public.recipe_versions
for insert with check (public.is_business_owner(business_id));
create policy cofre_recipe_versions_update on public.recipe_versions
for update using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
create policy cofre_recipe_versions_delete on public.recipe_versions
for delete using (public.is_business_owner(business_id));

drop policy if exists tenant_select on public.recipe_components;
drop policy if exists tenant_insert on public.recipe_components;
drop policy if exists tenant_update on public.recipe_components;
drop policy if exists tenant_delete on public.recipe_components;

create policy cofre_recipe_components_select on public.recipe_components
for select using (public.is_business_owner(business_id));
create policy cofre_recipe_components_insert on public.recipe_components
for insert with check (public.is_business_owner(business_id));
create policy cofre_recipe_components_update on public.recipe_components
for update using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
create policy cofre_recipe_components_delete on public.recipe_components
for delete using (public.is_business_owner(business_id));

alter policy tenant_select on public.recipe_access_logs using (public.is_business_owner(business_id));
alter policy tenant_update on public.recipe_access_logs using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
alter policy tenant_delete on public.recipe_access_logs using (public.is_business_owner(business_id));
