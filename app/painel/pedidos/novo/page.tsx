import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { OrderBuilder } from '@/components/order-builder';
import { getBusinessContext, hasPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function NovoPedidoPage() {
  const context = await getBusinessContext();
  if (!context) return null;
  if (!hasPermission(context, 'manage_orders')) redirect('/painel?erro=' + encodeURIComponent('Seu perfil não pode criar encomendas.'));
  const supabase = await createClient();

  const [customersResult, productsResult, variantsResult, groupsResult, optionsResult, recipesResult] = await Promise.all([
    supabase.from('customers').select('id,name').eq('business_id', context.business.id).order('name'),
    supabase.from('products').select('id,name,base_price,recipe_output_qty,recipe_output_unit').eq('business_id', context.business.id).eq('active', true).order('name'),
    supabase.from('product_variants').select('id,product_id,name,price,recipe_output_qty,recipe_output_unit').eq('business_id', context.business.id).eq('active', true).order('name'),
    supabase.from('product_option_groups').select('id,product_id,name,selection_type,min_select,max_select,sort_order').eq('business_id', context.business.id).eq('active', true).order('sort_order'),
    supabase.from('product_options').select('id,group_id,name,price_delta,recipe_id,recipe_output_qty,recipe_output_unit,sort_order').eq('business_id', context.business.id).eq('active', true).order('sort_order'),
    supabase.from('recipes').select('id,product_id,product_variant_id,active_version_id,is_complete').eq('business_id', context.business.id).eq('is_complete', true)
  ]);

  const customers = customersResult.data ?? [];
  const products = productsResult.data ?? [];
  const variants = variantsResult.data ?? [];
  const groups = groupsResult.data ?? [];
  const options = optionsResult.data ?? [];
  const recipes = recipesResult.data ?? [];

  const baseRecipeByProduct = new Map(recipes.filter((recipe) => !recipe.product_variant_id && recipe.product_id).map((recipe) => [recipe.product_id as string, recipe.active_version_id]));
  const recipeByVariant = new Map(recipes.filter((recipe) => recipe.product_variant_id).map((recipe) => [recipe.product_variant_id as string, recipe.active_version_id]));
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe.active_version_id]));

  const data = products.map((product) => ({
    id: product.id,
    name: product.name,
    basePrice: Number(product.base_price),
    recipeOutputQty: Number(product.recipe_output_qty) || 1,
    recipeOutputUnit: product.recipe_output_unit,
    recipeVersionId: baseRecipeByProduct.get(product.id) ?? null,
    variants: variants.filter((variant) => variant.product_id === product.id).map((variant) => ({
      id: variant.id,
      name: variant.name,
      price: Number(variant.price),
      recipeOutputQty: Number(variant.recipe_output_qty) || 1,
      recipeOutputUnit: variant.recipe_output_unit,
      recipeVersionId: recipeByVariant.get(variant.id) ?? baseRecipeByProduct.get(product.id) ?? null
    })),
    groups: groups.filter((group) => group.product_id === product.id).map((group) => ({
      id: group.id,
      name: group.name,
      selectionType: group.selection_type === 'multiple' ? 'multiple' as const : 'single' as const,
      minSelect: group.min_select,
      maxSelect: group.max_select,
      options: options.filter((option) => option.group_id === group.id).map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: Number(option.price_delta),
        recipeId: option.recipe_id,
        recipeVersionId: option.recipe_id ? recipeById.get(option.recipe_id) ?? null : null,
        recipeOutputQty: Number(option.recipe_output_qty) || 1,
        recipeOutputUnit: option.recipe_output_unit
      }))
    }))
  }));

  return <>
    <PageHeader eyebrow="Nova venda" title="Nova encomenda" description="Escolha tamanho, recheios e extras. Ao confirmar, a Confeita reserva todas as receitas vinculadas." />
    <OrderBuilder customers={customers} products={data} />
  </>;
}
