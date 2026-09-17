import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { LockKeyhole, Plus, SlidersHorizontal, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { getBusinessContext, hasPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, numberPt } from '@/lib/format';
import {
  createProductOptionAction,
  createProductOptionGroupAction,
  createProductVariantAction,
  updateProductCatalogAction
} from '../actions';

type Variant = {
  id: string;
  name: string;
  sku: string | null;
  price: number | string;
  recipe_output_qty: number | string;
  recipe_output_unit: string;
  active: boolean;
};

type Option = {
  id: string;
  name: string;
  price_delta: number | string;
  recipe_id: string | null;
  recipe_output_qty: number | string;
  recipe_output_unit: string;
  active: boolean;
  sort_order: number;
};

type Group = {
  id: string;
  name: string;
  selection_type: string;
  min_select: number;
  max_select: number | null;
  sort_order: number;
  active: boolean;
  options: Option[] | null;
};

type Recipe = {
  id: string;
  name: string;
  product_id: string | null;
  product_variant_id: string | null;
  active_version_id: string | null;
  is_complete: boolean;
};

export default async function ProdutoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getBusinessContext();
  if (!context) return null;
  if (!hasPermission(context, 'manage_products')) redirect('/painel?erro=' + encodeURIComponent('Seu perfil não pode editar produtos.'));
  const supabase = await createClient();

  const [{ data: product }, { data: variantRows }, { data: groupRows }, { data: recipeRows }] = await Promise.all([
    supabase.from('products').select('id,name,description,product_type,base_price,sale_unit,recipe_output_qty,recipe_output_unit,active').eq('business_id', context.business.id).eq('id', id).maybeSingle(),
    supabase.from('product_variants').select('id,name,sku,price,recipe_output_qty,recipe_output_unit,active').eq('business_id', context.business.id).eq('product_id', id).order('created_at'),
    supabase.from('product_option_groups').select('id,name,selection_type,min_select,max_select,sort_order,active,options:product_options(id,name,price_delta,recipe_id,recipe_output_qty,recipe_output_unit,active,sort_order)').eq('business_id', context.business.id).eq('product_id', id).order('sort_order'),
    supabase.from('recipes').select('id,name,product_id,product_variant_id,active_version_id,is_complete').eq('business_id', context.business.id).order('name')
  ]);

  if (!product) notFound();
  const variants = (variantRows ?? []) as Variant[];
  const groups = (groupRows ?? []) as unknown as Group[];
  const recipes = (recipeRows ?? []) as Recipe[];
  const productRecipes = recipes.filter((recipe) => recipe.product_id === id);
  const baseRecipe = productRecipes.find((recipe) => !recipe.product_variant_id);
  const recipeByVariant = new Map(productRecipes.filter((recipe) => recipe.product_variant_id).map((recipe) => [recipe.product_variant_id as string, recipe]));
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const availableOptionRecipes = recipes.filter((recipe) => recipe.is_complete && recipe.active_version_id);

  return <>
    <PageHeader eyebrow="Catálogo configurável" title={product.name} description="Tamanhos, escolhas e fórmulas podem mudar o preço e o consumo do estoque sem complicar o pedido." />

    <div className="grid gap-5 xl:grid-cols-[1fr_370px]">
      <div className="space-y-5">
        <section className="panel p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="eyebrow mb-1">Fórmula principal</p><h2 className="m-0 text-xl font-black text-wine">Receita secreta do produto</h2></div>
            {baseRecipe?.is_complete ? <Link href="/painel/cofre" className="inline-flex h-10 items-center gap-2 rounded-2xl bg-wine px-4 text-xs font-bold text-cream"><LockKeyhole size={14}/> Protegida no Cofre</Link> : <Link href={`/painel/cofre/nova?produto=${product.id}`} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-terracotta px-4 text-xs font-bold text-white"><LockKeyhole size={14}/> Vincular receita</Link>}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3"><Info label="Preço base" value={money(product.base_price)} /><Info label="Venda" value={product.sale_unit || 'un'} /><Info label="Rendimento base" value={`${numberPt(product.recipe_output_qty)} ${product.recipe_output_unit}`} /></div>
        </section>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-wine/10 px-5 py-4"><div><p className="eyebrow mb-1">Tamanhos e formatos</p><h2 className="m-0 text-lg font-black text-wine">Variantes</h2></div><span className="rounded-full bg-cream px-3 py-1 text-[10px] font-bold text-wine">{variants.length}</span></div>
          {variants.length === 0 ? <div className="p-7 text-center text-xs text-graphite/45">Use variantes para 1kg, 2kg, 3kg, caixas de 6/12 unidades ou outros formatos.</div> : <div className="divide-y divide-wine/5">{variants.map((variant) => {
            const recipe = recipeByVariant.get(variant.id);
            return <div key={variant.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_130px_180px] md:items-center"><div><p className="m-0 text-sm font-black text-graphite">{variant.name}</p><p className="m-0 mt-1 text-xs text-graphite/40">{variant.sku ? `SKU ${variant.sku} · ` : ''}{numberPt(variant.recipe_output_qty)} {variant.recipe_output_unit}</p></div><strong className="text-sm text-wine">{money(variant.price)}</strong>{recipe?.is_complete ? <span className="inline-flex items-center gap-2 text-xs font-bold text-success"><LockKeyhole size={13}/> Receita protegida</span> : <Link href={`/painel/cofre/nova?produto=${product.id}&variante=${variant.id}`} className="inline-flex items-center gap-2 text-xs font-bold text-terracotta"><Plus size={13}/> Vincular fórmula</Link>}</div>;
          })}</div>}
        </section>

        <section className="space-y-3">
          <div className="flex items-end justify-between"><div><p className="eyebrow mb-1">Personalização</p><h2 className="m-0 text-xl font-black text-wine">Grupos de escolha</h2></div><SlidersHorizontal className="text-wine/25" /></div>
          {groups.length === 0 ? <div className="panel p-8 text-center text-xs text-graphite/45">Ex.: Massa, Recheio, Cobertura, Decoração e Extras.</div> : groups.map((group) => {
            const options = (group.options ?? []).filter((option) => option.active).sort((a, b) => a.sort_order - b.sort_order);
            return <article key={group.id} className="panel overflow-hidden">
              <div className="flex flex-col gap-2 border-b border-wine/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="m-0 text-sm font-black text-wine">{group.name}</p><p className="m-0 mt-1 text-[10px] uppercase tracking-wider text-graphite/35">{group.selection_type === 'multiple' ? 'Múltiplas escolhas' : 'Escolha única'} · mínimo {group.min_select}{group.max_select ? ` · máximo ${group.max_select}` : ''}</p></div><span className="text-xs font-bold text-graphite/40">{options.length} opções</span></div>
              <div className="divide-y divide-wine/5">{options.length === 0 ? <div className="px-5 py-5 text-xs text-graphite/40">Nenhuma opção cadastrada.</div> : options.map((option) => {
                const linkedRecipe = option.recipe_id ? recipeById.get(option.recipe_id) : undefined;
                return <div key={option.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-xs"><span className="min-w-0 flex-1 font-bold text-graphite">{option.name}</span><span className="font-bold text-terracotta">{Number(option.price_delta) === 0 ? 'sem acréscimo' : `${Number(option.price_delta) > 0 ? '+' : ''}${money(option.price_delta)}`}</span><span className={`inline-flex items-center gap-1 font-bold ${linkedRecipe ? 'text-wine' : 'text-graphite/30'}`}><LockKeyhole size={11}/>{linkedRecipe ? `${numberPt(option.recipe_output_qty)} ${option.recipe_output_unit} · ${linkedRecipe.name}` : 'Sem receita extra'}</span></div>;
              })}</div>
            </article>;
          })}
        </section>
      </div>

      <aside className="space-y-5">
        <form action={updateProductCatalogAction} className="panel p-5">
          <input type="hidden" name="product_id" value={product.id}/><p className="eyebrow mb-1">Dados do produto</p><h2 className="mt-0 text-lg font-black text-wine">Configuração geral</h2>
          <div className="space-y-3"><input required name="name" defaultValue={product.name} className="input" /><textarea name="description" defaultValue={product.description ?? ''} className="input min-h-20 py-3" placeholder="Descrição" /><select name="product_type" defaultValue={product.product_type} className="input"><option value="simple">Simples</option><option value="sized">Por tamanho</option><option value="configurable">Configurável</option><option value="kit">Kit</option></select><div className="grid grid-cols-2 gap-3"><input name="base_price" type="number" min="0" step="0.01" defaultValue={Number(product.base_price)} className="input"/><select name="sale_unit" defaultValue={product.sale_unit} className="input"><option value="un">unidade</option><option value="kg">kg</option><option value="cento">cento</option><option value="caixa">caixa</option><option value="kit">kit</option></select></div><div className="grid grid-cols-2 gap-3"><input name="recipe_output_qty" type="number" min="0.0001" step="0.0001" defaultValue={Number(product.recipe_output_qty)} className="input"/><select name="recipe_output_unit" defaultValue={product.recipe_output_unit} className="input"><option value="un">un</option><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="L">L</option></select></div></div>
          <button className="mt-4 h-11 w-full rounded-2xl bg-wine text-sm font-bold text-cream">Salvar alterações</button>
        </form>

        <form action={createProductVariantAction} className="panel p-5">
          <input type="hidden" name="product_id" value={product.id}/><p className="eyebrow mb-1">Novo tamanho</p><h2 className="mt-0 text-lg font-black text-wine">Adicionar variante</h2>
          <div className="space-y-3"><input required name="name" placeholder="Ex.: 2kg" className="input"/><div className="grid grid-cols-2 gap-3"><input name="sku" placeholder="SKU opcional" className="input"/><input required name="price" min="0" step="0.01" type="number" placeholder="Preço" className="input"/></div><div className="grid grid-cols-2 gap-3"><input name="recipe_output_qty" type="number" min="0.0001" step="0.0001" defaultValue="1" className="input"/><select name="recipe_output_unit" className="input"><option value="un">un</option><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="L">L</option></select></div></div>
          <button className="mt-4 h-10 w-full rounded-2xl bg-terracotta text-xs font-bold text-white">Adicionar variante</button>
        </form>

        <form action={createProductOptionGroupAction} className="panel p-5">
          <input type="hidden" name="product_id" value={product.id}/><p className="eyebrow mb-1">Nova escolha</p><h2 className="mt-0 text-lg font-black text-wine">Criar grupo</h2>
          <div className="space-y-3"><input required name="name" placeholder="Ex.: Recheio" className="input"/><select name="selection_type" className="input"><option value="single">Escolha única</option><option value="multiple">Múltiplas escolhas</option></select><div className="grid grid-cols-2 gap-3"><input name="min_select" type="number" min="0" defaultValue="0" placeholder="Mínimo" className="input"/><input name="max_select" type="number" min="1" placeholder="Máximo" className="input"/></div></div>
          <button className="mt-4 h-10 w-full rounded-2xl bg-cream text-xs font-bold text-wine">Criar grupo</button>
        </form>

        {groups.length > 0 && <form action={createProductOptionAction} className="panel p-5">
          <input type="hidden" name="product_id" value={product.id}/><p className="eyebrow mb-1">Nova opção</p><h2 className="mt-0 text-lg font-black text-wine">Adicionar escolha</h2>
          <div className="space-y-3"><select required name="group_id" className="input"><option value="">Escolha o grupo</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><input required name="name" placeholder="Ex.: Ninho com morango" className="input"/><input name="price_delta" type="number" step="0.01" defaultValue="0" placeholder="Acréscimo" className="input"/><select name="recipe_id" className="input"><option value="">Sem receita extra</option>{availableOptionRecipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</select><div><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-graphite/35">Quanto desta receita cada escolha consome</p><div className="grid grid-cols-2 gap-3"><input name="recipe_output_qty" type="number" min="0.0001" step="0.0001" defaultValue="1" className="input"/><select name="recipe_output_unit" className="input"><option value="un">un</option><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="L">L</option></select></div></div></div>
          <button className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-wine text-xs font-bold text-cream"><Sparkles size={13}/> Adicionar opção</button>
        </form>}
      </aside>
    </div>
  </>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-cream/70 p-4"><p className="eyebrow mb-1">{label}</p><p className="m-0 text-sm font-black text-wine">{value}</p></div>;
}
