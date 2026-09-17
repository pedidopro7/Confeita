-- The membership helper was moved out of the exposed public schema.
-- Rebind the operational RPC bodies without changing their signatures or behavior.
do $$
declare
  fn record;
  definition text;
begin
  for fn in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'reserve_order_inventory',
        'start_order_production',
        'finish_order_production',
        'cancel_order_and_release'
      )
  loop
    definition := pg_get_functiondef(fn.oid);
    definition := replace(definition, 'public.is_business_member', 'private.is_business_member');
    execute definition;
  end loop;
end;
$$;
