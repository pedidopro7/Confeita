'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, LockKeyhole, Plus, Trash2 } from 'lucide-react';
import { createRecipeVersionAction } from '@/app/painel/cofre/[id]/actions';

type InventoryItem = { id: string; name: string; baseUnit: string };
type SubRecipe = { id: string; name: string; yieldUnit: string };
type Component = {
  type: 'inventory_item' | 'sub_recipe';
  id: string;
  name: string;
  quantity: number;
  unit: string;
  visible: boolean;
};

type Props = {
  recipeId: string;
  currentVersionNo: number;
  yieldQty: number;
  yieldUnit: string;
  preparationNotes: string;
  initialComponents: Component[];
  inventoryItems: InventoryItem[];
  subRecipes: SubRecipe[];
};

export function RecipeVersionEditor({ recipeId, currentVersionNo, yieldQty: initialYield, yieldUnit: initialUnit, preparationNotes, initialComponents, inventoryItems, subRecipes }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [yieldQty, setYieldQty] = useState(initialYield);
  const [yieldUnit, setYieldUnit] = useState(initialUnit);
  const [notes, setNotes] = useState(preparationNotes);
  const [changeNote, setChangeNote] = useState('');
  const [components, setComponents] = useState<Component[]>(initialComponents);
  const [ingredientId, setIngredientId] = useState('');
  const [subRecipeId, setSubRecipeId] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const componentKeys = useMemo(() => new Set(components.map((component) => `${component.type}:${component.id}`)), [components]);

  function addIngredient() {
    const item = inventoryItems.find((candidate) => candidate.id === ingredientId);
    if (!item || componentKeys.has(`inventory_item:${item.id}`)) return;
    setComponents((current) => [...current, { type: 'inventory_item', id: item.id, name: item.name, quantity: 1, unit: item.baseUnit, visible: true }]);
    setIngredientId('');
  }

  function addSubRecipe() {
    const recipe = subRecipes.find((candidate) => candidate.id === subRecipeId);
    if (!recipe || componentKeys.has(`sub_recipe:${recipe.id}`)) return;
    setComponents((current) => [...current, { type: 'sub_recipe', id: recipe.id, name: recipe.name, quantity: 1, unit: recipe.yieldUnit || 'un', visible: true }]);
    setSubRecipeId('');
  }

  function updateComponent(index: number, patch: Partial<Component>) {
    setComponents((current) => current.map((component, candidateIndex) => candidateIndex === index ? { ...component, ...patch } : component));
  }

  function saveVersion() {
    setMessage(null);
    startTransition(async () => {
      const result = await createRecipeVersionAction({
        recipeId,
        yieldQty,
        yieldUnit,
        preparationNotes: notes,
        changeNote,
        components: components.map((component) => ({
          type: component.type,
          id: component.id,
          quantity: component.quantity,
          unit: component.unit,
          visible: component.visible
        }))
      });
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.error });
        return;
      }
      setChangeNote('');
      setMessage({ kind: 'ok', text: `Versão v${currentVersionNo + 1} publicada e definida como atual.` });
      router.refresh();
    });
  }

  return <section className="panel p-5 md:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="eyebrow mb-1">Nova versão</p><h2 className="m-0 text-xl font-black text-wine">Editar sem apagar o histórico</h2><p className="mb-0 mt-2 max-w-2xl text-xs leading-5 text-graphite/45">A versão atual permanece salva. Ao publicar, a Confeita cria a v{currentVersionNo + 1} e passa a usá-la em novos pedidos.</p></div>
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-wine text-cream"><LockKeyhole size={18}/></div>
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-[160px_150px_1fr]">
      <label><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-graphite/40">Rendimento</span><input type="number" min="0.0001" step="0.0001" value={yieldQty} onChange={(event) => setYieldQty(Number(event.target.value))} className="input"/></label>
      <label><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-graphite/40">Unidade</span><input value={yieldUnit} onChange={(event) => setYieldUnit(event.target.value)} className="input" placeholder="un, g, kg..."/></label>
      <label><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-graphite/40">Motivo da alteração</span><input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} className="input" placeholder="Ex.: aumentei o chocolate para melhorar textura"/></label>
    </div>

    <div className="mt-6 rounded-3xl bg-cream/55 p-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <select value={ingredientId} onChange={(event) => setIngredientId(event.target.value)} className="input"><option value="">Adicionar ingrediente</option>{inventoryItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.baseUnit}</option>)}</select>
        <button type="button" disabled={!ingredientId} onClick={addIngredient} className="h-11 rounded-2xl bg-wine px-4 text-xs font-bold text-cream disabled:opacity-40"><Plus size={13} className="mr-1 inline"/>Ingrediente</button>
      </div>
      {subRecipes.length > 0 && <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]"><select value={subRecipeId} onChange={(event) => setSubRecipeId(event.target.value)} className="input"><option value="">Adicionar sub-receita</option>{subRecipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</select><button type="button" disabled={!subRecipeId} onClick={addSubRecipe} className="h-11 rounded-2xl border border-wine/10 bg-white px-4 text-xs font-bold text-wine disabled:opacity-40"><Plus size={13} className="mr-1 inline"/>Sub-receita</button></div>}
    </div>

    <div className="mt-4 space-y-2">
      {components.length === 0 ? <div className="rounded-2xl border border-dashed border-wine/15 p-8 text-center text-xs text-graphite/40">Adicione os componentes usados nesta fórmula.</div> : components.map((component, index) => <div key={`${component.type}-${component.id}`} className="grid gap-2 rounded-2xl border border-wine/5 bg-white p-3 sm:grid-cols-[1fr_110px_90px_120px_auto] sm:items-center">
        <div><p className="m-0 text-xs font-black text-graphite">{component.name}</p><p className="m-0 mt-1 text-[9px] font-bold uppercase tracking-wider text-graphite/30">{component.type === 'sub_recipe' ? 'Sub-receita protegida' : 'Ingrediente'}</p></div>
        <input type="number" min="0.0001" step="0.0001" value={component.quantity} onChange={(event) => updateComponent(index, { quantity: Number(event.target.value) })} className="input !h-9"/>
        <input value={component.unit} onChange={(event) => updateComponent(index, { unit: event.target.value })} className="input !h-9"/>
        <label className="flex items-center gap-2 text-[10px] font-bold text-graphite/50"><input type="checkbox" checked={component.visible} onChange={(event) => updateComponent(index, { visible: event.target.checked })}/> Mostrar na produção</label>
        <button type="button" onClick={() => setComponents((current) => current.filter((_, candidateIndex) => candidateIndex !== index))} className="mini-button text-danger" aria-label="Remover"><Trash2 size={14}/></button>
      </div>)}
    </div>

    <label className="mt-5 block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-graphite/40">Modo de preparo / notas privadas (opcional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="input min-h-28 py-3" placeholder="Você pode manter esta parte em branco."/></label>

    {message && <div className={`mt-4 flex items-start gap-2 rounded-2xl p-3 text-xs font-bold ${message.kind === 'ok' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>{message.kind === 'ok' && <CheckCircle2 size={15}/>}<span>{message.text}</span></div>}
    <button type="button" disabled={pending || components.length === 0 || yieldQty <= 0 || !yieldUnit.trim()} onClick={saveVersion} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-wine text-sm font-bold text-cream disabled:opacity-40"><LockKeyhole size={15}/>{pending ? 'Publicando versão...' : `Publicar v${currentVersionNo + 1}`}</button>
  </section>;
}
