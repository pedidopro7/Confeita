-- Confeita v1: security hardening and supporting SaaS entities

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table if not exists public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  role text not null default 'production' check (role in ('manager','service','production','stock','finance')),
  permissions jsonb not null default '{}'::jsonb,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

alter table public.business_invitations enable row level security;
create policy invitations_owner_select on public.business_invitations for select to authenticated using (public.is_business_owner(business_id));
create policy invitations_owner_insert on public.business_invitations for insert to authenticated with check (public.is_business_owner(business_id));
create policy invitations_owner_update on public.business_invitations for update to authenticated using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
create policy invitations_owner_delete on public.business_invitations for delete to authenticated using (public.is_business_owner(business_id));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  action_url text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (
  public.is_business_member(business_id) and (user_id is null or user_id = auth.uid())
);
create policy notifications_update on public.notifications for update to authenticated using (
  public.is_business_member(business_id) and (user_id is null or user_id = auth.uid())
) with check (
  public.is_business_member(business_id) and (user_id is null or user_id = auth.uid())
);
create policy notifications_insert on public.notifications for insert to authenticated with check (public.is_business_member(business_id));

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_variant_id uuid references public.product_variants(id) on delete set null,
  name_snapshot text not null,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  total_price numeric(12,2) not null default 0 check (total_price >= 0),
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.quote_items enable row level security;
create policy quote_items_select on public.quote_items for select to authenticated using (public.is_business_member(business_id));
create policy quote_items_insert on public.quote_items for insert to authenticated with check (public.is_business_member(business_id));
create policy quote_items_update on public.quote_items for update to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy quote_items_delete on public.quote_items for delete to authenticated using (public.is_business_member(business_id));

create table if not exists public.product_option_groups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  selection_type text not null default 'single' check (selection_type in ('single','multiple')),
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer check (max_select is null or max_select > 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.product_options (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  group_id uuid not null references public.product_option_groups(id) on delete cascade,
  name text not null,
  price_delta numeric(12,2) not null default 0,
  recipe_id uuid references public.recipes(id) on delete set null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.product_option_groups enable row level security;
alter table public.product_options enable row level security;
create policy product_option_groups_select on public.product_option_groups for select to authenticated using (public.is_business_member(business_id));
create policy product_option_groups_insert on public.product_option_groups for insert to authenticated with check (public.is_business_member(business_id));
create policy product_option_groups_update on public.product_option_groups for update to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy product_option_groups_delete on public.product_option_groups for delete to authenticated using (public.is_business_member(business_id));
create policy product_options_select on public.product_options for select to authenticated using (public.is_business_member(business_id));
create policy product_options_insert on public.product_options for insert to authenticated with check (public.is_business_member(business_id));
create policy product_options_update on public.product_options for update to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy product_options_delete on public.product_options for delete to authenticated using (public.is_business_member(business_id));

create table if not exists public.order_status_history (
  id bigserial primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.order_status_history enable row level security;
create policy order_status_history_select on public.order_status_history for select to authenticated using (public.is_business_member(business_id));
create policy order_status_history_insert on public.order_status_history for insert to authenticated with check (public.is_business_member(business_id));

-- A business starts with a 14-day essential trial automatically.
create or replace function public.create_trial_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (business_id, plan_code, status, trial_ends_at)
  values (new.id, 'essential', 'trialing', now() + interval '14 days')
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.create_trial_subscription() from public, anon, authenticated;
drop trigger if exists trg_business_trial_subscription on public.businesses;
create trigger trg_business_trial_subscription
after insert on public.businesses
for each row execute function public.create_trial_subscription();

-- Subscription state is billing-controlled. App users can read it but cannot forge paid status.
drop policy if exists subscriptions_owner_write on public.subscriptions;
drop policy if exists tenant_insert on public.subscriptions;
drop policy if exists tenant_update on public.subscriptions;
drop policy if exists tenant_delete on public.subscriptions;
drop policy if exists tenant_select on public.subscriptions;
create policy subscriptions_member_select on public.subscriptions for select to authenticated using (public.is_business_member(business_id));

-- Recipe permissions can only be changed by the business owner.
drop policy if exists tenant_insert on public.recipe_permissions;
drop policy if exists tenant_update on public.recipe_permissions;
drop policy if exists tenant_delete on public.recipe_permissions;
drop policy if exists tenant_select on public.recipe_permissions;
drop policy if exists recipe_permissions_owner_write on public.recipe_permissions;
create policy recipe_permissions_owner_select on public.recipe_permissions for select to authenticated using (
  public.is_business_owner(business_id) or user_id = auth.uid()
);
create policy recipe_permissions_owner_insert on public.recipe_permissions for insert to authenticated with check (public.is_business_owner(business_id));
create policy recipe_permissions_owner_update on public.recipe_permissions for update to authenticated using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
create policy recipe_permissions_owner_delete on public.recipe_permissions for delete to authenticated using (public.is_business_owner(business_id));

-- Existing stock summary view must respect caller RLS.
alter view if exists public.inventory_stock_summary set (security_invoker = true);

-- Helpful indexes for the mobile-heavy operational queries.
create index if not exists idx_orders_business_scheduled on public.orders (business_id, scheduled_at);
create index if not exists idx_orders_business_status on public.orders (business_id, status);
create index if not exists idx_order_items_order on public.order_items (order_id);
create index if not exists idx_inventory_movements_business_item_created on public.inventory_movements (business_id, inventory_item_id, created_at desc);
create index if not exists idx_inventory_reservations_business_status on public.inventory_reservations (business_id, status);
create index if not exists idx_recipes_business_product on public.recipes (business_id, product_id);
create index if not exists idx_recipe_components_version on public.recipe_components (recipe_version_id);
create index if not exists idx_production_orders_business_status on public.production_orders (business_id, status, scheduled_at);
create index if not exists idx_notifications_user_unread on public.notifications (business_id, user_id, created_at desc) where read_at is null;

-- Keep profile timestamps fresh.
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
