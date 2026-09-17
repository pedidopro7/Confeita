import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { OrderActions } from '@/components/order-actions';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, numberPt, shortDateTime } from '@/lib/format';

export default async function PedidoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getBusinessContext(); if (!context) return null;
  const supabase = await createClient();
  const [orderResult, itemsResult, reservationsResult] = await Promise.all([
    supabase.from('orders').select('id,order_number,status,scheduled_at,total,subtotal,delivery_fee,deposit_required,fulfillment_type,notes,customer:customers(name,whatsapp)').eq('business_id', context.business.id).eq('id', id).maybeSingle(),
    supabase.from('order_items').select('id,name_snapshot,quantity,unit_price,total_price,recipe_version_id').eq('business_id', context.business.id).eq('order_id', id),
    supabase.from('inventory_reservations').select('id,quantity,unit,status,item:inventory_items(name)').eq('business_id', context.business.id).eq('order_id', id).eq('status', 'active')
  ]);
  const order = orderResult.data;
  const items = itemsResult.data ?? [];
  const reservations = reservationsResult.data ?? [];
  if (!order) notFound();
  const customer: any = Array.isArray(order.customer) ? order.customer[0] : order.customer;

  return <><PageHeader eyebrow={`Pedido #${order.order_number}`} title={customer?.name || 'Encomenda'} description={`${shortDateTime(order.scheduled_at)} · ${order.fulfillment_type === 'delivery' ? 'Entrega' : 'Retirada'}`} />
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><div className="space-y-5"><section className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-wine/10 px-5 py-4"><strong className="text-wine">Itens</strong><StatusBadge status={order.status} /></div>{items.map(i => <div key={i.id} className="flex items-center justify-between border-b border-wine/5 px-5 py-4 last:border-0"><div><p className="m-0 text-sm font-bold text-graphite">{i.name_snapshot}</p><p className="m-0 mt-1 text-xs text-graphite/40">{numberPt(i.quantity)} × {money(i.unit_price)} {i.recipe_version_id ? '· receita conectada' : '· sem receita'}</p></div><strong className="text-wine">{money(i.total_price)}</strong></div>)}</section>
    {reservations.length > 0 && <section className="panel p-5"><p className="eyebrow mb-1">Reservado para este pedido</p><h2 className="mt-0 text-lg font-black text-wine">Ingredientes comprometidos</h2><div className="mt-4 grid gap-2 sm:grid-cols-2">{reservations.map((r: any) => <div key={r.id} className="rounded-2xl bg-cream/65 p-3"><p className="m-0 text-xs font-bold text-graphite">{Array.isArray(r.item) ? r.item[0]?.name : r.item?.name}</p><p className="m-0 mt-1 text-xs text-terracotta">{numberPt(r.quantity)} {r.unit}</p></div>)}</div></section>}</div>
    <aside className="space-y-5"><section className="panel p-5"><p className="eyebrow mb-3">Resumo</p><div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-graphite/50">Produtos</span><strong>{money(order.subtotal)}</strong></div><div className="flex justify-between"><span className="text-graphite/50">Entrega</span><strong>{money(order.delivery_fee)}</strong></div><div className="flex justify-between"><span className="text-graphite/50">Sinal solicitado</span><strong>{money(order.deposit_required)}</strong></div></div><div className="mt-4 border-t border-wine/10 pt-4"><p className="m-0 text-xs text-graphite/40">Total</p><p className="m-0 mt-1 text-3xl font-black text-wine">{money(order.total)}</p></div></section><section className="panel p-5"><p className="eyebrow mb-3">Operação</p><OrderActions id={order.id} status={order.status} /></section>{order.notes && <section className="panel p-5"><p className="eyebrow mb-2">Observações</p><p className="m-0 whitespace-pre-wrap text-sm leading-6 text-graphite/60">{order.notes}</p></section>}</aside></div>
  </>;
}
