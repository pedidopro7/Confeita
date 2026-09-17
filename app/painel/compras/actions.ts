'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function text(value: FormDataEntryValue | null) {
  return String(value ?? '').trim();
}

function num(value: FormDataEntryValue | null) {
  const value = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

export async function recordPurchaseNormalizedAction(formData: FormData) {
  const context = await getBusinessContext();
  if (!context) redirect('/login');
  const supabase = await createClient();

  const itemId = text(formData.get('inventory_item_id'));
  const quantity = num(formData.get('quantity'));
  const unit = text(formData.get('unit'));
  const totalCost = num(formData.get('total_cost'));
  if (!itemId || quantity <= 0 || !unit || totalCost < 0) redirect('/painel/compras?erro=' + encodeURIComponent('Revise item, quantidade, unidade e valor.'));

  const expiresRaw = text(formData.get('expires_at'));
  const { error } = await supabase.rpc('record_inventory_purchase', {
    p_inventory_item_id: itemId,
    p_supplier_id: text(formData.get('supplier_id')) || null,
    p_quantity: quantity,
    p_unit: unit,
    p_total_cost: totalCost,
    p_lot_code: text(formData.get('lot_code')) || null,
    p_expires_at: expiresRaw || null,
    p_payment_method: text(formData.get('payment_method')) || null,
    p_notes: text(formData.get('notes')) || null
  });

  if (error) redirect('/painel/compras?erro=' + encodeURIComponent(error.message));
  revalidatePath('/painel/compras');
  revalidatePath('/painel/compras/lista');
  revalidatePath('/painel/estoque');
  revalidatePath('/painel');
  redirect('/painel/compras?ok=compra');
}
