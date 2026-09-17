'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function text(value: FormDataEntryValue | null) {
  return String(value ?? '').trim();
}

function num(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function savePricingSettingsAction(formData: FormData) {
  const context = await requireOwner();
  const supabase = await createClient();
  const target = num(formData.get('target_margin_percent'), 60);
  if (target < 0 || target >= 100) redirect('/painel/precificacao?erro=' + encodeURIComponent('A margem-alvo deve ficar entre 0% e 99,99%.'));

  const { error } = await supabase.from('pricing_settings').upsert({
    business_id: context.business.id,
    target_margin_percent: target,
    updated_at: new Date().toISOString()
  }, { onConflict: 'business_id' });

  if (error) redirect('/painel/precificacao?erro=' + encodeURIComponent(error.message));
  revalidatePath('/painel/precificacao');
  redirect('/painel/precificacao?ok=margem');
}

export async function applySuggestedPriceAction(formData: FormData) {
  const context = await requireOwner();
  const supabase = await createClient();
  const productId = text(formData.get('product_id'));
  const variantId = text(formData.get('variant_id')) || null;
  if (!productId) redirect('/painel/precificacao?erro=' + encodeURIComponent('Produto inválido.'));

  const { data, error } = await supabase.rpc('product_pricing_summary', { p_business_id: context.business.id });
  if (error) redirect('/painel/precificacao?erro=' + encodeURIComponent(error.message));

  const rows = (data ?? []) as Array<{ product_id: string; variant_id: string | null; suggested_price: number | string }>;
  const row = rows.find((item) => item.product_id === productId && (item.variant_id ?? null) === variantId);
  if (!row) redirect('/painel/precificacao?erro=' + encodeURIComponent('Não foi possível recalcular este produto.'));

  const suggested = Number(row.suggested_price ?? 0);
  if (!Number.isFinite(suggested) || suggested <= 0) redirect('/painel/precificacao?erro=' + encodeURIComponent('Cadastre uma receita com custos antes de aplicar um preço sugerido.'));

  const query = variantId
    ? supabase.from('product_variants').update({ price: suggested, updated_at: new Date().toISOString() }).eq('business_id', context.business.id).eq('product_id', productId).eq('id', variantId)
    : supabase.from('products').update({ base_price: suggested, updated_at: new Date().toISOString() }).eq('business_id', context.business.id).eq('id', productId);
  const { error: updateError } = await query;
  if (updateError) redirect('/painel/precificacao?erro=' + encodeURIComponent(updateError.message));

  revalidatePath('/painel/precificacao');
  revalidatePath('/painel/produtos');
  revalidatePath(`/painel/produtos/${productId}`);
  redirect('/painel/precificacao?ok=preco');
}
