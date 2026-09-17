'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function text(value: FormDataEntryValue | null) { return String(value ?? '').trim(); }
function num(value: FormDataEntryValue | null) { const parsed = Number(text(value).replace(',', '.')); return Number.isFinite(parsed) ? parsed : 0; }

export async function recordManualExpenseAction(formData: FormData) {
  const context = await getBusinessContext();
  if (!context) redirect('/login');
  if (!['owner','manager','finance'].includes(context.role)) redirect('/painel');
  const amount = num(formData.get('amount'));
  if (amount <= 0) redirect('/painel/financeiro?erro=' + encodeURIComponent('Informe um valor válido.'));
  const supabase = await createClient();
  const { error } = await supabase.rpc('record_manual_expense', {
    p_business_id: context.business.id,
    p_category: text(formData.get('category')) || 'outros',
    p_description: text(formData.get('description')),
    p_amount: amount,
    p_occurred_at: text(formData.get('occurred_at')) || null,
    p_idempotency_key: text(formData.get('idempotency_key')) || null
  });
  if (error) redirect('/painel/financeiro?erro=' + encodeURIComponent(error.message));
  revalidatePath('/painel/financeiro');
  revalidatePath('/painel/relatorios');
  revalidatePath('/painel');
  redirect('/painel/financeiro?ok=despesa');
}
