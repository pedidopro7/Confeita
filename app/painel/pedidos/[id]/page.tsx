import { notFound } from 'next/navigation';
import { CheckCircle2, Clock3, CreditCard, LockKeyhole, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { OrderActions } from '@/components/order-actions';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, numberPt, shortDateTime } from '@/lib/format';
import { recordOrderPaymentAction, refundOrderPaymentAction } from './payment-actions';

type ConfigOption = {
  id?: string;
  groupName?: string;
  name?: string;
  recipeVersionId?: string | null;
};

function getOptions(configuration: unknown): ConfigOption[] {
  if (!configuration || typeof configuration !== 'object') return [];
  const options = (configuration as { options?: unknown }).options;
  if (!Array.isArray(options)) return [];
  return options.filter((option): option is ConfigOption => Boolean(option && typeof option === 'object'));
}

const paymentMethods: Record<string, string> = {
  pix: 'Pix', cash: 'Dinheiro', debit: 'Débito', credit: 'Crédito', payment_link: 'Link de pagamento', other: 'Outro'
};

const statusLabels: Record<string, string> = {
  draft: 'Pedido criado',
  awaiting_deposit: 'Aguardando sinal',
  confirmed: 'Pedido confirmado',
  production: 'Produção iniciada',
  ready: 'Pedido pronto',
  out_for_delivery: 'Saiu para entrega',
  completed: 'Pedido concluído',
  canceled: 'Pedido cancelado',
  refunded: 'Pedido reembolsado'
};

export default async function PedidoDetalhePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const context = await getBusinessContext();
  if (!context) return null;
  const supabase = await createClient();
  const [orderResult, itemsResult, reservationsResult, financeResult, paymentsResult, historyResult] = await Promise.all([
    supabase.from('orders').select('id,order_number,status,scheduled_at,total,subtotal,delivery_fee,deposit_required,fulfillment_type,notes,customer:customers(name,whatsapp)').eq('business_id', context.business.id).eq('id', id).maybeSingle(),
    supabase.from('order_items').select('id,name_snapshot,quantity,unit_price,total_price,recipe_version_id,recipe_output_qty,recipe_output_unit,configuration,cost_snapshot').eq('business_id', context.business.id).eq('order_id', id),
    supabase.from('inventory_reservations').select('id,quantity,unit,status,item:inventory_items(name)').eq('business_id', context.business.id).eq('order_id', id).eq('status', 'active'),
    supabase.from('order_financial_summary').select('total,deposit_required,paid,balance,payment_status,deposit_satisfied').eq('business_id', context.business.id).eq('order_id', id).maybeSingle(),
    supabase.from('order_payments').select('id,amount,method,status,paid_at,notes,created_at').eq('business_id', context.business.id).eq('order_id', id).order('created_at', { ascending: false }),
    supabase.from('order_status_history').select('id,from_status,to_status,note,created_at').eq('business_id', context.business.id).eq('order_id', id).order('created_at', { ascending: false })
  ]);
  const order = orderResult.data;
  const items = itemsResult.data ?? [];
  const reservations = reservationsResult.data ?? [];
  const payments = paymentsResult.data ?? [];
  const history = historyResult.data ?? [];
  if (!order) notFound();
  const customer: any = Array.isArray(order.customer) ? order.customer[0] : order.customer;
  const canSeeReservedIngredients = ['owner', 'manager', 'stock'].includes(context.role);
  const canSeeCosts = context.role === 'owner';
  const canRecordPayment = ['owner', 'manager', 'finance', 'service'].includes(context.role);
  const canRefund = ['owner', 'manager', 'finance'].includes(context.role);
  const hasCostSnapshot = items.some((item) => item.cost_snapshot !== null);
  const materialCostSnapshot = items.reduce((sum, item) => sum + Number(item.cost_snapshot ?? 0), 0);
  const materialGrossProfit = Number(order.subtotal) - materialCostSnapshot;
  const materialMargin = Number(order.subtotal) > 0 ? (materialGrossProfit / Number(order.subtotal)) * 100 : 0;
  const financial = financeResult.data ?? {
    paid: payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount), 0),
    balance: Number(order.total), payment_status: 'unpaid', deposit_satisfied: Number(order.deposit_required) <= 0
  };
  const paid = Number(financial.paid ?? 0);
  const balance = Number(financial.balance ?? Number(order.total));
  const depositMissing = Math.max(Number(order.deposit_required) - paid, 0);
  const ok = typeof query.ok === 'string' ? query.ok : null;
  const paymentError = typeof query.erro_pagamento === 'string' ? query.erro_pagamento : null;
  const paymentKey = globalThis.crypto.randomUUID();

  return <>
    <PageHeader eyebrow={`Pedido #${order.order_number}`} title={customer?.name || 'Encomenda'} description={`${shortDateTime(order.scheduled_at)} · ${order.fulfillment_type === 'delivery' ? 'Entrega' : 'Retirada'}`} />
    {ok && <div className="mb-5 flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-3 text-xs font-bold text-success"><CheckCircle2 size={15}/>{ok === 'estorno' ? 'Pagamento estornado e financeiro atualizado.' : 'Pagamento registrado e financeiro atualizado.'}</div>}
    {paymentError && <div className="mb-5 rounded-2xl bg-danger/10 px-4 py-3 text-xs font-bold text-danger">{paymentError}</div>}

    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-wine/10 px-5 py-4"><strong className="text-wine">Itens</strong><StatusBadge status={order.status} /></div>
          {items.map((item) => {
            const options = getOptions(item.configuration);
            const hasRecipe = Boolean(item.recipe_version_id || options.some((option) => option.recipeVersionId));
            return <div key={item.id} className="border-b border-wine/5 px-5 py-4 last:border-0">
              <div className="flex items-start justify-between gap-4"><div className="min-w-0 flex-1"><p className="m-0 text-sm font-bold text-graphite">{item.name_snapshot}</p><p className="m-0 mt-1 text-xs text-graphite/40">{numberPt(item.quantity)} × {money(item.unit_price)} {hasRecipe ? '· estoque conectado' : '· sem receita'}</p></div><strong className="text-wine">{money(item.total_price)}</strong></div>
              {options.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{options.map((option, index) => <span key={`${option.id ?? option.name}-${index}`} className="rounded-full bg-cream px-3 py-1.5 text-[10px] font-bold text-wine">{option.groupName ? `${option.groupName}: ` : ''}{option.name ?? 'Opção'}</span>)}</div>}
            </div>;
          })}
        </section>

        {reservations.length > 0 && (canSeeReservedIngredients ? <section className="panel p-5"><p className="eyebrow mb-1">Reservado para este pedido</p><h2 className="mt-0 text-lg font-black text-wine">Ingredientes comprometidos</h2><div className="mt-4 grid gap-2 sm:grid-cols-2">{reservations.map((reservation: any) => <div key={reservation.id} className="rounded-2xl bg-cream/65 p-3"><p className="m-0 text-xs font-bold text-graphite">{Array.isArray(reservation.item) ? reservation.item[0]?.name : reservation.item?.name}</p><p className="m-0 mt-1 text-xs text-terracotta">{numberPt(reservation.quantity)} {reservation.unit}</p></div>)}</div></section> : <section className="panel p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-wine text-cream"><LockKeyhole size={15}/></div><div><p className="m-0 text-sm font-black text-wine">Ingredientes reservados</p><p className="m-0 mt-1 text-xs text-graphite/45">O estoque já foi comprometido. A composição permanece protegida pelo Cofre.</p></div></div></section>)}

        <section className="panel overflow-hidden">
          <div className="flex items-center gap-3 border-b border-wine/10 px-5 py-4"><Clock3 size={15} className="text-wine"/><div><p className="m-0 text-sm font-black text-wine">Linha do tempo</p><p className="m-0 mt-1 text-[10px] text-graphite/40">Histórico operacional desta encomenda</p></div></div>
          {history.length === 0 ? <div className="p-5 text-xs text-graphite/40">O histórico começa quando o pedido avança de etapa.</div> : <div className="divide-y divide-wine/5">{history.map((entry) => <div key={entry.id} className="px-5 py-3"><div className="flex items-start justify-between gap-3"><div><p className="m-0 text-xs font-bold text-graphite">{statusLabels[entry.to_status] ?? entry.to_status}</p>{entry.note && <p className="m-0 mt-1 text-[10px] text-graphite/45">{entry.note}</p>}</div><span className="shrink-0 text-[9px] text-graphite/35">{shortDateTime(entry.created_at)}</span></div></div>)}</div>}
        </section>
      </div>

      <aside className="space-y-5">
        <section className="panel p-5"><p className="eyebrow mb-3">Resumo</p><div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-graphite/50">Produtos</span><strong>{money(order.subtotal)}</strong></div><div className="flex justify-between"><span className="text-graphite/50">Entrega</span><strong>{money(order.delivery_fee)}</strong></div><div className="flex justify-between"><span className="text-graphite/50">Sinal solicitado</span><strong>{money(order.deposit_required)}</strong></div></div><div className="mt-4 border-t border-wine/10 pt-4"><p className="m-0 text-xs text-graphite/40">Total</p><p className="m-0 mt-1 text-3xl font-black text-wine">{money(order.total)}</p></div></section>

        <section className="panel p-5">
          <div className="flex items-center gap-2"><CreditCard size={14} className="text-wine"/><p className="eyebrow m-0">Pagamentos</p></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><FinanceMetric label="Recebido" value={money(paid)} positive/><FinanceMetric label="Saldo" value={money(balance)}/></div>
          {Number(order.deposit_required) > 0 && <div className={`mt-3 rounded-2xl px-3 py-2.5 text-[10px] font-bold ${financial.deposit_satisfied ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{financial.deposit_satisfied ? '✓ Sinal atingido. Data reservada.' : `Faltam ${money(depositMissing)} para atingir o sinal.`}</div>}

          {canRecordPayment && balance > 0 && !['canceled','refunded'].includes(order.status) && <form action={recordOrderPaymentAction.bind(null, order.id)} className="mt-4 space-y-2 border-t border-wine/10 pt-4">
            <input type="hidden" name="idempotency_key" value={paymentKey}/>
            <div className="grid grid-cols-2 gap-2"><input required name="amount" type="number" min="0.01" max={balance} step="0.01" defaultValue={Number(Math.min(balance, depositMissing > 0 ? depositMissing : balance).toFixed(2))} className="input"/><select required name="method" className="input"><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="debit">Débito</option><option value="credit">Crédito</option><option value="payment_link">Link</option><option value="other">Outro</option></select></div>
            <input name="notes" placeholder="Observação opcional" className="input"/>
            <button className="h-11 w-full rounded-2xl bg-wine text-xs font-bold text-cream">Registrar recebimento</button>
          </form>}

          {payments.length > 0 && <div className="mt-4 space-y-2 border-t border-wine/10 pt-4">{payments.map((payment) => <div key={payment.id} className="rounded-2xl bg-cream/65 p-3"><div className="flex items-start justify-between gap-2"><div><p className={`m-0 text-xs font-black ${payment.status === 'refunded' ? 'text-graphite/35 line-through' : 'text-graphite'}`}>{money(payment.amount)} · {paymentMethods[payment.method] ?? payment.method}</p><p className="m-0 mt-1 text-[9px] text-graphite/35">{shortDateTime(payment.paid_at ?? payment.created_at)} · {payment.status === 'refunded' ? 'estornado' : 'recebido'}</p></div>{canRefund && payment.status === 'paid' && <form action={refundOrderPaymentAction.bind(null, order.id, payment.id)}><button className="mini-button text-danger" title="Estornar pagamento"><RotateCcw size={12}/></button></form>}</div>{payment.notes && <p className="mb-0 mt-2 text-[10px] text-graphite/45">{payment.notes}</p>}</div>)}</div>}
        </section>

        {canSeeCosts && <section className="panel p-5"><div className="flex items-center gap-2"><LockKeyhole size={13} className="text-wine"/><p className="eyebrow m-0">Custos do pedido</p></div>{hasCostSnapshot ? <><div className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><span className="text-graphite/50">Insumos congelados</span><strong>{money(materialCostSnapshot)}</strong></div><div className="flex justify-between"><span className="text-graphite/50">Lucro bruto de insumos</span><strong>{money(materialGrossProfit)}</strong></div><div className="flex justify-between"><span className="text-graphite/50">Margem de insumos</span><strong>{numberPt(materialMargin, 1)}%</strong></div></div><p className="mb-0 mt-3 text-[10px] leading-4 text-graphite/40">Snapshot salvo quando a encomenda foi confirmada. Mudanças futuras no custo dos ingredientes não alteram este histórico.</p></> : <p className="mb-0 mt-3 text-xs leading-5 text-graphite/50">O custo será congelado quando a encomenda for confirmada.</p>}</section>}
        <section className="panel p-5"><p className="eyebrow mb-3">Operação</p><OrderActions id={order.id} status={order.status} /></section>
        {order.notes && <section className="panel p-5"><p className="eyebrow mb-2">Observações</p><p className="m-0 whitespace-pre-wrap text-sm leading-6 text-graphite/60">{order.notes}</p></section>}
      </aside>
    </div>
  </>;
}

function FinanceMetric({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return <div className={`rounded-2xl p-3 ${positive ? 'bg-success/10' : 'bg-cream'}`}><p className="m-0 text-[9px] font-bold uppercase tracking-wider text-graphite/35">{label}</p><p className={`m-0 mt-1 text-sm font-black ${positive ? 'text-success' : 'text-wine'}`}>{value}</p></div>;
}
