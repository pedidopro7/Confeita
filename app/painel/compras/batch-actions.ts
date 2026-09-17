'use server';

import { revalidatePath } from 'next/cache';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export type PurchaseBatchItemInput = {
  inventoryItemId: string;
  quantity: number;
  unit: string;
  totalCost: number;
  lotCode?: string;
  expiresAt?: string;
};

export type PurchaseBatchInput = {
  supplierId?: string | null;
  paymentMethod?: string;
  notes?: string;
  idempotencyKey: string;
  items: PurchaseBatchItemInput[];
};

function friendly(message: string) {
  if (message.includes('purchase_requires_items')) return 'Adicione pelo menos um item à compra.';
  if (message.includes('duplicate_inventory_item_in_purchase')) return 'O mesmo ingrediente aparece duas vezes. Some as quantidades ou remova a duplicata.';
  if (message.includes('invalid_purchase_item')) return 'Revise quantidade, unidade e valor dos itens.';
  if (message.includes('supplier_not_found_or_forbidden')) return 'Fornecedor inválido para esta confeitaria.';
  if (message.includes('inventory_item_not_found_or_forbidden')) return 'Um item da compra não está disponível no seu estoque.';
  return message;
}

export async function recordPurchaseBatchAction(input: PurchaseBatchInput) {
  const context = await getBusinessContext();
  if (!context) return { ok: false, error: 'Sessão expirada.' } as const;
  if (!['owner', 'manager', 'stock'].includes(context.role)) return { ok: false, error: 'Seu perfil não pode registrar compras.' } as const;
  if (!input.items?.length) return { ok: false, error: 'Adicione pelo menos um item.' } as const;
  if (input.items.some((item) => !item.inventoryItemId || item.quantity <= 0 || item.totalCost < 0 || !item.unit.trim())) {
    return { ok: false, error: 'Revise os itens da compra.' } as const;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('record_inventory_purchase_batch', {
    p_supplier_id: input.supplierId || null,
    p_items: input.items.map((item) => ({
      inventory_item_id: item.inventoryItemId,
      quantity: item.quantity,
      unit: item.unit,
      total_cost: item.totalCost,
      lot_code: item.lotCode?.trim() || null,
      expires_at: item.expiresAt || null
    })),
    p_payment_method: input.paymentMethod || null,
    p_notes: input.notes?.trim() || null,
    p_idempotency_key: input.idempotencyKey || null
  });

  if (error) return { ok: false, error: friendly(error.message) } as const;
  revalidatePath('/painel/compras');
  revalidatePath('/painel/compras/lista');
  revalidatePath('/painel/estoque');
  revalidatePath('/painel/financeiro');
  revalidatePath('/painel');
  return { ok: true, purchaseId: String(data) } as const;
}
