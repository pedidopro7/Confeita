import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createProductAction } from '../actions';
import { money } from '@/lib/format';

export default async function ProdutosPage() {
  const context = await getBusinessContext(); if (!context) return null;
  const supabase = await createClient();
  const [productsResult, recipesResult] = await Promise.all([
    supabase.from('products').select('id,name,description,product_type,base_price,active').eq('business_id', context.business.id).order('name'),
    supabase.from('recipes').select('id,product_id,is_complete').eq('business_id', context.business.id)
  ]);
  const products = productsResult.data ?? [];
  const recipes = recipesResult.data ?? [];
  const recipeByProduct = new Map(recipes.map(r => [r.product_id, r]));

  return <><PageHeader eyebrow="Catálogo interno" title="Produtos" description="Cadastre o que você vende e conecte cada produto à sua fórmula protegida." />
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{products.length === 0 ? <div className="panel col-span-full p-8 text-center text-sm text-graphite/50">Cadastre seu primeiro produto.</div> : products.map(p => { const recipe = recipeByProduct.get(p.id); return <div key={p.id} className="panel p-5"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="m-0 font-black text-wine">{p.name}</p><p className="mt-1 text-xs text-graphite/45">{p.product_type}</p></div><span className="text-sm font-black text-terracotta">{money(p.base_price)}</span></div><p className="min-h-10 text-xs leading-5 text-graphite/50">{p.description || 'Sem descrição.'}</p>{recipe ? <Link href="/painel/cofre" className="mt-4 flex items-center justify-between rounded-2xl bg-wine/5 px-3 py-2.5 text-xs font-bold text-wine"><span className="flex items-center gap-2"><LockKeyhole size={14} /> Receita protegida</span><span>{recipe.is_complete ? 'Completa' : 'Incompleta'}</span></Link> : <Link href={`/painel/cofre/nova?produto=${p.id}`} className="mt-4 flex items-center justify-between rounded-2xl bg-terracotta/10 px-3 py-2.5 text-xs font-bold text-terracotta"><span className="flex items-center gap-2"><LockKeyhole size={14} /> Vincular receita</span><span>+</span></Link>}</div>; })}</section>
      <form action={createProductAction} className="panel h-fit p-5"><p className="eyebrow mb-1">Novo item</p><h2 className="mt-0 text-xl font-black text-wine">Cadastrar produto</h2><div className="space-y-3"><input required name="name" placeholder="Ex.: Brigadeiro Gourmet" className="input" /><textarea name="description" placeholder="Descrição" className="input min-h-20 py-3" /><select name="product_type" className="input"><option value="simple">Simples</option><option value="sized">Por tamanho</option><option value="configurable">Configurável</option><option value="kit">Kit</option></select><input required min="0" step="0.01" type="number" name="base_price" placeholder="Preço base" className="input" /></div><button className="mt-4 h-11 w-full rounded-2xl bg-wine text-sm font-bold text-cream">Salvar produto</button></form>
    </div>
  </>;
}
