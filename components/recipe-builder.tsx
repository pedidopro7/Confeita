'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole, Trash2 } from 'lucide-react';
import { createRecipeAction } from '@/app/painel/actions';

type Item = { id: string; name: string; base_unit: string };
type Product = { id: string; name: string };
type Variant = { id: string; product_id: string; name: string };
type Recipe = { id: string; name: string };
type Component = { type: 'inventory_item' | 'sub_recipe'; id: string; name: string; quantity: number; unit: string; visible: boolean };

type Props = {
  items: Item[];
  products: Product[];
  variants: Variant[];
  recipes: Recipe[];
  initialProductId?: string;
  initialVariantId?: string;
};

export function RecipeBuilder({ items, products, variants, recipes, initialProductId, initialVariantId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [productId, setProductId] = useState(initialProductId || '');
  const [variantId, setVariantId] = useState(initialVariantId || '');
  const [name, setName] = useState('');
  const [yieldQty, setYieldQty] = useState(1);
  const [yieldUnit, setYieldUnit] = useState('un');
  const [confidentiality, setConfidentiality] = useState<'owner_only' | 'authorized_team' | 'protected_production'>('owner_only');
  const [notes, setNotes] = useState('');
  const [components, setComponents] = useState<Component[]>([]);
  const [error, setError] = useState('');

  const availableVariants = useMemo(() => variants.filter((variant) => variant.product_id === productId), [variants, productId]);

  function chooseProduct(id: string) {
    setProductId(id);
    if (!variants.some((variant) => variant.id === variantId && variant.product_id === id)) setVariantId('');
  }

  function addItem(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item || components.some((component) => component.type === 'inventory_item' && component.id === id)) return;
    setComponents((current) => [...current, { type: 'inventory_item', id, name: item.name, quantity: 1, unit: item.base_unit, visible: true }]);
  }

  function addRecipe(id: string) {
    const recipe = recipes.find((candidate) => candidate.id === id);
    if (!recipe || components.some((component) => component.type === 'sub_recipe' && component.id === id)) return;
    setComponents((current) => [...current, { type: 'sub_recipe', id, name: recipe.name, quantity: 1, unit: 'g', visible: true }]);
  }

  function save() {
    setError('');
    startTransition(async () => {
      const result = await createRecipeAction({
        productId: productId || null,
        variantId: variantId || null,
        name,
        confidentiality,
        yieldQty,
        yieldUnit,
        preparationNotes: notes,
        components: components.map((component) => ({ type: component.type, id: component.id, quantity: component.quantity, unit: component.unit, visible: component.visible }))
      });
      if (!result.ok) {
        setError(result.error || 'Não foi possível salvar.');
        return;
      }
      router.push(productId ? `/painel/produtos/${productId}` : '/painel/cofre');
      router.refresh();
    });
  }

  return <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
    <section className="space-y-5">
      <div className="rounded-3xl bg-wine p-6 text-cream">
        <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><LockKeyhole /></div><div><p className="m-0 text-xs font-bold uppercase tracking-[.18em] text-cream/50">Área confidencial</p><p className="m-0 mt-1 text-lg font-black">A fórmula é cadastrada diretamente no seu Cofre.</p></div></div>
        <p className="mb-0 mt-4 text-xs leading-5 text-cream/60">Para controlar estoque, precisamos dos ingredientes, quantidades e rendimento. O modo de preparo é opcional.</p>
      </div>

      <div className="panel p-5">
        <p className="eyebrow mb-1">Identificação</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <select value={productId} onChange={(event) => chooseProduct(event.target.value)} className="input sm:col-span-2"><option value="">Sub-receita sem produto</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
          {productId && availableVariants.length > 0 && <select value={variantId} onChange={(event) => setVariantId(event.target.value)} className="input sm:col-span-2"><option value="">Receita base do produto</option>{availableVariants.map((variant) => <option key={variant.id} value={variant.id}>Variante: {variant.name}</option>)}</select>}
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da fórmula" className="input sm:col-span-2" />
          <input type="number" min="0.0001" step="0.0001" value={yieldQty} onChange={(event) => setYieldQty(Number(event.target.value))} className="input" />
          <select value={yieldUnit} onChange={(event) => setYieldUnit(event.target.value)} className="input"><option value="un">unidades</option><option value="g">gramas</option><option value="kg">kg</option><option value="ml">ml</option><option value="L">litros</option></select>
          <select value={confidentiality} onChange={(event) => setConfidentiality(event.target.value as 'owner_only' | 'authorized_team' | 'protected_production')} className="input sm:col-span-2"><option value="owner_only">Somente proprietário</option><option value="authorized_team">Equipe autorizada</option><option value="protected_production">Produção protegida</option></select>
        </div>
      </div>

      <div className="panel p-5">
        <p className="eyebrow mb-1">Composição</p><h2 className="mt-0 text-lg font-black text-wine">Ingredientes e sub-receitas</h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><select id="ingredient-picker" className="input" defaultValue=""><option value="" disabled>Adicionar ingrediente do estoque</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.base_unit})</option>)}</select><button type="button" onClick={() => { const element = document.getElementById('ingredient-picker') as HTMLSelectElement | null; if (element?.value) addItem(element.value); }} className="h-11 rounded-2xl bg-wine px-4 text-xs font-bold text-cream">+ Ingrediente</button></div>
        {recipes.length > 0 && <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]"><select id="subrecipe-picker" className="input" defaultValue=""><option value="" disabled>Usar sub-receita</option>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</select><button type="button" onClick={() => { const element = document.getElementById('subrecipe-picker') as HTMLSelectElement | null; if (element?.value) addRecipe(element.value); }} className="h-11 rounded-2xl border border-wine/10 bg-white px-4 text-xs font-bold text-wine">+ Sub-receita</button></div>}
        <div className="mt-4 space-y-2">{components.map((component, index) => <div key={`${component.type}-${component.id}`} className="grid items-center gap-2 rounded-2xl bg-cream/60 p-3 sm:grid-cols-[1fr_110px_90px_auto]"><div><p className="m-0 text-xs font-bold text-graphite">{component.name}</p><p className="m-0 mt-1 text-[10px] uppercase tracking-wider text-graphite/35">{component.type === 'sub_recipe' ? 'sub-receita' : 'ingrediente'}</p></div><input type="number" min="0.0001" step="0.0001" value={component.quantity} onChange={(event) => setComponents((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, quantity: Number(event.target.value) } : candidate))} className="input !h-9"/><input value={component.unit} onChange={(event) => setComponents((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, unit: event.target.value } : candidate))} className="input !h-9"/><button type="button" onClick={() => setComponents((current) => current.filter((_, candidateIndex) => candidateIndex !== index))} className="mini-button text-danger"><Trash2 size={14}/></button></div>)}</div>
      </div>

      <div className="panel p-5"><p className="eyebrow mb-2">Opcional</p><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="input min-h-32 py-3" placeholder="Modo de preparo ou observações internas. Você pode deixar em branco." /></div>
    </section>

    <aside className="panel h-fit p-5 xl:sticky xl:top-8">
      <p className="eyebrow mb-1">Cofre</p><h2 className="mt-0 text-xl font-black text-wine">Revisar fórmula</h2>
      <div className="rounded-2xl bg-cream p-4 text-xs text-graphite/60"><p className="m-0"><strong>Rendimento:</strong> {yieldQty} {yieldUnit}</p><p className="mb-0 mt-2"><strong>Componentes:</strong> {components.length}</p>{variantId && <p className="mb-0 mt-2"><strong>Variante:</strong> {availableVariants.find((variant) => variant.id === variantId)?.name}</p>}<p className="mb-0 mt-2"><strong>Proteção:</strong> {confidentiality === 'owner_only' ? 'Somente proprietário' : confidentiality === 'authorized_team' ? 'Equipe autorizada' : 'Produção protegida'}</p></div>
      {error && <p className="rounded-2xl bg-danger/10 p-3 text-xs font-bold text-danger">{error}</p>}
      <button disabled={pending || !name || components.length === 0} onClick={save} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-wine text-sm font-bold text-cream disabled:opacity-40"><LockKeyhole size={16}/>{pending ? 'Protegendo...' : 'Salvar no Cofre'}</button>
    </aside>
  </div>;
}
