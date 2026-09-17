create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  slug text not null unique,
  logo_url text,
  whatsapp text,
  instagram text,
  city text,
  timezone text not null default 'America/Sao_Paulo',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'production' check (role in ('owner','manager','service','production','stock','finance')),
  status text not null default 'active' check (status in ('invited','active','suspended')),
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create or replace function public.is_business_member(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
  ) or exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_user_id = auth.uid()
  );
$$;

create or replace function public.is_business_owner(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_user_id = auth.uid()
  );
$$;

create or replace function public.create_owner_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.business_members (business_id, user_id, role, status)
  values (new.id, new.owner_user_id, 'owner', 'active')
  on conflict (business_id, user_id) do nothing;
  return new;
end;
$$;

create trigger trg_business_owner_membership
after insert on public.businesses
for each row execute function public.create_owner_membership();

create table public.plans (
  code text primary key,
  name text not null,
  description text,
  price_monthly numeric(12,2),
  price_yearly numeric(12,2),
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.plans (code, name, description) values
  ('essential','Essencial','Para confeiteiras individuais'),
  ('professional','Profissional','Para negócios em crescimento'),
  ('team','Equipe','Para confeitarias com equipe')
on conflict (code) do nothing;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plan_code text not null references public.plans(code),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','grace_period','canceled','suspended')),
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  whatsapp text,
  email text,
  birth_date date,
  address jsonb not null default '{}'::jsonb,
  special_dates jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  item_type text not null default 'ingredient' check (item_type in ('ingredient','packaging','material','intermediate','finished')),
  sku text,
  base_unit text not null,
  purchase_unit text,
  purchase_unit_multiplier numeric(14,4) not null default 1 check (purchase_unit_multiplier > 0),
  min_stock numeric(14,4) not null default 0 check (min_stock >= 0),
  track_expiry boolean not null default false,
  average_unit_cost numeric(14,6) not null default 0 check (average_unit_cost >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create table public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  lot_code text,
  expires_at date,
  received_at date not null default current_date,
  quantity_received numeric(14,4) not null check (quantity_received >= 0),
  quantity_remaining numeric(14,4) not null check (quantity_remaining >= 0),
  unit_cost numeric(14,6) not null default 0 check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  product_type text not null default 'simple' check (product_type in ('simple','sized','configurable','kit')),
  image_url text,
  base_price numeric(12,2) not null default 0 check (base_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sku text,
  price numeric(12,2) not null default 0 check (price >= 0),
  attributes jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_variant_id uuid references public.product_variants(id) on delete set null,
  name text not null,
  confidentiality text not null default 'owner_only' check (confidentiality in ('owner_only','authorized_team','protected_production')),
  active_version_id uuid,
  is_complete boolean not null default false,
  auto_lock_minutes integer not null default 5 check (auto_lock_minutes between 1 and 120),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  yield_qty numeric(14,4) not null check (yield_qty > 0),
  yield_unit text not null,
  preparation_notes text,
  change_note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (recipe_id, version_no)
);

alter table public.recipes
  add constraint recipes_active_version_fk
  foreign key (active_version_id) references public.recipe_versions(id) on delete set null;

create table public.recipe_components (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  recipe_version_id uuid not null references public.recipe_versions(id) on delete cascade,
  component_type text not null check (component_type in ('inventory_item','sub_recipe')),
  inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  sub_recipe_id uuid references public.recipes(id) on delete restrict,
  quantity numeric(14,4) not null check (quantity > 0),
  unit text not null,
  is_visible_in_production boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (
    (component_type = 'inventory_item' and inventory_item_id is not null and sub_recipe_id is null)
    or
    (component_type = 'sub_recipe' and sub_recipe_id is not null and inventory_item_id is null)
  )
);

create table public.recipe_permissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_view boolean not null default false,
  can_edit boolean not null default false,
  created_at timestamptz not null default now(),
  unique (recipe_id, user_id)
);

create table public.recipe_access_logs (
  id bigserial primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','sent','waiting','approved','rejected','expired')),
  desired_at timestamptz,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  order_number bigint generated by default as identity,
  status text not null default 'draft' check (status in ('draft','awaiting_deposit','confirmed','production','ready','out_for_delivery','completed','canceled','refunded')),
  fulfillment_type text not null default 'pickup' check (fulfillment_type in ('pickup','delivery')),
  scheduled_at timestamptz,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  deposit_required numeric(12,2) not null default 0,
  notes text,
  reference_files jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, order_number)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_variant_id uuid references public.product_variants(id) on delete set null,
  name_snapshot text not null,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  total_price numeric(12,2) not null default 0,
  configuration jsonb not null default '{}'::jsonb,
  recipe_version_id uuid references public.recipe_versions(id) on delete set null,
  cost_snapshot numeric(12,2),
  created_at timestamptz not null default now()
);

create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null,
  status text not null default 'paid' check (status in ('pending','paid','refunded','failed')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity numeric(14,4) not null check (quantity > 0),
  unit text not null,
  status text not null default 'active' check (status in ('active','consumed','released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  movement_type text not null check (movement_type in ('PURCHASE','PRODUCTION_CONSUMPTION','PRODUCTION_OUTPUT','LOSS','INVENTORY_ADJUSTMENT','RETURN','CANCELLATION')),
  quantity_delta numeric(14,4) not null,
  unit text not null,
  unit_cost numeric(14,6),
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.production_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  recipe_id uuid references public.recipes(id) on delete set null,
  recipe_version_id uuid references public.recipe_versions(id) on delete set null,
  status text not null default 'todo' check (status in ('todo','in_progress','done','canceled')),
  planned_qty numeric(14,4) not null default 1 check (planned_qty > 0),
  actual_qty numeric(14,4),
  unit text,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.production_steps (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  production_order_id uuid not null references public.production_orders(id) on delete cascade,
  title text not null,
  sort_order integer not null default 0,
  completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  whatsapp text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchased_at timestamptz not null default now(),
  total numeric(12,2) not null default 0,
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity numeric(14,4) not null check (quantity > 0),
  unit text not null,
  total_cost numeric(12,2) not null check (total_cost >= 0),
  lot_code text,
  expires_at date,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category text not null,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  occurred_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null check (type in ('income','expense')),
  category text not null,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'paid' check (status in ('pending','paid','canceled')),
  due_at date,
  paid_at timestamptz,
  reference_type text,
  reference_id uuid,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigserial primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_members_user on public.business_members(user_id, status);
create index idx_customers_business on public.customers(business_id, name);
create index idx_inventory_business on public.inventory_items(business_id, active);
create index idx_inventory_movements_item on public.inventory_movements(business_id, inventory_item_id, created_at desc);
create index idx_inventory_reservations_item on public.inventory_reservations(business_id, inventory_item_id, status);
create index idx_products_business on public.products(business_id, active);
create index idx_recipes_business on public.recipes(business_id, is_complete);
create index idx_recipe_components_version on public.recipe_components(recipe_version_id, sort_order);
create index idx_orders_business_schedule on public.orders(business_id, scheduled_at);
create index idx_orders_business_status on public.orders(business_id, status);
create index idx_production_business_status on public.production_orders(business_id, status, scheduled_at);
create index idx_recipe_access_logs on public.recipe_access_logs(business_id, recipe_id, created_at desc);
create index idx_audit_logs on public.audit_logs(business_id, created_at desc);

create view public.inventory_stock_summary with (security_invoker = true) as
select
  i.business_id,
  i.id as inventory_item_id,
  i.name,
  i.base_unit,
  i.min_stock,
  coalesce(m.on_hand, 0)::numeric(14,4) as on_hand,
  coalesce(r.reserved, 0)::numeric(14,4) as reserved,
  (coalesce(m.on_hand, 0) - coalesce(r.reserved, 0))::numeric(14,4) as available
from public.inventory_items i
left join (
  select business_id, inventory_item_id, sum(quantity_delta) as on_hand
  from public.inventory_movements
  group by business_id, inventory_item_id
) m on m.business_id = i.business_id and m.inventory_item_id = i.id
left join (
  select business_id, inventory_item_id, sum(quantity) as reserved
  from public.inventory_reservations
  where status = 'active'
  group by business_id, inventory_item_id
) r on r.business_id = i.business_id and r.inventory_item_id = i.id;

alter table public.businesses enable row level security;
create policy business_select on public.businesses for select using (public.is_business_member(id));
create policy business_insert on public.businesses for insert with check (owner_user_id = auth.uid());
create policy business_update on public.businesses for update using (public.is_business_owner(id)) with check (public.is_business_owner(id));
create policy business_delete on public.businesses for delete using (public.is_business_owner(id));

alter table public.plans enable row level security;
create policy plans_read on public.plans for select to authenticated using (active = true);

alter table public.business_members enable row level security;
create policy members_select on public.business_members for select using (public.is_business_member(business_id));
create policy members_insert on public.business_members for insert with check (public.is_business_owner(business_id));
create policy members_update on public.business_members for update using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
create policy members_delete on public.business_members for delete using (public.is_business_owner(business_id));

do $$
declare t text;
begin
  foreach t in array array[
    'subscriptions','customers','inventory_items','inventory_batches','products','product_variants',
    'recipes','recipe_versions','recipe_components','recipe_permissions','recipe_access_logs',
    'quotes','orders','order_items','order_payments','inventory_reservations','inventory_movements',
    'production_orders','production_steps','suppliers','purchases','purchase_items','expenses',
    'financial_transactions','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy tenant_select on public.%I for select using (public.is_business_member(business_id))', t);
    execute format('create policy tenant_insert on public.%I for insert with check (public.is_business_member(business_id))', t);
    execute format('create policy tenant_update on public.%I for update using (public.is_business_member(business_id)) with check (public.is_business_member(business_id))', t);
    execute format('create policy tenant_delete on public.%I for delete using (public.is_business_member(business_id))', t);
  end loop;
end $$;

create policy recipe_permissions_owner_write on public.recipe_permissions
as restrictive for all using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

create policy subscriptions_owner_write on public.subscriptions
as restrictive for all using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

do $$
declare t text;
begin
  foreach t in array array[
    'businesses','business_members','subscriptions','customers','inventory_items','products','product_variants',
    'recipes','inventory_reservations','production_orders','suppliers','purchases','expenses','financial_transactions',
    'quotes','orders'
  ] loop
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;
