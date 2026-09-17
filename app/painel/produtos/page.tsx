import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LockKeyhole, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { getBusinessContext, hasPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money } from '@/lib/format';
import { createProductCatalogAction } from './actions';

export default async function ProdutosPage() {
  const context = await getBusinessContext(); if (!context) return null; if (!hasPermission(context, 'manage_products')) redirect('/painel?erro=' + encodeURIComponent('Seu perfil não pode acessar produtos.'));
  if (!context) return null;
  const supabase = await createClient();
  const [{ data: productRows }, { data: recipeRows }, { data: variantRows }, { data: groupRows }] = await Promise.all([
    supabase.from('products').select('id,name,description,product_type,base_price,active,sale_unit').eq('business_id', context.business.id).order('name'),
    supabase.from('recipes').select('id,product_id,product_variant_id,is_complete').eq('business_id', context.business.id),
    supabase.from('product_variants').select('id,product_id').eq('business_id', context.business.id).eq('active', true),
    supabase.from('product_option_groups').select('id,product_id').eq('business_id', context.business.id).eq('active', true)
  ]);

  const products = productRows ?? [];
  const recipes = recipeRows ?? [];
  const recipeByProduct = new Map(recipes.filter((r) => !r.product_variant_id).map((r) => [r.product_id, r]));
  const variantCount = new Map<string, number>();
  const groupCount = new Map<string, number>();
  for (const row of variantRows ?? []) variantCount.set(row.product_id, (variantCount.get(row.product_id) ?? 0) + 1);
  for (const row of groupRows ?? []) groupCount.set(row.product_id, (groupCount.get(row.product_id) ?? 0) + 1);

  return <>
    <PageHeader eyebrow="Catálogo interno" title="Produtos" description="Cadastre o que você vende e conecte tamanhos, escolhas e fórmulas protegidas." />
    <div className="grid gap-5 xl:grid-cols-[1fr_370px]">
      <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {products.length === 0 ? <div className="panel col-span-full p-10 text-center text-sm text-graphite/50">Cadastre seu primeiro produto para começar.</div> : products.map((product) => {
          const recipe = recipeByProduct.get(product.id);
          const variants = variantCount.get(product.id) ?? 0;
          const groups = groupCount.get(product.id) ?? 0;
          return <Link href={`/painel/produtos/${product.id}`} key={product.id} className="panel group p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-3"><div><p className="m-0 font-black text-wine">{product.name}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-graphite/35">{product.product_type}</p></div><span className="text-sm font-black text-terracotta">{money(product.base_price)}</span></div>
            <p className="min-h-10 text-xs leading-5 text-graphite/50">{product.description || 'Sem descrição.'}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] font-bold"><span className="rounded-xl bg-cream/80 px-3 py-2 text-wine">{variants} variante{variants === 1 ? '' : 's'}</span><span className="rounded-xl bg-cream/80 px-3 py-2 text-wine">{groups} grupo{groups === 1 ? '' : 's'}</span></div>
            <div className={`mt-2 flex items-center justify-between rounded-2xl px-3 py-2.5 text-xs font-bold ${recipe?.is_complete ? 'bg-wine/5 text-wine' : 'bg-terracotta/10 text-terracotta'}`}><span className="flex items-center gap-2"><LockKeyhole size={14}/>{recipe?.is_complete ? 'Receita protegida' : 'Vincular receita'}</span><span>→</span></div>
          </Link>;
        })}
      </section>

      <form action={createProductCatalogAction} className="panel h-fit p-5 xl:sticky xl:top-8">
        <div className="flex items-start justify-between"><div><p className="eyebrow mb-1">Novo item</p><h2 className="mt-0 text-xl font-black text-wine">Cadastrar produto</h2></div><SlidersHorizontal className="text-wine/20"/></div>
        <div className="space-y-3">
          <input required name="name" placeholder="Ex.: Bolo Ninho com Morango" className="input"/>
          <textarea name="description" placeholder="Descrição" className="input min-h-20 py-3"/>
          <select name="product_type" className="input"><option value="simple">Simples</option><option value="sized">Por tamanho</option><option value="configurable">Configurável</option><option value="kit">Kit</option></select>
          <div className="grid grid-cols-2 gap-3"><input required min="0" step="0.01" type="number" name="base_price" placeholder="Preço base" className="input"/><select name="sale_unit" className="input"><option value="un">unidade</option><option value="kg">kg</option><option value="cento">cento</option><option value="caixa">caixa</option><option value="kit">kit</option></select></div>
          <div><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-graphite/35">Rendimento que a receita representa</p><div className="grid grid-cols-2 gap-3"><input name="recipe_output_qty" type="number" min="0.0001" step="0.0001" defaultValue="1" className="input"/><select name="recipe_output_unit" className="input"><option value="un">un</option><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="L">L</option></select></div></div>
        </div>
        <button className="mt-4 h-11 w-full rounded-2xl bg-wine text-sm font-bold text-cream">Salvar e configurar</button>
      </form>
    </div>
  </>;
}
