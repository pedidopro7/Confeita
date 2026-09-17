import { PageHeader } from '@/components/page-header';
import { RecipeBuilder } from '@/components/recipe-builder';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function NovaReceitaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requireOwner();
  const params = await searchParams;
  const initialProductId = typeof params.produto === 'string' ? params.produto : undefined;
  const initialVariantId = typeof params.variante === 'string' ? params.variante : undefined;
  const supabase = await createClient();
  const [{ data: items }, { data: products }, { data: variants }, { data: recipes }] = await Promise.all([
    supabase.from('inventory_items').select('id,name,base_unit').eq('business_id', context.business.id).eq('active', true).order('name'),
    supabase.from('products').select('id,name').eq('business_id', context.business.id).eq('active', true).order('name'),
    supabase.from('product_variants').select('id,product_id,name').eq('business_id', context.business.id).eq('active', true).order('name'),
    supabase.from('recipes').select('id,name').eq('business_id', context.business.id).eq('is_complete', true).order('name')
  ]);

  return <>
    <PageHeader eyebrow="Área confidencial" title="Nova fórmula" description="Informe somente o necessário para estoque e custo. Seu modo de preparo pode permanecer fora do sistema." />
    <RecipeBuilder
      items={items ?? []}
      products={products ?? []}
      variants={variants ?? []}
      recipes={recipes ?? []}
      initialProductId={initialProductId}
      initialVariantId={initialVariantId}
    />
  </>;
}
