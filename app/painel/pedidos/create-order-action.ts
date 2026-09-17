'use server';

import { revalidatePath } from 'next/cache';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export type ConfiguredOrderInput = {
  customerId?: string | null;
  scheduledAt?: string | null;
  fulfillmentType: 'pickup' | 'delivery';
  notes?: string;
  depositRequired?: number;
  deliveryFee?: number;
  items: Array<{
    productId: string;
    variantId?: string | null;
    quantity: number;
    optionIds?: string[];
  }>;
};

type ProductRow = { id: string; name: string; base_price: number | string; recipe_output_qty: number | string; recipe_output_unit: string };
type VariantRow = { id: string; product_id: string; name: string; price: number | string; recipe_output_qty: number | string; recipe_output_unit: string };
type GroupRow = { id: string; product_id: string; name: string; selection_type: string; min_select: number; max_select: number | null };
type OptionRow = { id: string; group_id: string; name: string; price_delta: number | string; recipe_id: string | null; recipe_output_qty: number | string; recipe_output_unit: string };
type RecipeRow = { id: string; product_id: string | null; product_variant_id: string | null; active_version_id: string | null; is_complete: boolean };

export async function createConfiguredOrderAction(input: ConfiguredOrderInput) {
  const context = await getBusinessContext();
  if (!context) return { ok: false, error: 'Confeitaria não encontrada.' } as const;
  if (!input.items?.length) return { ok: false, error: 'Adicione pelo menos um produto.' } as const;
  if (input.items.some((item) => !item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0)) return { ok: false, error: 'Existe um item com quantidade inválida.' } as const;

  const supabase = await createClient();
  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const variantIds = [...new Set(input.items.map((item) => item.variantId).filter((id): id is string => Boolean(id)))];
  const optionIds = [...new Set(input.items.flatMap((item) => item.optionIds ?? []))];

  const [productsResult, variantsResult, groupsResult, optionsResult, recipesResult] = await Promise.all([
    supabase.from('products').select('id,name,base_price,recipe_output_qty,recipe_output_unit').eq('business_id', context.business.id).eq('active', true).in('id', productIds),
    variantIds.length ? supabase.from('product_variants').select('id,product_id,name,price,recipe_output_qty,recipe_output_unit').eq('business_id', context.business.id).eq('active', true).in('id', variantIds) : Promise.resolve({ data: [] as VariantRow[], error: null }),
    supabase.from('product_option_groups').select('id,product_id,name,selection_type,min_select,max_select').eq('business_id', context.business.id).eq('active', true).in('product_id', productIds),
    optionIds.length ? supabase.from('product_options').select('id,group_id,name,price_delta,recipe_id,recipe_output_qty,recipe_output_unit').eq('business_id', context.business.id).eq('active', true).in('id', optionIds) : Promise.resolve({ data: [] as OptionRow[], error: null }),
    supabase.from('recipes').select('id,product_id,product_variant_id,active_version_id,is_complete').eq('business_id', context.business.id).eq('is_complete', true).in('product_id', productIds)
  ]);

  const queryError = productsResult.error || variantsResult.error || groupsResult.error || optionsResult.error || recipesResult.error;
  if (queryError) return { ok: false, error: queryError.message } as const;

  const products = (productsResult.data ?? []) as ProductRow[];
  const variants = (variantsResult.data ?? []) as VariantRow[];
  const groups = (groupsResult.data ?? []) as GroupRow[];
  const options = (optionsResult.data ?? []) as OptionRow[];
  const recipes = (recipesResult.data ?? []) as RecipeRow[];

  if (products.length !== productIds.length) return { ok: false, error: 'Um produto não pertence a esta confeitaria ou está inativo.' } as const;

  const productById = new Map(products.map((row) => [row.id, row]));
  const variantById = new Map(variants.map((row) => [row.id, row]));
  const groupById = new Map(groups.map((row) => [row.id, row]));
  const optionById = new Map(options.map((row) => [row.id, row]));
  const baseRecipeByProduct = new Map(recipes.filter((row) => !row.product_variant_id && row.active_version_id).map((row) => [row.product_id as string, row]));
  const recipeByVariant = new Map(recipes.filter((row) => row.product_variant_id && row.active_version_id).map((row) => [row.product_variant_id as string, row]));

  const optionRecipeIds = [...new Set(options.map((option) => option.recipe_id).filter((id): id is string => Boolean(id)))];
  let optionRecipes: RecipeRow[] = [];
  if (optionRecipeIds.length) {
    const { data, error } = await supabase.from('recipes').select('id,product_id,product_variant_id,active_version_id,is_complete').eq('business_id', context.business.id).eq('is_complete', true).in('id', optionRecipeIds);
    if (error) return { ok: false, error: error.message } as const;
    optionRecipes = (data ?? []) as RecipeRow[];
  }
  const optionRecipeById = new Map(optionRecipes.map((row) => [row.id, row]));

  const rows: Array<Record<string, unknown>> = [];
  let subtotal = 0;

  for (const item of input.items) {
    const product = productById.get(item.productId);
    if (!product) return { ok: false, error: 'Produto inválido.' } as const;

    const variant = item.variantId ? variantById.get(item.variantId) : undefined;
    if (item.variantId && (!variant || variant.product_id !== product.id)) return { ok: false, error: `A variante escolhida não pertence a ${product.name}.` } as const;

    const selected = (item.optionIds ?? []).map((id) => optionById.get(id));
    if (selected.some((option) => !option)) return { ok: false, error: `Existe uma opção inválida em ${product.name}.` } as const;
    const selectedOptions = selected.filter((option): option is OptionRow => Boolean(option));

    const productGroups = groups.filter((group) => group.product_id === product.id);
    for (const group of productGroups) {
      const chosen = selectedOptions.filter((option) => option.group_id === group.id);
      if (chosen.length < group.min_select) return { ok: false, error: `${product.name}: escolha pelo menos ${group.min_select} opção(ões) em ${group.name}.` } as const;
      if (group.selection_type === 'single' && chosen.length > 1) return { ok: false, error: `${product.name}: ${group.name} aceita apenas uma opção.` } as const;
      if (group.max_select !== null && chosen.length > group.max_select) return { ok: false, error: `${product.name}: escolha no máximo ${group.max_select} opção(ões) em ${group.name}.` } as const;
    }
    for (const option of selectedOptions) {
      const group = groupById.get(option.group_id);
      if (!group || group.product_id !== product.id) return { ok: false, error: `A opção ${option.name} não pertence a ${product.name}.` } as const;
    }

    const basePrice = Number(variant ? variant.price : product.base_price);
    const optionsPrice = selectedOptions.reduce((sum, option) => sum + Number(option.price_delta), 0);
    const unitPrice = basePrice + optionsPrice;
    const quantity = Number(item.quantity);
    subtotal += unitPrice * quantity;

    const mainRecipe = (variant && recipeByVariant.get(variant.id)) || baseRecipeByProduct.get(product.id);
    const outputQty = Number(variant ? variant.recipe_output_qty : product.recipe_output_qty) || 1;
    const outputUnit = variant ? variant.recipe_output_unit : product.recipe_output_unit;

    const configurationOptions = selectedOptions.map((option) => {
      const group = groupById.get(option.group_id)!;
      const recipe = option.recipe_id ? optionRecipeById.get(option.recipe_id) : undefined;
      return {
        id: option.id,
        groupId: group.id,
        groupName: group.name,
        name: option.name,
        priceDelta: Number(option.price_delta),
        recipeId: recipe?.id ?? null,
        recipeVersionId: recipe?.active_version_id ?? null,
        recipeOutputQty: Number(option.recipe_output_qty) || 1,
        recipeOutputUnit: option.recipe_output_unit || 'un'
      };
    });

    rows.push({
      business_id: context.business.id,
      product_id: product.id,
      product_variant_id: variant?.id ?? null,
      name_snapshot: variant ? `${product.name} · ${variant.name}` : product.name,
      quantity,
      unit_price: unitPrice,
      total_price: unitPrice * quantity,
      configuration: { variantName: variant?.name ?? null, options: configurationOptions },
      recipe_version_id: mainRecipe?.active_version_id ?? null,
      recipe_output_qty: outputQty,
      recipe_output_unit: outputUnit
    });
  }

  const deliveryFee = Math.max(Number(input.deliveryFee || 0), 0);
  const total = subtotal + deliveryFee;
  const { data: order, error: orderError } = await supabase.from('orders').insert({
    business_id: context.business.id,
    customer_id: input.customerId || null,
    status: 'draft',
    fulfillment_type: input.fulfillmentType || 'pickup',
    scheduled_at: input.scheduledAt || null,
    subtotal,
    delivery_fee: deliveryFee,
    total,
    deposit_required: Math.max(Number(input.depositRequired || 0), 0),
    notes: input.notes || null
  }).select('id,order_number').single();

  if (orderError || !order) return { ok: false, error: orderError?.message ?? 'Não foi possível criar a encomenda.' } as const;

  const { error: itemsError } = await supabase.from('order_items').insert(rows.map((row) => ({ ...row, order_id: order.id })));
  if (itemsError) {
    await supabase.from('orders').delete().eq('business_id', context.business.id).eq('id', order.id);
    return { ok: false, error: itemsError.message } as const;
  }

  revalidatePath('/painel');
  revalidatePath('/painel/pedidos');
  revalidatePath('/painel/agenda');
  return { ok: true, orderId: order.id, orderNumber: order.order_number } as const;
}
