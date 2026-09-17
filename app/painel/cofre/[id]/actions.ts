'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export type RecipeVersionComponentInput = {
  type: 'inventory_item' | 'sub_recipe';
  id: string;
  quantity: number;
  unit: string;
  visible?: boolean;
};

export type RecipeVersionInput = {
  recipeId: string;
  yieldQty: number;
  yieldUnit: string;
  preparationNotes?: string;
  changeNote?: string;
  components: RecipeVersionComponentInput[];
};

function friendlyError(message: string) {
  if (message.includes('recipe_cycle_not_allowed')) return 'Essa alteração criaria um ciclo entre receitas. Remova a sub-receita que volta para esta fórmula.';
  if (message.includes('recipe_requires_components')) return 'Adicione pelo menos um ingrediente ou sub-receita.';
  if (message.includes('invalid_recipe_component')) return 'Revise as quantidades e unidades dos componentes.';
  if (message.includes('inventory_component_not_found_or_forbidden')) return 'Um ingrediente selecionado não está mais disponível.';
  if (message.includes('sub_recipe_not_found_or_invalid')) return 'Uma sub-receita selecionada não está disponível ou está incompleta.';
  if (message.includes('invalid_recipe_yield')) return 'Informe um rendimento válido.';
  return message;
}

export async function createRecipeVersionAction(input: RecipeVersionInput) {
  const context = await requireOwner();
  if (!input.recipeId || !Number.isFinite(input.yieldQty) || input.yieldQty <= 0 || !input.yieldUnit.trim()) {
    return { ok: false, error: 'Informe um rendimento válido.' } as const;
  }
  if (!input.components.length || input.components.some((component) => !component.id || !component.unit.trim() || !Number.isFinite(component.quantity) || component.quantity <= 0)) {
    return { ok: false, error: 'Revise os ingredientes e quantidades.' } as const;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_recipe_version', {
    p_recipe_id: input.recipeId,
    p_yield_qty: input.yieldQty,
    p_yield_unit: input.yieldUnit,
    p_preparation_notes: input.preparationNotes?.trim() || null,
    p_change_note: input.changeNote?.trim() || null,
    p_components: input.components.map((component) => ({
      type: component.type,
      id: component.id,
      quantity: component.quantity,
      unit: component.unit,
      visible: component.visible !== false
    }))
  });

  if (error) return { ok: false, error: friendlyError(error.message) } as const;
  revalidatePath(`/painel/cofre/${input.recipeId}`);
  revalidatePath('/painel/cofre');
  revalidatePath('/painel/precificacao');
  revalidatePath('/painel/produtos');
  return { ok: true, versionId: String(data), businessId: context.business.id } as const;
}

export async function restoreRecipeVersionAction(recipeId: string, versionId: string, _formData: FormData): Promise<void> {
  await requireOwner();
  const supabase = await createClient();

  const [{ data: version, error: versionError }, { data: components, error: componentsError }] = await Promise.all([
    supabase.from('recipe_versions').select('id,recipe_id,version_no,yield_qty,yield_unit,preparation_notes').eq('recipe_id', recipeId).eq('id', versionId).maybeSingle(),
    supabase.from('recipe_components').select('component_type,inventory_item_id,sub_recipe_id,quantity,unit,is_visible_in_production,sort_order').eq('recipe_version_id', versionId).order('sort_order')
  ]);

  if (versionError || componentsError || !version) redirect(`/painel/cofre/${recipeId}?erro=${encodeURIComponent('Versão histórica não encontrada.')}`);

  const { error } = await supabase.rpc('create_recipe_version', {
    p_recipe_id: recipeId,
    p_yield_qty: Number(version.yield_qty),
    p_yield_unit: version.yield_unit,
    p_preparation_notes: version.preparation_notes,
    p_change_note: `Restaurada a partir da v${version.version_no}`,
    p_components: (components ?? []).map((component) => ({
      type: component.component_type,
      id: component.component_type === 'inventory_item' ? component.inventory_item_id : component.sub_recipe_id,
      quantity: Number(component.quantity),
      unit: component.unit,
      visible: component.is_visible_in_production
    }))
  });

  if (error) redirect(`/painel/cofre/${recipeId}?erro=${encodeURIComponent(friendlyError(error.message))}`);
  revalidatePath(`/painel/cofre/${recipeId}`);
  revalidatePath('/painel/cofre');
  revalidatePath('/painel/precificacao');
  redirect(`/painel/cofre/${recipeId}?ok=restaurada`);
}

export async function updateRecipePrivacyAction(formData: FormData) {
  const context = await requireOwner();
  const recipeId = String(formData.get('recipe_id') ?? '').trim();
  const confidentiality = String(formData.get('confidentiality') ?? '').trim();
  const allowed = ['owner_only', 'authorized_team', 'protected_production'];
  if (!recipeId || !allowed.includes(confidentiality)) return;

  const supabase = await createClient();
  const { error } = await supabase.from('recipes').update({ confidentiality }).eq('business_id', context.business.id).eq('id', recipeId);
  if (!error) {
    await supabase.from('recipe_access_logs').insert({
      business_id: context.business.id,
      recipe_id: recipeId,
      user_id: context.user.id,
      action: 'privacy_changed',
      metadata: { confidentiality }
    });
  }
  revalidatePath(`/painel/cofre/${recipeId}`);
  revalidatePath('/painel/cofre');
}
