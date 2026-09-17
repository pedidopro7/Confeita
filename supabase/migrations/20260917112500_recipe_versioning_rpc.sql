-- Atomic version creation for confidential recipes.
create or replace function public.create_recipe_version(
  p_recipe_id uuid,
  p_yield_qty numeric,
  p_yield_unit text,
  p_preparation_notes text default null,
  p_change_note text default null,
  p_components jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_version_no integer;
  v_version_id uuid;
  v_component jsonb;
  v_type text;
  v_component_id uuid;
  v_quantity numeric;
  v_unit text;
  v_has_cycle boolean;
begin
  if p_yield_qty is null or p_yield_qty <= 0 or nullif(trim(p_yield_unit), '') is null then
    raise exception 'invalid_recipe_yield';
  end if;
  if jsonb_typeof(coalesce(p_components, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_components, '[]'::jsonb)) = 0 then
    raise exception 'recipe_requires_components';
  end if;

  select r.business_id into v_business_id
  from public.recipes r
  where r.id = p_recipe_id
  for update;

  if v_business_id is null or not private.is_business_owner(v_business_id) then
    raise exception 'recipe_not_found_or_forbidden';
  end if;

  -- Validate every component against the same tenant before writing anything.
  for v_component in select value from jsonb_array_elements(p_components)
  loop
    v_type := nullif(v_component ->> 'type', '');
    v_component_id := nullif(v_component ->> 'id', '')::uuid;
    v_quantity := nullif(v_component ->> 'quantity', '')::numeric;
    v_unit := nullif(trim(v_component ->> 'unit'), '');

    if v_type not in ('inventory_item', 'sub_recipe') or v_component_id is null or v_quantity is null or v_quantity <= 0 or v_unit is null then
      raise exception 'invalid_recipe_component';
    end if;

    if v_type = 'inventory_item' and not exists (
      select 1 from public.inventory_items i
      where i.id = v_component_id and i.business_id = v_business_id and i.active = true
    ) then
      raise exception 'inventory_component_not_found_or_forbidden';
    end if;

    if v_type = 'sub_recipe' and (
      v_component_id = p_recipe_id or not exists (
        select 1 from public.recipes sr
        where sr.id = v_component_id and sr.business_id = v_business_id and sr.is_complete = true and sr.active_version_id is not null
      )
    ) then
      raise exception 'sub_recipe_not_found_or_invalid';
    end if;
  end loop;

  -- Block indirect cycles such as A -> B -> C -> A.
  with recursive seeds(recipe_id, path) as (
    select nullif(value ->> 'id', '')::uuid, array[nullif(value ->> 'id', '')::uuid]
    from jsonb_array_elements(p_components)
    where value ->> 'type' = 'sub_recipe'
  ), deps(recipe_id, path) as (
    select recipe_id, path from seeds
    union all
    select rc.sub_recipe_id, d.path || rc.sub_recipe_id
    from deps d
    join public.recipes r on r.id = d.recipe_id and r.business_id = v_business_id
    join public.recipe_components rc on rc.recipe_version_id = r.active_version_id and rc.component_type = 'sub_recipe'
    where rc.sub_recipe_id is not null and not (rc.sub_recipe_id = any(d.path))
  )
  select exists(select 1 from deps where recipe_id = p_recipe_id) into v_has_cycle;

  if v_has_cycle then raise exception 'recipe_cycle_not_allowed'; end if;

  select coalesce(max(rv.version_no), 0) + 1 into v_version_no
  from public.recipe_versions rv
  where rv.recipe_id = p_recipe_id;

  insert into public.recipe_versions (
    business_id, recipe_id, version_no, yield_qty, yield_unit,
    preparation_notes, change_note, created_by
  ) values (
    v_business_id, p_recipe_id, v_version_no, p_yield_qty, trim(p_yield_unit),
    nullif(trim(p_preparation_notes), ''), nullif(trim(p_change_note), ''), auth.uid()
  ) returning id into v_version_id;

  insert into public.recipe_components (
    business_id, recipe_version_id, component_type, inventory_item_id, sub_recipe_id,
    quantity, unit, is_visible_in_production, sort_order
  )
  select
    v_business_id,
    v_version_id,
    value ->> 'type',
    case when value ->> 'type' = 'inventory_item' then (value ->> 'id')::uuid else null end,
    case when value ->> 'type' = 'sub_recipe' then (value ->> 'id')::uuid else null end,
    (value ->> 'quantity')::numeric,
    trim(value ->> 'unit'),
    coalesce((value ->> 'visible')::boolean, true),
    ordinality::integer - 1
  from jsonb_array_elements(p_components) with ordinality;

  update public.recipes
     set active_version_id = v_version_id,
         is_complete = true,
         updated_at = now()
   where id = p_recipe_id and business_id = v_business_id;

  insert into public.recipe_access_logs (business_id, recipe_id, user_id, action, metadata)
  values (
    v_business_id,
    p_recipe_id,
    auth.uid(),
    'version_created',
    jsonb_build_object('version_no', v_version_no, 'change_note', nullif(trim(p_change_note), ''))
  );

  return v_version_id;
end;
$$;

revoke all on function public.create_recipe_version(uuid,numeric,text,text,text,jsonb) from public, anon;
grant execute on function public.create_recipe_version(uuid,numeric,text,text,text,jsonb) to authenticated, service_role;
