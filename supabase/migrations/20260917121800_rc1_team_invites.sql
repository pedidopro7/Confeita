create or replace function private.accept_business_invitation_internal(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_business_id uuid;
  v_invite_id uuid;
  v_invite_email text;
  v_role text;
  v_permissions jsonb;
  v_user_email text;
  v_member_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select lower(email) into v_user_email from auth.users where id=auth.uid();
  select bi.id,bi.business_id,lower(bi.email),bi.role,bi.permissions
    into v_invite_id,v_business_id,v_invite_email,v_role,v_permissions
  from public.business_invitations bi
  where bi.token_hash=p_token_hash and bi.status='pending' and bi.expires_at>now()
  for update;
  if v_invite_id is null then raise exception 'invitation_invalid_or_expired'; end if;
  if v_user_email is null or v_user_email<>v_invite_email then raise exception 'invitation_email_mismatch'; end if;

  insert into public.business_members(business_id,user_id,role,status,permissions)
  values(v_business_id,auth.uid(),v_role,'active',coalesce(v_permissions,'{}'::jsonb))
  on conflict (business_id,user_id) do update set role=excluded.role,status='active',permissions=excluded.permissions,updated_at=now()
  returning id into v_member_id;

  update public.business_invitations
  set status='accepted',accepted_by=auth.uid(),accepted_at=now()
  where id=v_invite_id;

  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,metadata)
  values(v_business_id,auth.uid(),'member_joined','business_member',v_member_id,jsonb_build_object('role',v_role,'invitation_id',v_invite_id));
  return v_business_id;
end;
$$;
revoke all on function private.accept_business_invitation_internal(text) from public,anon;
grant execute on function private.accept_business_invitation_internal(text) to authenticated,service_role;

create or replace function public.accept_business_invitation(p_token_hash text)
returns uuid
language sql
security invoker
set search_path=''
as $$ select private.accept_business_invitation_internal(p_token_hash); $$;
revoke all on function public.accept_business_invitation(text) from public,anon;
grant execute on function public.accept_business_invitation(text) to authenticated,service_role;
