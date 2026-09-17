import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChefHat, PackageCheck, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { OrderActions } from '@/components/order-actions';
import { ProductionOrderCard } from '@/components/production-order-card';
import { getBusinessContext, hasPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { numberPt, shortDateTime } from '@/lib/format';

export default async function ProducaoPage() {
  const context = await getBusinessContext(); if (!context) return null; if (!hasPermission(context, 'manage_production')) redirect('/painel?erro=' + encodeURIComponent('Seu perfil não pode acessar produção.')); if (!context) return null;
  const canManageOrders = hasPermission(context, 'manage_orders');
  const canManageProduction = hasPermission(context, 'manage_production');
  const canCancel = hasPermission(context, 'cancel_orders');
  const supabase = await createClient();
  const [ordersResult, productionResult] = await Promise.all([
    supabase.from('orders').select('id,order_number,status,scheduled_at,fulfillment_type,customer:customers(name),items:order_items(name_snapshot,quantity)').eq('business_id', context.business.id).in('status', ['confirmed', 'production', 'ready']).order('scheduled_at'),
    supabase.from('production_orders').select('id,order_id,status,planned_qty,actual_qty,unit,recipe:recipes(name),order:orders(order_number,customer:customers(name)),steps:production_steps(id,title,completed,sort_order)').eq('business_id', context.business.id).in('status', ['todo','in_progress']).order('scheduled_at')
  ]);
  const orders = ordersResult.data ?? [];
  const productionOrders = productionResult.data ?? [];

  const batchMap = new Map<string, { name: string; quantity: number; unit: string; orders: Set<string> }>();
  for (const work of productionOrders as any[]) {
    const recipe = Array.isArray(work.recipe) ? work.recipe[0] : work.recipe;
    const order = Array.isArray(work.order) ? work.order[0] : work.order;
    const key = `${recipe?.name ?? 'Produção'}:${work.unit ?? ''}`;
    const current = batchMap.get(key) ?? { name: recipe?.name ?? 'Produção', quantity: 0, unit: work.unit ?? '', orders: new Set<string>() };
    current.quantity += Number(work.planned_qty ?? 0);
    if (order?.order_number) current.orders.add(String(order.order_number));
    batchMap.set(key, current);
  }
  const batches = [...batchMap.values()].sort((a, b) => b.quantity - a.quantity);
  const confirmedOrders = orders.filter((order: any) => order.status === 'confirmed');
  const readyOrders = orders.filter((order: any) => order.status === 'ready');

  return <>
    <PageHeader eyebrow="Cozinha" title="Produção" description="Pedidos viram uma rotina de cozinha: o que preparar, o que já está na bancada e o que está pronto." />

    <section className="mb-5 rounded-3xl bg-wine p-5 text-cream md:p-6">
      <div className="flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10"><ChefHat size={20}/></div><div><p className="m-0 text-lg font-black">Necessidade consolidada</p><p className="mb-0 mt-1 text-xs leading-5 text-cream/55">Quando vários pedidos usam a mesma fórmula, você enxerga o total necessário na bancada em vez de pensar pedido por pedido.</p></div></div>
      {batches.length === 0 ? <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.05] p-5 text-center text-xs text-cream/45">Inicie a produção de um pedido confirmado para gerar as ordens de cozinha.</div> : <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{batches.slice(0, 8).map((batch) => <div key={`${batch.name}-${batch.unit}`} className="rounded-2xl bg-white/[.07] p-4"><p className="m-0 truncate text-xs font-bold text-cream/65">{batch.name}</p><p className="m-0 mt-2 text-xl font-black">{numberPt(batch.quantity)} {batch.unit}</p><p className="m-0 mt-1 text-[9px] text-cream/35">{batch.orders.size} {batch.orders.size === 1 ? 'pedido relacionado' : 'pedidos relacionados'}</p></div>)}</div>}
    </section>

    <div className="grid gap-5 xl:grid-cols-[1fr_330px]">
      <section>
        <div className="mb-3 flex items-end justify-between"><div><p className="eyebrow mb-1">Bancada</p><h2 className="m-0 text-xl font-black text-wine">Em produção</h2></div><span className="rounded-full bg-cream px-3 py-1.5 text-[10px] font-bold text-wine">{productionOrders.length} ordens</span></div>
        {productionOrders.length === 0 ? <div className="panel p-10 text-center"><Sparkles className="mx-auto mb-3 text-wine/20"/><p className="m-0 text-sm font-bold text-wine">Nada na bancada agora.</p><p className="mb-0 mt-1 text-xs text-graphite/40">Confirme um pedido e toque em “Começar produção”.</p></div> : <div className="grid gap-4 lg:grid-cols-2">{(productionOrders as any[]).map((work) => {
          const recipe = Array.isArray(work.recipe) ? work.recipe[0] : work.recipe;
          const order = Array.isArray(work.order) ? work.order[0] : work.order;
          const customer = Array.isArray(order?.customer) ? order.customer[0] : order?.customer;
          const steps = [...(work.steps ?? [])].sort((a: any, b: any) => Number(a.sort_order) - Number(b.sort_order));
          return <ProductionOrderCard key={work.id} id={work.id} recipeName={recipe?.name ?? 'Produção'} orderLabel={`Pedido #${order?.order_number ?? '—'}${customer?.name ? ` · ${customer.name}` : ''}`} plannedQty={Number(work.planned_qty)} actualQty={work.actual_qty === null ? null : Number(work.actual_qty)} unit={work.unit ?? ''} steps={steps.map((step: any) => ({ id: step.id, title: step.title, completed: step.completed }))}/>;
        })}</div>}
      </section>

      <aside className="space-y-5">
        <OrderLane title="A fazer" description="Pedidos confirmados e com ingredientes reservados" orders={confirmedOrders} canManageOrders={canManageOrders} canManageProduction={canManageProduction} canCancel={canCancel} />
        <OrderLane title="Prontos" description="Conferidos e aguardando retirada/entrega" orders={readyOrders} ready canManageOrders={canManageOrders} canManageProduction={canManageProduction} canCancel={canCancel} />
      </aside>
    </div>
  </>;
}

function OrderLane({ title, description, orders, ready = false, canManageOrders, canManageProduction, canCancel }: { title: string; description: string; orders: any[]; ready?: boolean; canManageOrders: boolean; canManageProduction: boolean; canCancel: boolean }) {
  return <section className="rounded-3xl bg-wine/[.035] p-3"><div className="mb-3 flex items-start justify-between gap-3 px-2"><div><h2 className="m-0 text-sm font-black text-wine">{title}</h2><p className="mb-0 mt-1 text-[9px] leading-4 text-graphite/35">{description}</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-wine">{orders.length}</span></div><div className="space-y-3">{orders.length === 0 ? <div className="rounded-2xl border border-dashed border-wine/10 p-7 text-center text-xs text-graphite/35">Nada aqui.</div> : orders.map((order: any) => {
    const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer;
    return <article key={order.id} className="panel p-4"><Link href={`/painel/pedidos/${order.id}`}><div className="flex items-start gap-2">{ready && <PackageCheck size={15} className="mt-0.5 text-success"/>}<div><p className="m-0 text-xs font-black text-wine">#{order.order_number} · {customer?.name || 'Sem cliente'}</p><p className="m-0 mt-1 text-[10px] text-graphite/40">{shortDateTime(order.scheduled_at)}</p></div></div><div className="mt-3 space-y-1">{(order.items ?? []).slice(0, 4).map((item: any, index: number) => <p key={index} className="m-0 text-xs text-graphite/65">{numberPt(item.quantity)}× {item.name_snapshot}</p>)}</div></Link><div className="mt-4"><OrderActions id={order.id} status={order.status} fulfillmentType={order.fulfillment_type} canManageOrders={canManageOrders} canManageProduction={canManageProduction} canCancel={canCancel} /></div></article>;
  })}</div></section>;
}
