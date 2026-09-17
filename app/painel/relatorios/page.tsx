import { PageHeader } from '@/components/page-header';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, numberPt } from '@/lib/format';

export default async function RelatoriosPage() {
  const context = await getBusinessContext(); if (!context) return null;
  const supabase = await createClient();
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const [ordersResult, expensesResult, lossesResult, stockResult, itemCostsResult] = await Promise.all([
    supabase.from('orders').select('id,total,subtotal,status').eq('business_id', context.business.id).gte('created_at', start.toISOString()),
    supabase.from('expenses').select('amount').eq('business_id', context.business.id).gte('occurred_at', start.toISOString().slice(0, 10)),
    supabase.from('inventory_movements').select('quantity_delta,unit_cost').eq('business_id', context.business.id).eq('movement_type', 'LOSS').gte('created_at', start.toISOString()),
    supabase.from('inventory_stock_summary').select('available,min_stock').eq('business_id', context.business.id),
    supabase.from('order_items').select('order_id,cost_snapshot').eq('business_id', context.business.id).gte('created_at', start.toISOString())
  ]);
  const orders = ordersResult.data ?? [];
  const expenses = expensesResult.data ?? [];
  const losses = lossesResult.data ?? [];
  const stock = stockResult.data ?? [];
  const itemCosts = itemCostsResult.data ?? [];
  const valid = orders.filter(o => !['canceled', 'refunded'].includes(o.status));
  const validIds = new Set(valid.map((order) => order.id));
  const revenue = valid.reduce((s, o) => s + Number(o.total), 0);
  const productRevenue = valid.reduce((s, o) => s + Number(o.subtotal), 0);
  const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const lossCost = losses.reduce((s, l) => s + Math.abs(Number(l.quantity_delta)) * Number(l.unit_cost || 0), 0);
  const low = stock.filter(s => Number(s.available) < Number(s.min_stock)).length;
  const materialCost = itemCosts.filter((item) => validIds.has(item.order_id) && item.cost_snapshot !== null).reduce((sum, item) => sum + Number(item.cost_snapshot), 0);
  const snapshotItems = itemCosts.filter((item) => validIds.has(item.order_id) && item.cost_snapshot !== null).length;
  const materialGrossProfit = productRevenue - materialCost;
  const materialMargin = productRevenue > 0 ? (materialGrossProfit / productRevenue) * 100 : 0;
  const canSeeCosts = context.role === 'owner';

  return <><PageHeader eyebrow="Indicadores" title="Relatórios" description="Uma leitura simples do que está acontecendo no negócio." />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Report label="Faturamento do mês" value={money(revenue)} detail={`${valid.length} pedidos válidos`} /><Report label="Despesas lançadas" value={money(expensesTotal)} detail="Despesas operacionais cadastradas" /><Report label="Perdas estimadas" value={money(lossCost)} detail={`${losses.length} movimentações`} /><Report label="Itens críticos" value={String(low)} detail="Abaixo do estoque mínimo" /></div>

    {canSeeCosts && <section className="mt-5 grid gap-4 sm:grid-cols-3"><Report label="Custo de insumos" value={money(materialCost)} detail={`${snapshotItems} item(ns) com snapshot`} /><Report label="Lucro bruto de insumos" value={money(materialGrossProfit)} detail="Venda de produtos menos insumos" /><Report label="Margem de insumos" value={`${numberPt(materialMargin, 1)}%`} detail="Sobre a venda de produtos" /></section>}

    <section className="panel mt-5 p-6"><p className="eyebrow">Resultado simples</p><div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="m-0 text-sm text-graphite/50">Faturamento menos despesas cadastradas{canSeeCosts ? ' e insumos com snapshot' : ''}</p><p className="mb-0 mt-2 text-4xl font-black text-wine">{money(revenue - expensesTotal - (canSeeCosts ? materialCost : 0))}</p></div><p className="max-w-xl text-xs leading-5 text-graphite/45">Esse número é gerencial e não substitui lucro líquido contábil. {canSeeCosts ? 'Os insumos usam o custo congelado na confirmação de cada encomenda; mão de obra, impostos, energia e outras despesas só entram quando cadastrados.' : 'Custos de receitas ficam disponíveis ao proprietário.'}</p></div></section>
  </>;
}

function Report({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="panel p-5"><p className="eyebrow mb-2">{label}</p><p className="m-0 text-2xl font-black text-wine">{value}</p><p className="m-0 mt-2 text-xs text-graphite/40">{detail}</p></div>; }
