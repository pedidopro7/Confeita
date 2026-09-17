-- Avoid re-evaluating auth.uid() for every row in RLS policies.
alter policy business_insert on public.businesses
  with check (owner_user_id = (select auth.uid()));

alter policy profiles_select_self on public.profiles
  using (id = (select auth.uid()));

alter policy profiles_insert_self on public.profiles
  with check (id = (select auth.uid()));

alter policy profiles_update_self on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy notifications_select on public.notifications
  using (private.is_business_member(business_id) and (user_id is null or user_id = (select auth.uid())));

alter policy notifications_update on public.notifications
  using (private.is_business_member(business_id) and (user_id is null or user_id = (select auth.uid())))
  with check (private.is_business_member(business_id) and (user_id is null or user_id = (select auth.uid())));

alter policy recipe_permissions_owner_select on public.recipe_permissions
  using (private.is_business_owner(business_id) or user_id = (select auth.uid()));

-- Essential foreign-key and high-traffic indexes for the SaaS operational path.
create index if not exists idx_businesses_owner_user_id on public.businesses(owner_user_id);
create index if not exists idx_business_invitations_business_id on public.business_invitations(business_id);
create index if not exists idx_business_invitations_invited_by on public.business_invitations(invited_by);
create index if not exists idx_business_invitations_accepted_by on public.business_invitations(accepted_by);
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_notifications_user_id on public.notifications(user_id);

create index if not exists idx_orders_customer_id on public.orders(customer_id);
create index if not exists idx_orders_quote_id on public.orders(quote_id);
create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_order_items_product_id on public.order_items(product_id);
create index if not exists idx_order_items_variant_id on public.order_items(product_variant_id);
create index if not exists idx_order_items_recipe_version_id on public.order_items(recipe_version_id);
create index if not exists idx_order_payments_order_id on public.order_payments(order_id);
create index if not exists idx_order_status_history_order_id on public.order_status_history(order_id);
create index if not exists idx_order_status_history_changed_by on public.order_status_history(changed_by);

create index if not exists idx_inventory_batches_item_id on public.inventory_batches(inventory_item_id);
create index if not exists idx_inventory_reservations_order_id on public.inventory_reservations(order_id);
create index if not exists idx_inventory_reservations_order_item_id on public.inventory_reservations(order_item_id);
create index if not exists idx_inventory_reservations_inventory_item_id on public.inventory_reservations(inventory_item_id);
create index if not exists idx_inventory_movements_created_by on public.inventory_movements(created_by);

create index if not exists idx_product_variants_product_id on public.product_variants(product_id);
create index if not exists idx_product_option_groups_product_id on public.product_option_groups(product_id);
create index if not exists idx_product_options_group_id on public.product_options(group_id);
create index if not exists idx_product_options_recipe_id on public.product_options(recipe_id);

create index if not exists idx_recipes_active_version_id on public.recipes(active_version_id);
create index if not exists idx_recipes_product_id on public.recipes(product_id);
create index if not exists idx_recipes_variant_id on public.recipes(product_variant_id);
create index if not exists idx_recipes_created_by on public.recipes(created_by);
create index if not exists idx_recipe_versions_recipe_id on public.recipe_versions(recipe_id);
create index if not exists idx_recipe_versions_created_by on public.recipe_versions(created_by);
create index if not exists idx_recipe_components_inventory_item_id on public.recipe_components(inventory_item_id);
create index if not exists idx_recipe_components_sub_recipe_id on public.recipe_components(sub_recipe_id);
create index if not exists idx_recipe_permissions_user_id on public.recipe_permissions(user_id);
create index if not exists idx_recipe_access_logs_recipe_id on public.recipe_access_logs(recipe_id);
create index if not exists idx_recipe_access_logs_user_id on public.recipe_access_logs(user_id);

create index if not exists idx_quotes_customer_id on public.quotes(customer_id);
create index if not exists idx_quote_items_quote_id on public.quote_items(quote_id);
create index if not exists idx_quote_items_product_id on public.quote_items(product_id);
create index if not exists idx_quote_items_variant_id on public.quote_items(product_variant_id);

create index if not exists idx_production_orders_order_id on public.production_orders(order_id);
create index if not exists idx_production_orders_recipe_id on public.production_orders(recipe_id);
create index if not exists idx_production_orders_recipe_version_id on public.production_orders(recipe_version_id);
create index if not exists idx_production_orders_assigned_to on public.production_orders(assigned_to);
create index if not exists idx_production_steps_order_id on public.production_steps(production_order_id);
create index if not exists idx_production_steps_completed_by on public.production_steps(completed_by);

create index if not exists idx_purchases_supplier_id on public.purchases(supplier_id);
create index if not exists idx_purchase_items_purchase_id on public.purchase_items(purchase_id);
create index if not exists idx_purchase_items_inventory_item_id on public.purchase_items(inventory_item_id);
create index if not exists idx_subscriptions_business_id on public.subscriptions(business_id);
create index if not exists idx_subscriptions_plan_code on public.subscriptions(plan_code);

create index if not exists idx_expenses_business_occurred on public.expenses(business_id, occurred_at desc);
create index if not exists idx_financial_transactions_business_due on public.financial_transactions(business_id, due_at desc);
create index if not exists idx_financial_transactions_business_paid on public.financial_transactions(business_id, paid_at desc) where paid_at is not null;

-- Remove duplicate indexes already reported by the Supabase advisor.
drop index if exists public.idx_inventory_movements_item;
drop index if exists public.idx_orders_business_scheduled;
drop index if exists public.idx_production_orders_business_status;
drop index if exists public.idx_order_items_order_id;
