'use server';

import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function acceptInvitationAction(token: string, _formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/convite/${token}`)}`);
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { error } = await supabase.rpc('accept_business_invitation', { p_token_hash: tokenHash });
  if (error) {
    let message = 'Não foi possível aceitar este convite.';
    if (error.message.includes('invitation_invalid_or_expired')) message = 'Este convite expirou ou já foi utilizado.';
    if (error.message.includes('invitation_email_mismatch')) message = 'Este convite pertence a outro e-mail. Entre com a conta convidada.';
    redirect(`/convite/${token}?erro=${encodeURIComponent(message)}`);
  }
  redirect('/painel?convite=aceito');
}
