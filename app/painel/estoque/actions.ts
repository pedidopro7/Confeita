'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function text(value: FormDataEntryValue | null) {
  return String(value ?? '').trim();
}

function num(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function recordLossNormalizedAction(formData: FormData) {
  const context = await getBusinessContext();
  if (!context) redirect('/login');
  const itemId = text(formData.get('inventory_item_id'));
  const quantity = num(formData.get('quantity'));
  const unit = text(formData.get('unit'));
  if (!itemId || quantity <= 0 || !unit) redirect('/painel/estoque?erro=' + encodeURIComponent('Informe item, quantidade e unidade.'));

  const supabase = await createClient();
  const { error } = await supabase.rpc('record_inventory_loss', {
    p_inventory_item_id: itemId,
    p_quantity: quantity,
    p_unit: unit,
    p_reason: text(formData.get('reason')) || null
  });

  if (error) redirect('/painel/estoque?erro=' + encodeURIComponent(error.message));
  revalidatePath('/painel/estoque');
  revalidatePath('/painel/compras/lista');
  revalidatePath('/painel');
  redirect('/painel/estoque?ok=perda');
}
