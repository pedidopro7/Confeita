-- Inventory math must always compare quantities in the item's base unit.
create or replace function public.convert_inventory_quantity(
  p_quantity numeric,
  p_from_unit text,
  p_to_unit text
)
returns numeric
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_from text := lower(trim(p_from_unit));
  v_to text := lower(trim(p_to_unit));
begin
  if p_quantity is null then return null; end if;
  if v_from = v_to then return p_quantity; end if;

  if v_from = 'kg' and v_to = 'g' then return p_quantity * 1000; end if;
  if v_from = 'g' and v_to = 'kg' then return p_quantity / 1000; end if;
  if v_from in ('l','lt','litro','litros') and v_to = 'ml' then return p_quantity * 1000; end if;
  if v_from = 'ml' and v_to in ('l','lt','litro','litros') then return p_quantity / 1000; end if;
  if v_from in ('un','unidade','unidades') and v_to in ('un','unidade','unidades') then return p_quantity; end if;

  raise exception 'incompatible_inventory_units: % -> %', p_from_unit, p_to_unit;
end;
$$;

grant execute on function public.convert_inventory_quantity(numeric,text,text) to authenticated, service_role;
revoke execute on function public.convert_inventory_quantity(numeric,text,text) from anon;

create or replace function private.normalize_inventory_movement_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_unit text;
begin
  select i.base_unit into v_base_unit
  from public.inventory_items i
  where i.id = new.inventory_item_id
    and i.business_id = new.business_id;

  if v_base_unit is null then
    raise exception 'inventory_item_not_found';
  end if;

  new.quantity_delta := public.convert_inventory_quantity(new.quantity_delta, new.unit, v_base_unit);
  new.unit := v_base_unit;
  return new;
end;
$$;

create or replace function private.normalize_inventory_reservation_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_unit text;
begin
  select i.base_unit into v_base_unit
  from public.inventory_items i
  where i.id = new.inventory_item_id
    and i.business_id = new.business_id;

  if v_base_unit is null then
    raise exception 'inventory_item_not_found';
  end if;

  new.quantity := public.convert_inventory_quantity(new.quantity, new.unit, v_base_unit);
  new.unit := v_base_unit;
  return new;
end;
$$;

drop trigger if exists trg_normalize_inventory_movement_unit on public.inventory_movements;
create trigger trg_normalize_inventory_movement_unit
before insert or update of quantity_delta, unit, inventory_item_id
on public.inventory_movements
for each row execute function private.normalize_inventory_movement_unit();

drop trigger if exists trg_normalize_inventory_reservation_unit on public.inventory_reservations;
create trigger trg_normalize_inventory_reservation_unit
before insert or update of quantity, unit, inventory_item_id
on public.inventory_reservations
for each row execute function private.normalize_inventory_reservation_unit();

-- Recipe explosion now emits each ingredient in that inventory item's base unit.
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
    case when p_output_qty is null then 1::numeric else p_output_qty / nullif(rv.yield_qty, 0) end as factor,
    array[rv.recipe_id]::uuid[] as visited_recipes
  from public.recipe_versions rv
  where rv.id = p_recipe_version_id

  union all

  select
    srv.id,
    rt.factor * rc.quantity / nullif(srv.yield_qty, 0),
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
