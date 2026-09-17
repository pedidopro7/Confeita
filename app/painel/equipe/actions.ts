'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const roles = ['manager','service','production','stock','finance'] as const;
const permissionKeys = ['view_costs','view_revenue','access_cofre','edit_recipes','adjust_stock','cancel_orders','apply_discount','view_customers'] as const;

function text(value: FormDataEntryValue | null) { return String(value ?? '').trim(); }
function permissions(formData: FormData) {
  return Object.fromEntries(permissionKeys.map((key) => [key, formData.get(key) === 'on']));
}

export async function inviteMemberRc1Action(formData: FormData) {
  const context = await requireOwner();
  const email = text(formData.get('email')).toLowerCase();
  const role = text(formData.get('role')) as typeof roles[number];
  if (!email || !roles.includes(role)) redirect('/painel/equipe?erro=' + encodeURIComponent('Revise e-mail e função.'));
  const token = randomBytes(24).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const supabase = await createClient();
  await supabase.from('business_invitations').update({ status: 'revoked' }).eq('business_id', context.business.id).eq('email', email).eq('status', 'pending');
  const { error } = await supabase.from('business_invitations').insert({
    business_id: context.business.id,
    email,
    role,
    permissions: permissions(formData),
    token_hash: tokenHash,
    invited_by: context.user.id
  });
  if (error) redirect('/painel/equipe?erro=' + encodeURIComponent(error.message));
  revalidatePath('/painel/equipe');
  redirect(`/painel/equipe?ok=convite&token=${encodeURIComponent(token)}`);
}

export async function updateMemberAccessAction(memberId: string, formData: FormData) {
  const context = await requireOwner();
  const role = text(formData.get('role')) as typeof roles[number];
  const status = text(formData.get('status')) === 'suspended' ? 'suspended' : 'active';
  if (!roles.includes(role)) redirect('/painel/equipe?erro=' + encodeURIComponent('Função inválida.'));
  const supabase = await createClient();
  const { data: member } = await supabase.from('business_members').select('id,role,user_id').eq('business_id', context.business.id).eq('id', memberId).maybeSingle();
  if (!member || member.role === 'owner' || member.user_id === context.user.id) redirect('/painel/equipe?erro=' + encodeURIComponent('O acesso do proprietário não pode ser alterado aqui.'));
  const { error } = await supabase.from('business_members').update({ role, status, permissions: permissions(formData) }).eq('business_id', context.business.id).eq('id', memberId);
  if (error) redirect('/painel/equipe?erro=' + encodeURIComponent(error.message));
  await supabase.from('audit_logs').insert({ business_id: context.business.id, user_id: context.user.id, action: 'member_access_changed', entity_type: 'business_member', entity_id: memberId, metadata: { role, status } });
  revalidatePath('/painel/equipe');
  redirect('/painel/equipe?ok=acesso');
}

export async function revokeInvitationAction(invitationId: string, _formData: FormData) {
  const context = await requireOwner();
  const supabase = await createClient();
  await supabase.from('business_invitations').update({ status: 'revoked' }).eq('business_id', context.business.id).eq('id', invitationId).eq('status', 'pending');
  revalidatePath('/painel/equipe');
  redirect('/painel/equipe?ok=revogado');
}
