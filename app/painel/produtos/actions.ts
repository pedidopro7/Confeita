'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getBusinessContext, hasPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function text(value: FormDataEntryValue | null) {
  return String(value ?? '').trim();
}

function num(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function context() {
  const ctx = await getBusinessContext();
  if (!ctx) throw new Error('Confeitaria não encontrada.');
  if (!hasPermission(ctx, 'manage_products')) redirect('/painel?erro=' + encodeURIComponent('Seu perfil não pode alterar produtos.'));
  return ctx;
}

function productPath(productId: string, query = '') {
  return `/painel/produtos/${productId}${query ? `?${query}` : ''}`;
}

export async function createProductCatalogAction(formData: FormData) {
  const ctx = await context();
  const supabase = await createClient();
  const name = text(formData.get('name'));
  if (!name) redirect('/painel/produtos?erro=' + encodeURIComponent('Informe o nome do produto.'));

  const { data, error } = await supabase.from('products').insert({
    business_id: ctx.business.id,
    name,
    description: text(formData.get('description')) || null,
    product_type: text(formData.get('product_type')) || 'simple',
    base_price: Math.max(num(formData.get('base_price')), 0),
    sale_unit: text(formData.get('sale_unit')) || 'un',
    recipe_output_qty: Math.max(num(formData.get('recipe_output_qty'), 1), 0.0001),
    recipe_output_unit: text(formData.get('recipe_output_unit')) || 'un'
  }).select('id').single();

  if (error || !data) redirect('/painel/produtos?erro=' + encodeURIComponent(error?.message ?? 'Não foi possível criar o produto.'));
  revalidatePath('/painel/produtos');
  redirect(productPath(data.id, 'ok=produto'));
}

export async function updateProductCatalogAction(formData: FormData) {
  const ctx = await context();
  const supabase = await createClient();
  const productId = text(formData.get('product_id'));
  if (!productId) redirect('/painel/produtos');

  const { error } = await supabase.from('products').update({
    name: text(formData.get('name')),
    description: text(formData.get('description')) || null,
    product_type: text(formData.get('product_type')) || 'simple',
    base_price: Math.max(num(formData.get('base_price')), 0),
    sale_unit: text(formData.get('sale_unit')) || 'un',
    recipe_output_qty: Math.max(num(formData.get('recipe_output_qty'), 1), 0.0001),
    recipe_output_unit: text(formData.get('recipe_output_unit')) || 'un'
  }).eq('business_id', ctx.business.id).eq('id', productId);

  if (error) redirect(productPath(productId, 'erro=' + encodeURIComponent(error.message)));
  revalidatePath('/painel/produtos');
  revalidatePath(productPath(productId));
  redirect(productPath(productId, 'ok=dados'));
}

export async function createProductVariantAction(formData: FormData) {
  const ctx = await context();
  const supabase = await createClient();
  const productId = text(formData.get('product_id'));
  const name = text(formData.get('name'));
  if (!productId || !name) redirect('/painel/produtos');

  const { error } = await supabase.from('product_variants').insert({
    business_id: ctx.business.id,
    product_id: productId,
    name,
    sku: text(formData.get('sku')) || null,
    price: Math.max(num(formData.get('price')), 0),
    recipe_output_qty: Math.max(num(formData.get('recipe_output_qty'), 1), 0.0001),
    recipe_output_unit: text(formData.get('recipe_output_unit')) || 'un'
  });

  if (error) redirect(productPath(productId, 'erro=' + encodeURIComponent(error.message)));
  revalidatePath(productPath(productId));
  revalidatePath('/painel/produtos');
  redirect(productPath(productId, 'ok=variante'));
}

export async function createProductOptionGroupAction(formData: FormData) {
  const ctx = await context();
  const supabase = await createClient();
  const productId = text(formData.get('product_id'));
  const name = text(formData.get('name'));
  if (!productId || !name) redirect('/painel/produtos');

  const selectionType = text(formData.get('selection_type')) === 'multiple' ? 'multiple' : 'single';
  const minSelect = Math.max(Math.trunc(num(formData.get('min_select'))), 0);
  const rawMax = text(formData.get('max_select'));
  const maxSelect = rawMax ? Math.max(Math.trunc(num(formData.get('max_select'))), 1) : null;

  const { error } = await supabase.from('product_option_groups').insert({
    business_id: ctx.business.id,
    product_id: productId,
    name,
    selection_type: selectionType,
    min_select: minSelect,
    max_select: maxSelect
  });

  if (error) redirect(productPath(productId, 'erro=' + encodeURIComponent(error.message)));
  revalidatePath(productPath(productId));
  redirect(productPath(productId, 'ok=grupo'));
}

export async function createProductOptionAction(formData: FormData) {
  const ctx = await context();
  const supabase = await createClient();
  const productId = text(formData.get('product_id'));
  const groupId = text(formData.get('group_id'));
  const name = text(formData.get('name'));
  if (!productId || !groupId || !name) redirect('/painel/produtos');

  const { error } = await supabase.from('product_options').insert({
    business_id: ctx.business.id,
    group_id: groupId,
    name,
    price_delta: num(formData.get('price_delta')),
    recipe_id: text(formData.get('recipe_id')) || null,
    recipe_output_qty: Math.max(num(formData.get('recipe_output_qty'), 1), 0.0001),
    recipe_output_unit: text(formData.get('recipe_output_unit')) || 'un'
  });

  if (error) redirect(productPath(productId, 'erro=' + encodeURIComponent(error.message)));
  revalidatePath(productPath(productId));
  redirect(productPath(productId, 'ok=opcao'));
}
