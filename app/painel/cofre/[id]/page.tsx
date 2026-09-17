import Link from 'next/link';
import { notFound } from 'next/navigation';
import { History, LockKeyhole, RotateCcw, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { RecipeVersionEditor } from '@/components/recipe-version-editor';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { numberPt, shortDateTime } from '@/lib/format';
import { restoreRecipeVersionAction, updateRecipePrivacyAction } from './actions';

type ComponentRow = {
  component_type: 'inventory_item' | 'sub_recipe';
  inventory_item_id: string | null;
  sub_recipe_id: string | null;
  quantity: number | string;
  unit: string;
  is_visible_in_production: boolean;
  sort_order: number;
  inventory_item: { name: string; base_unit: string } | { name: string; base_unit: string }[] | null;
  sub_recipe: { name: string; active_version_id: string | null } | { name: string; active_version_id: string | null }[] | null;
};

function single<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

const privacyLabels: Record<string, string> = {
  owner_only: 'Somente proprietário',
  authorized_team: 'Equipe autorizada',
  protected_production: 'Produção protegida'
};

export default async function CofreRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await requireOwner();
  const supabase = await createClient();

  const [recipeResult, versionsResult, itemsResult, subRecipesResult, logsResult] = await Promise.all([
    supabase.from('recipes')
      .select('id,name,confidentiality,is_complete,active_version_id,created_at,updated_at,product:products(name),variant:product_variants(name)')
      .eq('business_id', context.business.id)
      .eq('id', id)
      .maybeSingle(),
    supabase.from('recipe_versions')
      .select('id,version_no,yield_qty,yield_unit,preparation_notes,change_note,created_at,created_by')
      .eq('business_id', context.business.id)
      .eq('recipe_id', id)
      .order('version_no', { ascending: false }),
    supabase.from('inventory_items')
      .select('id,name,base_unit')
      .eq('business_id', context.business.id)
      .eq('active', true)
      .order('name'),
    supabase.from('recipes')
      .select('id,name,active_version_id,active:recipe_versions!recipes_active_version_fk(yield_unit)')
      .eq('business_id', context.business.id)
      .eq('is_complete', true)
      .neq('id', id)
      .order('name'),
    supabase.from('recipe_access_logs')
      .select('id,action,created_at,metadata,user_id')
      .eq('business_id', context.business.id)
      .eq('recipe_id', id)
      .order('created_at', { ascending: false })
      .limit(30)
  ]);

  const recipe = recipeResult.data;
  if (!recipe) notFound();
  const versions = versionsResult.data ?? [];
  const activeVersion = versions.find((version) => version.id === recipe.active_version_id) ?? versions[0];
  if (!activeVersion) notFound();

  const { data: componentRows } = await supabase.from('recipe_components')
    .select('component_type,inventory_item_id,sub_recipe_id,quantity,unit,is_visible_in_production,sort_order,inventory_item:inventory_items(name,base_unit),sub_recipe:recipes!recipe_components_sub_recipe_id_fkey(name,active_version_id)')
    .eq('business_id', context.business.id)
    .eq('recipe_version_id', activeVersion.id)
    .order('sort_order');

  // A view event is intentionally small: no recipe content is copied into the audit metadata.
  await supabase.from('recipe_access_logs').insert({
    business_id: context.business.id,
    recipe_id: recipe.id,
    user_id: context.user.id,
    action: 'viewed',
    metadata: { version_no: activeVersion.version_no }
  });

  const initialComponents = ((componentRows ?? []) as unknown as ComponentRow[]).map((component) => {
    const ingredient = single(component.inventory_item);
    const subRecipe = single(component.sub_recipe);
    return {
      type: component.component_type,
      id: component.component_type === 'inventory_item' ? component.inventory_item_id! : component.sub_recipe_id!,
      name: component.component_type === 'inventory_item' ? ingredient?.name ?? 'Ingrediente' : subRecipe?.name ?? 'Sub-receita',
      quantity: Number(component.quantity),
      unit: component.unit,
      visible: component.is_visible_in_production
    };
  });

  const subRecipes = (subRecipesResult.data ?? []).map((row: any) => {
    const active = single(row.active as { yield_unit: string } | { yield_unit: string }[] | null);
    return { id: row.id, name: row.name, yieldUnit: active?.yield_unit ?? 'un' };
  });
  const product = single(recipe.product as { name: string } | { name: string }[] | null);
  const variant = single(recipe.variant as { name: string } | { name: string }[] | null);
  const logs = logsResult.data ?? [];

  return <>
    <PageHeader
      eyebrow="Cofre de Receitas"
      title={recipe.name}
      description={`${product?.name ?? 'Sub-receita interna'}${variant?.name ? ` · ${variant.name}` : ''} · v${activeVersion.version_no} atual`}
    />

    <div className="mb-5 grid gap-4 md:grid-cols-3">
      <div className="rounded-3xl bg-wine p-5 text-cream"><ShieldCheck size={21}/><p className="mb-0 mt-5 text-[10px] font-bold uppercase tracking-[.17em] text-cream/45">Proteção</p><p className="mb-0 mt-1 text-lg font-black">{privacyLabels[recipe.confidentiality] ?? recipe.confidentiality}</p></div>
      <div className="panel p-5"><p className="eyebrow mb-2">Rendimento atual</p><p className="m-0 text-2xl font-black text-wine">{numberPt(activeVersion.yield_qty)} {activeVersion.yield_unit}</p><p className="mb-0 mt-2 text-xs text-graphite/40">Versão v{activeVersion.version_no}</p></div>
      <div className="panel p-5"><p className="eyebrow mb-2">Histórico</p><p className="m-0 text-2xl font-black text-wine">{versions.length} {versions.length === 1 ? 'versão' : 'versões'}</p><p className="mb-0 mt-2 text-xs text-graphite/40">Nenhuma versão anterior é sobrescrita.</p></div>
    </div>

    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <RecipeVersionEditor
          recipeId={recipe.id}
          currentVersionNo={Number(activeVersion.version_no)}
          yieldQty={Number(activeVersion.yield_qty)}
          yieldUnit={activeVersion.yield_unit}
          preparationNotes={activeVersion.preparation_notes ?? ''}
          initialComponents={initialComponents}
          inventoryItems={(itemsResult.data ?? []).map((item) => ({ id: item.id, name: item.name, baseUnit: item.base_unit }))}
          subRecipes={subRecipes}
        />

        <section className="panel overflow-hidden">
          <div className="flex items-center gap-3 border-b border-wine/10 px-5 py-4"><History size={16} className="text-wine"/><div><p className="m-0 text-sm font-black text-wine">Histórico de versões</p><p className="m-0 mt-1 text-[10px] text-graphite/40">Versões antigas são somente leitura. Restaurar sempre cria uma nova versão.</p></div></div>
          <div className="divide-y divide-wine/5">{versions.map((version) => {
            const isActive = version.id === recipe.active_version_id;
            return <div key={version.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xs font-black ${isActive ? 'bg-wine text-cream' : 'bg-cream text-wine'}`}>v{version.version_no}</div>
              <div className="min-w-0 flex-1"><p className="m-0 text-xs font-bold text-graphite">{numberPt(version.yield_qty)} {version.yield_unit}{isActive ? ' · versão atual' : ''}</p><p className="m-0 mt-1 text-[10px] text-graphite/40">{version.change_note || 'Sem nota de alteração'} · {shortDateTime(version.created_at)}</p></div>
              {!isActive && <form action={restoreRecipeVersionAction.bind(null, recipe.id, version.id)}><button className="inline-flex h-9 items-center gap-2 rounded-2xl border border-wine/10 bg-white px-3 text-[10px] font-bold text-wine"><RotateCcw size={12}/> Restaurar como nova</button></form>}
            </div>;
          })}</div>
        </section>
      </div>

      <aside className="space-y-5">
        <form action={updateRecipePrivacyAction} className="panel p-5">
          <input type="hidden" name="recipe_id" value={recipe.id}/>
          <div className="flex items-center gap-2"><LockKeyhole size={14} className="text-wine"/><p className="eyebrow m-0">Privacidade</p></div>
          <h2 className="mt-2 text-lg font-black text-wine">Quem pode conhecer esta fórmula?</h2>
          <select name="confidentiality" defaultValue={recipe.confidentiality} className="input mt-3"><option value="owner_only">Somente proprietário</option><option value="authorized_team">Equipe autorizada</option><option value="protected_production">Produção protegida</option></select>
          <p className="mb-0 mt-3 text-[10px] leading-4 text-graphite/40">O modo protegido permite usar a receita na produção sem transformar o Cofre em uma tela comum para funcionários.</p>
          <button className="mt-4 h-10 w-full rounded-2xl bg-wine text-xs font-bold text-cream">Salvar privacidade</button>
        </form>

        <section className="panel overflow-hidden">
          <div className="border-b border-wine/10 px-5 py-4"><p className="eyebrow mb-1">Auditoria</p><h2 className="m-0 text-lg font-black text-wine">Acessos recentes</h2></div>
          {logs.length === 0 ? <div className="p-5 text-xs text-graphite/40">Nenhum evento registrado.</div> : <div className="divide-y divide-wine/5">{logs.slice(0, 12).map((log) => <div key={log.id} className="px-5 py-3"><p className="m-0 text-xs font-bold text-graphite">{labelAction(log.action)}</p><p className="m-0 mt-1 text-[10px] text-graphite/35">{shortDateTime(log.created_at)}</p></div>)}</div>}
        </section>

        <Link href="/painel/cofre" className="flex h-11 items-center justify-center rounded-2xl border border-wine/10 bg-white text-xs font-bold text-wine">Voltar ao Cofre</Link>
      </aside>
    </div>
  </>;
}

function labelAction(action: string) {
  const labels: Record<string, string> = {
    created: 'Fórmula criada',
    viewed: 'Fórmula visualizada',
    version_created: 'Nova versão publicada',
    privacy_changed: 'Privacidade alterada'
  };
  return labels[action] ?? action.replaceAll('_', ' ');
}
