create or replace function public.finish_order_production(p_order_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare v_business_id uuid; v_status text; v_incomplete integer;
begin
  select business_id,status into v_business_id,v_status from public.orders where id=p_order_id for update;
  if v_business_id is null or not private.has_business_role(v_business_id,array['owner','manager','production']::text[]) then raise exception 'order_not_found_or_forbidden'; end if;
  if v_status <> 'production' then raise exception 'order_is_not_in_production'; end if;
  select count(*) into v_incomplete
  from public.production_steps ps
  join public.production_orders po on po.id=ps.production_order_id
  where po.order_id=p_order_id and po.status='in_progress' and ps.completed=false;
  if v_incomplete>0 then
    return jsonb_build_object('ok',false,'reason','checklist_incomplete','error','Conclua o checklist da produção antes de marcar o pedido como pronto.','remaining_steps',v_incomplete);
  end if;
  update public.production_orders set status='done',completed_at=now(),updated_at=now() where order_id=p_order_id and status='in_progress';
  update public.orders set status='ready',updated_at=now() where id=p_order_id;
  insert into public.order_status_history (business_id,order_id,from_status,to_status,changed_by,note)
  values (v_business_id,p_order_id,v_status,'ready',auth.uid(),'Produção concluída após checklist');
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.finish_order_production(uuid) from public,anon;
grant execute on function public.finish_order_production(uuid) to authenticated,service_role;
