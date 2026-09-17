import { notFound } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { OrderActions } from '@/components/order-actions';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, numberPt, shortDateTime } from '@/lib/format';

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

export default async function PedidoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getBusinessContext();
  if (!context) return null;
  const supabase = await createClient();
  const [orderResult, itemsResult, reservationsResult] = await Promise.all([
    supabase.from('orders').select('id,order_number,status,scheduled_at,total,subtotal,delivery_fee,deposit_required,fulfillment_type,notes,customer:customers(name,whatsapp)').eq('business_id', context.business.id).eq('id', id).maybeSingle(),
    supabase.from('order_items').select('id,name_snapshot,quantity,unit_price,total_price,recipe_version_id,recipe_output_qty,recipe_output_unit,configuration,cost_snapshot').eq('business_id', context.business.id).eq('order_id', id),
    supabase.from('inventory_reservations').select('id,quantity,unit,status,item:inventory_items(name)').eq('business_id', context.business.id).eq('order_id', id).eq('status', 'active')
  ]);
  const order = orderResult.data;
  const items = itemsResult.data ?? [];
  const reservations = reservationsResult.data ?? [];
  if (!order) notFound();
  const customer: any = Array.isArray(order.customer) ? order.customer[0] : order.customer;
  const canSeeReservedIngredients = ['owner', 'manager', 'stock'].includes(context.role);
  const canSeeCosts = context.role === 'owner';
  const hasCostSnapshot = items.some((item) => item.cost_snapshot !== null);
  const materialCostSnapshot = items.reduce((sum, item) => sum + Number(item.cost_snapshot ?? 0), 0);
  const materialGrossProfit = Number(order.subtotal) - materialCostSnapshot;
  const materialMargin = Number(order.subtotal) > 0 ? (materialGrossProfit / Number(order.subtotal)) * 100 : 0;

  return <>
    <PageHeader eyebrow={`Pedido #${order.order_number}`} title={customer?.name || 'Encomenda'} description={`${shortDateTime(order.scheduled_at)} · ${order.fulfillment_type === 'delivery' ? 'Entrega' : 'Retirada'}`} />
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
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
      </div>

      <aside className="space-y-5">
        <section className="panel p-5"><p className="eyebrow mb-3">Resumo</p><div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-graphite/50">Produtos</span><strong>{money(order.subtotal)}</strong></div><div className="flex justify-between"><span className="text-graphite/50">Entrega</span><strong>{money(order.delivery_fee)}</strong></div><div className="flex justify-between"><span className="text-graphite/50">Sinal solicitado</span><strong>{money(order.deposit_required)}</strong></div></div><div className="mt-4 border-t border-wine/10 pt-4"><p className="m-0 text-xs text-graphite/40">Total</p><p className="m-0 mt-1 text-3xl font-black text-wine">{money(order.total)}</p></div></section>
        {canSeeCosts && <section className="panel p-5"><div className="flex items-center gap-2"><LockKeyhole size={13} className="text-wine"/><p className="eyebrow m-0">Custos do pedido</p></div>{hasCostSnapshot ? <><div className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><span className="text-graphite/50">Insumos congelados</span><strong>{money(materialCostSnapshot)}</strong></div><div className="flex justify-between"><span className="text-graphite/50">Lucro bruto de insumos</span><strong>{money(materialGrossProfit)}</strong></div><div className="flex justify-between"><span className="text-graphite/50">Margem de insumos</span><strong>{numberPt(materialMargin, 1)}%</strong></div></div><p className="mb-0 mt-3 text-[10px] leading-4 text-graphite/40">Snapshot salvo quando a encomenda foi confirmada. Mudanças futuras no custo dos ingredientes não alteram este histórico.</p></> : <p className="mb-0 mt-3 text-xs leading-5 text-graphite/50">O custo será congelado quando a encomenda for confirmada.</p>}</section>}
        <section className="panel p-5"><p className="eyebrow mb-3">Operação</p><OrderActions id={order.id} status={order.status} /></section>
        {order.notes && <section className="panel p-5"><p className="eyebrow mb-2">Observações</p><p className="m-0 whitespace-pre-wrap text-sm leading-6 text-graphite/60">{order.notes}</p></section>}
      </aside>
    </div>
  </>;
}
