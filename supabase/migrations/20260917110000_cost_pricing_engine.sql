-- Cost & pricing engine.
-- Ingredient costs are based on inventory_items.average_unit_cost in each item's base unit.

create table if not exists public.pricing_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  target_margin_percent numeric(5,2) not null default 60 check (target_margin_percent >= 0 and target_margin_percent < 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pricing_settings enable row level security;

drop policy if exists pricing_settings_select on public.pricing_settings;
create policy pricing_settings_select on public.pricing_settings
for select using (private.is_business_member(business_id));

drop policy if exists pricing_settings_insert on public.pricing_settings;
create policy pricing_settings_insert on public.pricing_settings
for insert with check (private.is_business_owner(business_id));

drop policy if exists pricing_settings_update on public.pricing_settings;
create policy pricing_settings_update on public.pricing_settings
for update using (private.is_business_owner(business_id))
with check (private.is_business_owner(business_id));

drop policy if exists pricing_settings_delete on public.pricing_settings;
create policy pricing_settings_delete on public.pricing_settings
for delete using (private.is_business_owner(business_id));

-- Correct nested sub-recipe scaling when the component and nested recipe use
-- compatible but different units (for example kg -> g or L -> ml).
create or replace function public.recipe_inventory_requirements(
  p_recipe_version_id uuid,
  p_output_qty numeric default null
)
returns table (
  inventory_item_id uuid,
  quantity numeric,
  unit text
)
language sql
stable
security invoker
set search_path = ''
as $$
with recursive recipe_tree as (
  select
    rv.id as recipe_version_id,
    case
      when p_output_qty is null then 1::numeric
      else p_output_qty / nullif(rv.yield_qty, 0)
    end as factor,
    array[rv.recipe_id]::uuid[] as visited_recipes
  from public.recipe_versions rv
  where rv.id = p_recipe_version_id

  union all

  select
    srv.id,
    rt.factor * public.convert_inventory_quantity(rc.quantity, rc.unit, srv.yield_unit) / nullif(srv.yield_qty, 0),
    rt.visited_recipes || sr.id
  from recipe_tree rt
  join public.recipe_components rc
    on rc.recipe_version_id = rt.recipe_version_id
   and rc.component_type = 'sub_recipe'
  join public.recipes sr
    on sr.id = rc.sub_recipe_id
   and sr.active_version_id is not null
  join public.recipe_versions srv
    on srv.id = sr.active_version_id
  where not (sr.id = any(rt.visited_recipes))
), raw_requirements as (
  select
    rc.inventory_item_id,
    sum(public.convert_inventory_quantity(rc.quantity * rt.factor, rc.unit, ii.base_unit)) as quantity,
    ii.base_unit as unit
  from recipe_tree rt
  join public.recipe_components rc
    on rc.recipe_version_id = rt.recipe_version_id
   and rc.component_type = 'inventory_item'
  join public.inventory_items ii
    on ii.id = rc.inventory_item_id
   and ii.business_id = rc.business_id
  group by rc.inventory_item_id, ii.base_unit
)
select rr.inventory_item_id, rr.quantity, rr.unit
from raw_requirements rr
where rr.inventory_item_id is not null and rr.quantity > 0;
$$;

revoke all on function public.recipe_inventory_requirements(uuid,numeric) from public, anon;
grant execute on function public.recipe_inventory_requirements(uuid,numeric) to authenticated, service_role;

-- Internal version used by trusted triggers. Kept outside the exposed API schema.
create or replace function private.recipe_cost_for_output_internal(
  p_recipe_version_id uuid,
  p_output_qty numeric default null,
  p_output_unit text default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_yield_qty numeric;
  v_yield_unit text;
  v_required_output numeric;
  v_cost numeric;
begin
  if p_recipe_version_id is null then return 0; end if;

  select rv.yield_qty, rv.yield_unit
    into v_yield_qty, v_yield_unit
  from public.recipe_versions rv
  where rv.id = p_recipe_version_id;

  if v_yield_qty is null or v_yield_qty <= 0 then return 0; end if;

  v_required_output := case
    when p_output_qty is null then v_yield_qty
    else public.convert_inventory_quantity(p_output_qty, coalesce(nullif(p_output_unit, ''), v_yield_unit), v_yield_unit)
  end;

  select coalesce(sum(req.quantity * coalesce(ii.average_unit_cost, 0)), 0)
    into v_cost
  from public.recipe_inventory_requirements(p_recipe_version_id, v_required_output) req
  join public.inventory_items ii on ii.id = req.inventory_item_id;

  return round(coalesce(v_cost, 0), 4);
end;
$$;

revoke all on function private.recipe_cost_for_output_internal(uuid,numeric,text) from public, anon, authenticated;
grant execute on function private.recipe_cost_for_output_internal(uuid,numeric,text) to service_role;

-- Owner-facing cost function. SECURITY INVOKER keeps Cofre RLS intact.
create or replace function public.recipe_cost_for_output(
  p_recipe_version_id uuid,
  p_output_qty numeric default null,
  p_output_unit text default null
)
returns numeric
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_yield_qty numeric;
  v_yield_unit text;
  v_required_output numeric;
  v_cost numeric;
begin
  if p_recipe_version_id is null then return 0; end if;

  select rv.business_id, rv.yield_qty, rv.yield_unit
    into v_business_id, v_yield_qty, v_yield_unit
  from public.recipe_versions rv
  where rv.id = p_recipe_version_id;

  if v_business_id is null or not private.is_business_owner(v_business_id) then
    raise exception 'recipe_not_found_or_forbidden';
  end if;

  if v_yield_qty is null or v_yield_qty <= 0 then return 0; end if;

  v_required_output := case
    when p_output_qty is null then v_yield_qty
    else public.convert_inventory_quantity(p_output_qty, coalesce(nullif(p_output_unit, ''), v_yield_unit), v_yield_unit)
  end;

  select coalesce(sum(req.quantity * coalesce(ii.average_unit_cost, 0)), 0)
    into v_cost
  from public.recipe_inventory_requirements(p_recipe_version_id, v_required_output) req
  join public.inventory_items ii
    on ii.id = req.inventory_item_id
   and ii.business_id = v_business_id;

  return round(coalesce(v_cost, 0), 4);
end;
$$;

revoke all on function public.recipe_cost_for_output(uuid,numeric,text) from public, anon;
grant execute on function public.recipe_cost_for_output(uuid,numeric,text) to authenticated, service_role;

create or replace function private.order_item_recipe_cost_internal(p_order_item_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item public.order_items%rowtype;
  v_main_cost numeric := 0;
  v_options_cost numeric := 0;
begin
  select * into v_item from public.order_items where id = p_order_item_id;
  if v_item.id is null then return 0; end if;

  if v_item.recipe_version_id is not null then
    v_main_cost := private.recipe_cost_for_output_internal(
      v_item.recipe_version_id,
      v_item.quantity * coalesce(v_item.recipe_output_qty, 1),
      coalesce(v_item.recipe_output_unit, 'un')
    );
  end if;

  select coalesce(sum(private.recipe_cost_for_output_internal(
    nullif(selected ->> 'recipeVersionId', '')::uuid,
    v_item.quantity * coalesce(nullif(selected ->> 'recipeOutputQty', '')::numeric, 1),
    coalesce(nullif(selected ->> 'recipeOutputUnit', ''), 'un')
  )), 0)
  into v_options_cost
  from jsonb_array_elements(coalesce(v_item.configuration -> 'options', '[]'::jsonb)) selected
  where nullif(selected ->> 'recipeVersionId', '') is not null;

  return round(coalesce(v_main_cost, 0) + coalesce(v_options_cost, 0), 4);
end;
$$;

revoke all on function private.order_item_recipe_cost_internal(uuid) from public, anon, authenticated;
grant execute on function private.order_item_recipe_cost_internal(uuid) to service_role;

create or replace function private.snapshot_order_item_costs_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'confirmed' and old.status is distinct from new.status then
    update public.order_items oi
       set cost_snapshot = private.order_item_recipe_cost_internal(oi.id)
     where oi.order_id = new.id
       and oi.business_id = new.business_id;
  end if;
  return new;
end;
$$;

revoke all on function private.snapshot_order_item_costs_on_confirm() from public, anon, authenticated;
grant execute on function private.snapshot_order_item_costs_on_confirm() to service_role;

drop trigger if exists trg_snapshot_order_item_costs_on_confirm on public.orders;
create trigger trg_snapshot_order_item_costs_on_confirm
after update of status on public.orders
for each row execute function private.snapshot_order_item_costs_on_confirm();

-- Owner-only pricing summary. Configurable option recipes are variable and therefore
-- intentionally excluded from a product's base cost until an order chooses them.
create or replace function public.product_pricing_summary(p_business_id uuid)
returns table (
  product_id uuid,
  variant_id uuid,
  product_name text,
  variant_name text,
  current_price numeric,
  recipe_version_id uuid,
  recipe_output_qty numeric,
  recipe_output_unit text,
  material_cost numeric,
  gross_profit numeric,
  gross_margin_percent numeric,
  target_margin_percent numeric,
  suggested_price numeric,
  has_variable_recipe_options boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_target numeric;
begin
  if not private.is_business_owner(p_business_id) then
    raise exception 'business_not_found_or_forbidden';
  end if;

  select coalesce(ps.target_margin_percent, 60)
    into v_target
  from (select 1) seed
  left join public.pricing_settings ps on ps.business_id = p_business_id;

  return query
  with base_rows as (
    select
      p.id as product_id,
      null::uuid as variant_id,
      p.name as product_name,
      null::text as variant_name,
      p.base_price as current_price,
      r.active_version_id as recipe_version_id,
      p.recipe_output_qty,
      p.recipe_output_unit,
      exists (
        select 1
        from public.product_option_groups pog
        join public.product_options po on po.group_id = pog.id and po.business_id = pog.business_id
        where pog.business_id = p.business_id
          and pog.product_id = p.id
          and pog.active = true
          and po.active = true
          and po.recipe_id is not null
      ) as has_variable_recipe_options
    from public.products p
    left join lateral (
      select rr.active_version_id
      from public.recipes rr
      where rr.business_id = p.business_id
        and rr.product_id = p.id
        and rr.product_variant_id is null
        and rr.is_complete = true
        and rr.active_version_id is not null
      order by rr.updated_at desc
      limit 1
    ) r on true
    where p.business_id = p_business_id and p.active = true
  ), variant_rows as (
    select
      p.id as product_id,
      pv.id as variant_id,
      p.name as product_name,
      pv.name as variant_name,
      pv.price as current_price,
      coalesce(vr.active_version_id, br.active_version_id) as recipe_version_id,
      pv.recipe_output_qty,
      pv.recipe_output_unit,
      exists (
        select 1
        from public.product_option_groups pog
        join public.product_options po on po.group_id = pog.id and po.business_id = pog.business_id
        where pog.business_id = p.business_id
          and pog.product_id = p.id
          and pog.active = true
          and po.active = true
          and po.recipe_id is not null
      ) as has_variable_recipe_options
    from public.products p
    join public.product_variants pv
      on pv.product_id = p.id
     and pv.business_id = p.business_id
     and pv.active = true
    left join lateral (
      select rr.active_version_id
      from public.recipes rr
      where rr.business_id = p.business_id
        and rr.product_variant_id = pv.id
        and rr.is_complete = true
        and rr.active_version_id is not null
      order by rr.updated_at desc
      limit 1
    ) vr on true
    left join lateral (
      select rr.active_version_id
      from public.recipes rr
      where rr.business_id = p.business_id
        and rr.product_id = p.id
        and rr.product_variant_id is null
        and rr.is_complete = true
        and rr.active_version_id is not null
      order by rr.updated_at desc
      limit 1
    ) br on true
    where p.business_id = p_business_id and p.active = true
  ), combined as (
    select * from base_rows
    union all
    select * from variant_rows
  ), costed as (
    select
      c.*,
      case
        when c.recipe_version_id is null then 0::numeric
        else public.recipe_cost_for_output(c.recipe_version_id, c.recipe_output_qty, c.recipe_output_unit)
      end as material_cost
    from combined c
  )
  select
    c.product_id,
    c.variant_id,
    c.product_name,
    c.variant_name,
    round(c.current_price, 2),
    c.recipe_version_id,
    c.recipe_output_qty,
    c.recipe_output_unit,
    round(c.material_cost, 2),
    round(c.current_price - c.material_cost, 2),
    case when c.current_price > 0 then round(((c.current_price - c.material_cost) / c.current_price) * 100, 2) else 0 end,
    v_target,
    case when c.material_cost > 0 and v_target < 100 then round(c.material_cost / (1 - (v_target / 100)), 2) else 0 end,
    c.has_variable_recipe_options
  from costed c
  order by c.product_name, c.variant_name nulls first;
end;
$$;

revoke all on function public.product_pricing_summary(uuid) from public, anon;
grant execute on function public.product_pricing_summary(uuid) to authenticated, service_role;
