'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelOrderAction, confirmOrderAction, finishProductionAction, startProductionAction } from '@/app/painel/actions';
import { completeOrderFulfillmentAction, markOutForDeliveryAction } from '@/app/painel/pedidos/fulfillment-actions';

type Props = {
  id: string;
  status: string;
  fulfillmentType?: string;
  canManageOrders?: boolean;
  canManageProduction?: boolean;
  canCancel?: boolean;
};

export function OrderActions({
  id,
  status,
  fulfillmentType = 'pickup',
  canManageOrders = false,
  canManageProduction = false,
  canCancel = false
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');

  function run(action: () => Promise<any>) {
    setMessage('');
    startTransition(async () => {
      const result = await action();
      if (result?.ok === false) {
        if (result.reason === 'insufficient_stock') setMessage('Estoque insuficiente para começar a produção. Confira a lista de compras.');
        else if (result.reason === 'checklist_incomplete') setMessage(result.error || 'Conclua o checklist da produção antes de marcar como pronto.');
        else setMessage(result.error || 'Não foi possível concluir a ação.');
        return;
      }
      router.refresh();
    });
  }

  return <div className="space-y-2">
    {message && <div className="rounded-2xl bg-danger/10 p-3 text-xs font-bold text-danger">{message}</div>}
    {status === 'awaiting_deposit' && canManageOrders && <div className="rounded-2xl bg-warning/10 px-3 py-2.5 text-[10px] font-bold text-warning">Aguardando o sinal. Registre o recebimento acima; ao atingir o valor mínimo, a Confeita confirma e reserva os ingredientes automaticamente.</div>}
    <div className="flex flex-wrap gap-2">
      {status === 'draft' && canManageOrders && <button disabled={pending} onClick={() => run(() => confirmOrderAction(id))} className="action-button bg-wine text-cream">Confirmar e reservar</button>}
      {status === 'confirmed' && canManageProduction && <button disabled={pending} onClick={() => run(() => startProductionAction(id))} className="action-button bg-terracotta text-white">Começar produção</button>}
      {status === 'production' && canManageProduction && <button disabled={pending} onClick={() => run(() => finishProductionAction(id))} className="action-button bg-success text-white">Marcar como pronto</button>}
      {status === 'ready' && fulfillmentType === 'delivery' && canManageOrders && <button disabled={pending} onClick={() => run(() => markOutForDeliveryAction(id))} className="action-button bg-terracotta text-white">Saiu para entrega</button>}
      {status === 'ready' && fulfillmentType !== 'delivery' && canManageOrders && <button disabled={pending} onClick={() => run(() => completeOrderFulfillmentAction(id))} className="action-button bg-wine text-cream">Cliente retirou</button>}
      {status === 'out_for_delivery' && canManageOrders && <button disabled={pending} onClick={() => run(() => completeOrderFulfillmentAction(id))} className="action-button bg-wine text-cream">Entrega concluída</button>}
      {['draft','awaiting_deposit','confirmed'].includes(status) && canCancel && <button disabled={pending} onClick={() => run(() => cancelOrderAction(id))} className="action-button border border-danger/20 bg-white text-danger">Cancelar</button>}
    </div>
  </div>;
}
