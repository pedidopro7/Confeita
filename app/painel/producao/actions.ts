'use server';

import { revalidatePath } from 'next/cache';
import { getBusinessContext, hasPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function toggleProductionStepAction(stepId: string, completed: boolean) {
  const context = await getBusinessContext();
  if (!context) return { ok: false, error: 'Sessão expirada.' } as const;
  if (!hasPermission(context, 'manage_production')) return { ok: false, error: 'Seu perfil não pode alterar a produção.' } as const;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('toggle_production_step', { p_step_id: stepId, p_completed: completed });
  if (error) return { ok: false, error: error.message } as const;
  revalidatePath('/painel/producao');
  return { ok: true, result: data } as const;
}

export async function setProductionActualQtyAction(productionOrderId: string, actualQty: number) {
  const context = await getBusinessContext();
  if (!context) return { ok: false, error: 'Sessão expirada.' } as const;
  if (!hasPermission(context, 'manage_production')) return { ok: false, error: 'Seu perfil não pode alterar a produção.' } as const;
  if (!Number.isFinite(actualQty) || actualQty < 0) return { ok: false, error: 'Informe um rendimento real válido.' } as const;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_production_actual_qty', { p_production_order_id: productionOrderId, p_actual_qty: actualQty });
  if (error) return { ok: false, error: error.message } as const;
  revalidatePath('/painel/producao');
  revalidatePath('/painel/relatorios');
  return { ok: true, result: data } as const;
}
