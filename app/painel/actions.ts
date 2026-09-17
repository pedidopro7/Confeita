'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createHash, randomBytes } from 'node:crypto';
import { getBusinessContext, requireOwner } from '@/lib/auth';

function str(value: FormDataEntryValue | null) {
  return String(value ?? '').trim();
}

function number(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function ctx() {
  const context = await getBusinessContext();
  if (!context) throw new Error('Confeitaria não encontrada.');
  return context;
}

export async function createCustomerAction(formData: FormData) {
  const context = await ctx();
  const { error } = await (await import('@/lib/supabase/server')).createClient().then((client) =>
    client.from('customers').insert({
      business_id: context.business.id,
      name: str(formData.get('name')),
      whatsapp: str(formData.get('whatsapp')) || null,
      email: str(formData.get('email')) || null,
      birth_date: str(formData.get('birth_date')) || null,
      notes: str(formData.get('notes')) || null
    })
  );
  if (error) redirect('/painel/clientes?erro=' + encodeURIComponent(error.message));
  revalidatePath('/painel/clientes');
  redirect('/painel/clientes?ok=cliente');
}

export async function createProductAction(formData: FormData) {
  const context = await ctx();
  const supabase = await (await import('@/lib/supabase/server')).createClient();
  const { error } = await supabase.from('products').insert({
    business_id: context.business.id,
    name: str(formData.get('name')),
    description: str(formData.get('description')) || null,
    product_type: str(formData.get('product_type')) || 'simple',
    base_price: number(formData.get('base_price'))
  });
  if (error) redirect('/painel/produtos?erro=' + encodeURIComponent(error.message));
  revalidatePath('/painel/produtos');
  redirect('/painel/produtos?ok=produto');
}

export async function createInventoryItemAction(formData: FormData) {
  const context = await ctx();
  const supabase = await (await import('@/lib/supabase/server')).createClient();
  const baseUnit = str(formData.get('base_unit')) || 'un';
  const openingQty = number(formData.get('opening_qty'));
  const unitCost = number(formData.get('unit_cost'));

  const { data: item, error } = await supabase.from('inventory_items').insert({
    business_id: context.business.id,
    name: str(formData.get('name')),
    item_type: str(formData.get('item_type')) || 'ingredient',
    base_unit: baseUnit,
    purchase_unit: str(formData.get('purchase_unit')) || baseUnit,
    purchase_unit_multiplier: Math.max(number(formData.get('purchase_unit_multiplier'), 1), 0.0001),
    min_stock: Math.max(number(formData.get('min_stock')), 0),
    track_expiry: formData.get('track_expiry') === 'on',
    average_unit_cost: Math.max(unitCost, 0)
  }).select('id').single();

  if (error || !item) redirect('/painel/estoque?erro=' + encodeURIComponent(error?.message ?? 'Não foi possível cadastrar o item.'));

  if (openingQty > 0) {
    const { error: movementError } = await supabase.from('inventory_movements').insert({
      business_id: context.business.id,
      inventory_item_id: item.id,
      movement_type: 'INVENTORY_ADJUSTMENT',
      quantity_delta: openingQty,
      unit: baseUnit,
      unit_cost: unitCost || null,
      notes: 'Estoque inicial',
      created_by: context.user.id
    });
    if (movementError) {
      await supabase.from('inventory_items').delete().eq('id', item.id);
      redirect('/painel/estoque?erro=' + encodeURIComponent(movementError.message));
    }
  }

  revalidatePath('/painel/estoque');
  redirect('/painel/estoque?ok=item');
}

export async function recordLossAction(formData: FormData) {
  const context = await ctx();
  const supabase = await (await import('@/lib/supabase/server')).createClient();
  const itemId = str(formData.get('inventory_item_id'));
  const qty = Math.abs(number(formData.get('quantity')));
  const unit = str(formData.get('unit'));
  if (!itemId || qty <= 0 || !unit) redirect('/painel/estoque?erro=' + encodeURIComponent('Informe item, quantidade e unidade.'));

  const { error } = await supabase.from('inventory_movements').insert({
    business_id: context.business.id,
    inventory_item_id: itemId,
    movement_type: 'LOSS',
    quantity_delta: -qty,
    unit,
    notes: str(formData.get('reason')) || 'Perda registrada',
    created_by: context.user.id
  });
  if (error) redirect('/painel/estoque?erro=' + encodeURIComponent(error.message));
  revalidatePath('/painel/estoque');
  redirect('/painel/estoque?ok=perda');
}

export type OrderInput = {
  customerId?: string | null;
  scheduledAt?: string | null;
  fulfillmentType: 'pickup' | 'delivery';
  notes?: string;
  depositRequired?: number;
  deliveryFee?: number;
  items: Array<{
    productId: string;
    variantId?: string | null;
    name: string;
    quantity: number;
    unitPrice: number;
    recipeVersionId?: string | null;
    configuration?: Record<string, unknown>;
  }>;
};

export async function createOrderAction(input: OrderInput) {
  const context = await ctx();
  const supabase = await (await import('@/lib/supabase/server')).createClient();
  if (!input.items?.length) return { ok: false, error: 'Adicione pelo menos um produto.' };

  const subtotal = input.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  const deliveryFee = Number(input.deliveryFee || 0);
  const total = subtotal + deliveryFee;

  const { data: order, error } = await supabase.from('orders').insert({
    business_id: context.business.id,
    customer_id: input.customerId || null,
    status: 'draft',
    fulfillment_type: input.fulfillmentType || 'pickup',
    scheduled_at: input.scheduledAt || null,
    subtotal,
    delivery_fee: deliveryFee,
    total,
    deposit_required: Number(input.depositRequired || 0),
    notes: input.notes || null
  }).select('id,order_number').single();

  if (error || !order) return { ok: false, error: error?.message ?? 'Não foi possível criar a encomenda.' };

  const rows = input.items.map((item) => ({
    business_id: context.business.id,
    order_id: order.id,
    product_id: item.productId || null,
    product_variant_id: item.variantId || null,
    name_snapshot: item.name,
    quantity: Number(item.quantity),
    unit_price: Number(item.unitPrice),
    total_price: Number(item.quantity) * Number(item.unitPrice),
    configuration: item.configuration ?? {},
    recipe_version_id: item.recipeVersionId || null
  }));

  const { error: itemsError } = await supabase.from('order_items').insert(rows);
  if (itemsError) {
    await supabase.from('orders').delete().eq('id', order.id);
    return { ok: false, error: itemsError.message };
  }

  revalidatePath('/painel/pedidos');
  revalidatePath('/painel/agenda');
  return { ok: true, orderId: order.id, orderNumber: order.order_number };
}

export async function confirmOrderAction(orderId: string) {
  const context = await ctx();
  const supabase = await (await import('@/lib/supabase/server')).createClient();
  const { data, error } = await supabase.rpc('reserve_order_inventory', { p_order_id: orderId });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/painel');
  revalidatePath('/painel/pedidos');
  revalidatePath('/painel/estoque');
  return { ok: true, result: data, businessId: context.business.id };
}

export async function startProductionAction(orderId: string) {
  await ctx();
  const supabase = await (await import('@/lib/supabase/server')).createClient();
  const { data, error } = await supabase.rpc('start_order_production', { p_order_id: orderId });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/painel');
  revalidatePath('/painel/pedidos');
  revalidatePath('/painel/producao');
  revalidatePath('/painel/estoque');
  return data as { ok: boolean; reason?: string; shortages?: unknown[] };
}

export async function finishProductionAction(orderId: string) {
  await ctx();
  const supabase = await (await import('@/lib/supabase/server')).createClient();
  const { data, error } = await supabase.rpc('finish_order_production', { p_order_id: orderId });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/painel');
  revalidatePath('/painel/pedidos');
  revalidatePath('/painel/producao');
  return data as { ok: boolean };
}

export async function cancelOrderAction(orderId: string) {
  await ctx();
  const supabase = await (await import('@/lib/supabase/server')).createClient();
  const { error } = await supabase.rpc('cancel_order_and_release', { p_order_id: orderId });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/painel/pedidos');
  revalidatePath('/painel/estoque');
  return { ok: true };
}

export async function completeOrderAction(orderId: string) {
  const context = await ctx();
  const supabase = await (await import('@/lib/supabase/server')).createClient();
  const { data: order } = await supabase.from('orders').select('status').eq('id', orderId).single();
  if (!order || !['ready', 'out_for_delivery'].includes(order.status)) return { ok: false, error: 'Pedido ainda não está pronto.' };
  const { error } = await supabase.from('orders').update({ status: 'completed' }).eq('id', orderId);
  if (error) return { ok: false, error: error.message };
  await supabase.from('order_status_history').insert({ business_id: context.business.id, order_id: orderId, from_status: order.status, to_status: 'completed', changed_by: context.user.id });
  revalidatePath('/painel/pedidos');
  return { ok: true };
}

export type RecipeInput = {
  productId?: string | null;
  variantId?: string | null;
  name: string;
  confidentiality: 'owner_only' | 'authorized_team' | 'protected_production';
  yieldQty: number;
  yieldUnit: string;
  preparationNotes?: string;
  components: Array<{ type: 'inventory_item' | 'sub_recipe'; id: string; quantity: number; unit: string; visible?: boolean }>;
};

export async function createRecipeAction(input: RecipeInput) {
  const context = await requireOwner();
  const supabase = await (await import('@/lib/supabase/server')).createClient();
  if (!input.name.trim() || !input.components.length || input.yieldQty <= 0) return { ok: false, error: 'Preencha rendimento e ao menos um componente.' };

  const { data: recipe, error } = await supabase.from('recipes').insert({
    business_id: context.business.id,
    product_id: input.productId || null,
    product_variant_id: input.variantId || null,
    name: input.name.trim(),
    confidentiality: input.confidentiality,
    is_complete: false,
    created_by: context.user.id
  }).select('id').single();
  if (error || !recipe) return { ok: false, error: error?.message ?? 'Falha ao criar receita.' };

  const { data: version, error: versionError } = await supabase.from('recipe_versions').insert({
    business_id: context.business.id,
    recipe_id: recipe.id,
    version_no: 1,
    yield_qty: input.yieldQty,
    yield_unit: input.yieldUnit,
    preparation_notes: input.preparationNotes || null,
    created_by: context.user.id
  }).select('id').single();

  if (versionError || !version) {
    await supabase.from('recipes').delete().eq('id', recipe.id);
    return { ok: false, error: versionError?.message ?? 'Falha ao salvar versão.' };
  }

  const componentRows = input.components.map((component, index) => ({
    business_id: context.business.id,
    recipe_version_id: version.id,
    component_type: component.type,
    inventory_item_id: component.type === 'inventory_item' ? component.id : null,
    sub_recipe_id: component.type === 'sub_recipe' ? component.id : null,
    quantity: component.quantity,
    unit: component.unit,
    is_visible_in_production: component.visible !== false,
    sort_order: index
  }));

  const { error: componentsError } = await supabase.from('recipe_components').insert(componentRows);
  if (componentsError) {
    await supabase.from('recipes').delete().eq('id', recipe.id);
    return { ok: false, error: componentsError.message };
  }

  const { error: activateError } = await supabase.from('recipes').update({ active_version_id: version.id, is_complete: true }).eq('id', recipe.id);
  if (activateError) return { ok: false, error: activateError.message };

  await supabase.from('recipe_access_logs').insert({ business_id: context.business.id, recipe_id: recipe.id, user_id: context.user.id, action: 'created' });
  revalidatePath('/painel/cofre');
  revalidatePath('/painel/produtos');
  return { ok: true, recipeId: recipe.id };
}

export async function createSupplierAction(formData: FormData) {
  const context = await ctx();
  const supabase = await (await import('@/lib/supabase/server')).createClient();
  const { error } = await supabase.from('suppliers').insert({
    business_id: context.business.id,
    name: str(formData.get('name')),
    whatsapp: str(formData.get('whatsapp')) || null,
    email: str(formData.get('email')) || null,
    notes: str(formData.get('notes')) || null
  });
  if (error) redirect('/painel/compras?erro=' + encodeURIComponent(error.message));
  revalidatePath('/painel/compras');
  redirect('/painel/compras?ok=fornecedor');
}

export async function recordPurchaseAction(formData: FormData) {
  const context = await ctx();
  const supabase = await (await import('@/lib/supabase/server')).createClient();
  const itemId = str(formData.get('inventory_item_id'));
  const qty = number(formData.get('quantity'));
  const totalCost = number(formData.get('total_cost'));
  const unit = str(formData.get('unit'));
  if (!itemId || qty <= 0 || totalCost < 0 || !unit) redirect('/painel/compras?erro=' + encodeURIComponent('Revise os dados da compra.'));

  const { data: purchase, error } = await supabase.from('purchases').insert({
    business_id: context.business.id,
    supplier_id: str(formData.get('supplier_id')) || null,
    total: totalCost,
    payment_method: str(formData.get('payment_method')) || null,
    notes: str(formData.get('notes')) || null
  }).select('id').single();
  if (error || !purchase) redirect('/painel/compras?erro=' + encodeURIComponent(error?.message ?? 'Falha ao registrar compra.'));

  const unitCost = qty > 0 ? totalCost / qty : 0;
  const { error: itemError } = await supabase.from('purchase_items').insert({
    business_id: context.business.id,
    purchase_id: purchase.id,
    inventory_item_id: itemId,
    quantity: qty,
    unit,
    total_cost: totalCost,
    lot_code: str(formData.get('lot_code')) || null,
    expires_at: str(formData.get('expires_at')) || null
  });
  if (itemError) {
    await supabase.from('purchases').delete().eq('id', purchase.id);
    redirect('/painel/compras?erro=' + encodeURIComponent(itemError.message));
  }

  const { error: movementError } = await supabase.from('inventory_movements').insert({
    business_id: context.business.id,
    inventory_item_id: itemId,
    movement_type: 'PURCHASE',
    quantity_delta: qty,
    unit,
    unit_cost: unitCost,
    reference_type: 'purchase',
    reference_id: purchase.id,
    notes: 'Entrada por compra',
    created_by: context.user.id
  });
  if (movementError) {
    await supabase.from('purchases').delete().eq('id', purchase.id);
    redirect('/painel/compras?erro=' + encodeURIComponent(movementError.message));
  }

  await supabase.from('inventory_items').update({ average_unit_cost: unitCost }).eq('id', itemId);
  revalidatePath('/painel/compras');
  revalidatePath('/painel/estoque');
  redirect('/painel/compras?ok=compra');
}

export async function createExpenseAction(formData: FormData) {
  const context = await ctx();
  const supabase = await (await import('@/lib/supabase/server')).createClient();
  const amount = number(formData.get('amount'));
  const occurredAt = str(formData.get('occurred_at')) || new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from('expenses').insert({
    business_id: context.business.id,
    category: str(formData.get('category')) || 'outros',
    description: str(formData.get('description')),
    amount,
    occurred_at: occurredAt
  });
  if (error) redirect('/painel/financeiro?erro=' + encodeURIComponent(error.message));
  revalidatePath('/painel/financeiro');
  redirect('/painel/financeiro?ok=despesa');
}

export async function updateBusinessAction(formData: FormData) {
  const context = await requireOwner();
  const supabase = await (await import('@/lib/supabase/server')).createClient();
  const { error } = await supabase.from('businesses').update({
    name: str(formData.get('name')),
    whatsapp: str(formData.get('whatsapp')) || null,
    instagram: str(formData.get('instagram')) || null,
    city: str(formData.get('city')) || null
  }).eq('id', context.business.id);
  if (error) redirect('/painel/configuracoes?erro=' + encodeURIComponent(error.message));
  revalidatePath('/painel/configuracoes');
  revalidatePath('/painel');
  redirect('/painel/configuracoes?ok=dados');
}

export async function inviteMemberAction(formData: FormData) {
  const context = await requireOwner();
  const supabase = await (await import('@/lib/supabase/server')).createClient();
  const email = str(formData.get('email')).toLowerCase();
  const role = str(formData.get('role')) || 'production';
  const token = randomBytes(24).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { error } = await supabase.from('business_invitations').insert({
    business_id: context.business.id,
    email,
    role,
    token_hash: tokenHash,
    invited_by: context.user.id
  });
  if (error) redirect('/painel/equipe?erro=' + encodeURIComponent(error.message));
  revalidatePath('/painel/equipe');
  redirect('/painel/equipe?ok=convite&token=' + encodeURIComponent(token));
}
