import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowDownRight, ArrowUpRight, Clock3, WalletCards } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, shortDate } from '@/lib/format';
import { recordManualExpenseAction } from './actions';

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getBusinessContext(); if (!context) return null;
  if (!['owner','manager','finance'].includes(context.role)) redirect('/painel');
  const params = await searchParams;
  const supabase = await createClient();
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();
  const startDate = startIso.slice(0, 10);

  const [paymentsResult, expensesResult, purchasesResult, ordersResult, summariesResult, openOrdersResult] = await Promise.all([
    supabase.from('order_payments').select('id,order_id,amount,status,paid_at,method').eq('business_id', context.business.id).eq('status', 'paid').gte('paid_at', startIso).order('paid_at', { ascending: false }),
    supabase.from('expenses').select('id,category,description,amount,occurred_at').eq('business_id', context.business.id).gte('occurred_at', startDate).order('occurred_at', { ascending: false }),
    supabase.from('purchases').select('id,total,purchased_at,supplier:suppliers(name)').eq('business_id', context.business.id).gte('purchased_at', startIso).order('purchased_at', { ascending: false }),
    supabase.from('orders').select('id,total,status').eq('business_id', context.business.id).gte('created_at', startIso),
    supabase.from('order_financial_summary').select('order_id,paid,balance,payment_status,deposit_satisfied').eq('business_id', context.business.id),
    supabase.from('orders').select('id,order_number,total,status,scheduled_at,customer:customers(name)').eq('business_id', context.business.id).in('status', ['draft','awaiting_deposit','confirmed','production','ready','out_for_delivery']).order('scheduled_at').limit(30)
  ]);

  const payments = paymentsResult.data ?? [];
  const expenses = expensesResult.data ?? [];
  const purchases = purchasesResult.data ?? [];
  const orders = ordersResult.data ?? [];
  const openOrders = openOrdersResult.data ?? [];
  const summaryMap = new Map((summariesResult.data ?? []).map((summary) => [summary.order_id, summary]));
  const received = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const manualSpent = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const purchasesSpent = purchases.reduce((sum, purchase) => sum + Number(purchase.total), 0);
  const outflow = manualSpent + purchasesSpent;
  const sold = orders.filter((order) => !['canceled','refunded'].includes(order.status)).reduce((sum, order) => sum + Number(order.total), 0);
  const receivable = openOrders.reduce((sum, order) => sum + Number(summaryMap.get(order.id)?.balance ?? order.total), 0);
  const cashResult = received - outflow;
  const ok = typeof params.ok === 'string' ? params.ok : null;
  const error = typeof params.erro === 'string' ? params.erro : null;
  const expenseKey = globalThis.crypto.randomUUID();

  return <>
    <PageHeader eyebrow="Saúde financeira" title="Financeiro" description="O que foi vendido, o que realmente entrou, o que ainda falta receber e quanto saiu do caixa." />
    {(ok || error) && <div className={`mb-5 rounded-2xl px-4 py-3 text-xs font-bold ${error ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>{error || 'Despesa registrada e fluxo de caixa atualizado.'}</div>}

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Card label="Vendido no mês" value={money(sold)} />
      <Card label="Recebido" value={money(received)} positive />
      <Card label="A receber" value={money(receivable)} attention={receivable > 0} />
      <Card label="Saídas" value={money(outflow)} danger />
      <Card label="Caixa do período" value={money(cashResult)} positive={cashResult >= 0} danger={cashResult < 0} />
    </div>

    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <div className="space-y-5">
        <section className="panel overflow-hidden">
          <div className="flex items-center gap-3 border-b border-wine/10 px-5 py-4"><Clock3 size={15} className="text-wine"/><div><p className="m-0 text-sm font-black text-wine">Contas a receber</p><p className="m-0 mt-1 text-[10px] text-graphite/40">Saldo dos pedidos em aberto</p></div></div>
          {openOrders.length === 0 ? <div className="p-8 text-center text-xs text-graphite/40">Nenhum recebimento pendente.</div> : <div className="divide-y divide-wine/5">{openOrders.map((order: any) => {
            const summary = summaryMap.get(order.id);
            const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer;
            const balance = Number(summary?.balance ?? order.total);
            return <Link href={`/painel/pedidos/${order.id}`} key={order.id} className="flex items-center gap-3 px-5 py-4 transition hover:bg-cream/40"><div className="min-w-0 flex-1"><p className="m-0 truncate text-sm font-bold text-graphite">#{order.order_number} · {customer?.name || 'Sem cliente'}</p><p className="m-0 mt-1 text-[10px] text-graphite/40">{summary?.payment_status === 'partial' ? `Parcial · recebido ${money(summary.paid)}` : 'Pagamento pendente'}</p></div><strong className={`shrink-0 text-sm ${balance > 0 ? 'text-warning' : 'text-success'}`}>{money(balance)}</strong></Link>;
          })}</div>}
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="panel overflow-hidden"><div className="flex items-center gap-2 border-b border-wine/10 px-5 py-4"><ArrowUpRight size={14} className="text-success"/><p className="m-0 text-sm font-black text-wine">Recebimentos</p></div>{payments.length === 0 ? <div className="p-6 text-xs text-graphite/40">Nenhum recebimento neste mês.</div> : <div className="divide-y divide-wine/5">{payments.slice(0, 10).map((payment) => <div key={payment.id} className="flex items-center justify-between gap-3 px-5 py-3"><div><p className="m-0 text-xs font-bold text-graphite">Pedido</p><p className="m-0 mt-1 text-[9px] text-graphite/35">{shortDate(payment.paid_at)} · {payment.method}</p></div><strong className="text-xs text-success">+{money(payment.amount)}</strong></div>)}</div>}</section>
          <section className="panel overflow-hidden"><div className="flex items-center gap-2 border-b border-wine/10 px-5 py-4"><ArrowDownRight size={14} className="text-danger"/><p className="m-0 text-sm font-black text-wine">Compras de insumos</p></div>{purchases.length === 0 ? <div className="p-6 text-xs text-graphite/40">Nenhuma compra neste mês.</div> : <div className="divide-y divide-wine/5">{purchases.slice(0, 10).map((purchase: any) => { const supplier = Array.isArray(purchase.supplier) ? purchase.supplier[0] : purchase.supplier; return <div key={purchase.id} className="flex items-center justify-between gap-3 px-5 py-3"><div><p className="m-0 text-xs font-bold text-graphite">{supplier?.name || 'Compra de insumos'}</p><p className="m-0 mt-1 text-[9px] text-graphite/35">{shortDate(purchase.purchased_at)}</p></div><strong className="text-xs text-danger">-{money(purchase.total)}</strong></div>; })}</div>}</section>
        </div>

        <section className="panel overflow-hidden"><div className="border-b border-wine/10 px-5 py-4"><p className="m-0 text-sm font-black text-wine">Outras despesas</p><p className="m-0 mt-1 text-[10px] text-graphite/40">Não inclui compras registradas na aba Compras.</p></div>{expenses.length === 0 ? <div className="p-8 text-center text-sm text-graphite/45">Nenhuma despesa manual registrada.</div> : expenses.map((expense) => <div key={expense.id} className="flex items-center justify-between border-b border-wine/5 px-5 py-4 last:border-0"><div><p className="m-0 text-sm font-bold text-graphite">{expense.description}</p><p className="m-0 mt-1 text-xs text-graphite/40">{expense.category} · {shortDate(expense.occurred_at)}</p></div><strong className="text-danger">-{money(expense.amount)}</strong></div>)}</section>
      </div>

      <aside className="space-y-5">
        <form action={recordManualExpenseAction} className="panel p-5"><input type="hidden" name="idempotency_key" value={expenseKey}/><p className="eyebrow mb-1">Saída</p><h2 className="mt-0 text-xl font-black text-wine">Nova despesa</h2><div className="space-y-3"><select name="category" className="input"><option value="embalagens">Embalagens</option><option value="aluguel">Aluguel</option><option value="energia">Energia</option><option value="gas">Gás</option><option value="marketing">Marketing</option><option value="entrega">Entrega</option><option value="funcionarios">Funcionários</option><option value="equipamentos">Equipamentos</option><option value="impostos">Impostos</option><option value="outros">Outros</option></select><input required name="description" placeholder="Descrição" className="input" /><input required name="amount" type="number" min="0.01" step="0.01" placeholder="Valor" className="input" /><input name="occurred_at" type="date" className="input" /></div><p className="mb-0 mt-3 text-[10px] leading-4 text-graphite/40">Ingredientes comprados pela aba Compras já entram no fluxo financeiro automaticamente. Não cadastre a mesma compra aqui.</p><button className="mt-4 h-11 w-full rounded-2xl bg-wine text-sm font-bold text-cream">Registrar despesa</button></form>
        <div className="rounded-3xl bg-wine p-5 text-cream"><WalletCards size={20}/><p className="mb-0 mt-4 text-sm font-black">Leitura gerencial</p><p className="mb-0 mt-2 text-xs leading-5 text-cream/55">O caixa mostra entradas e saídas registradas. Lucro de produto continua separado nos relatórios de custo para não confundir caixa com margem.</p></div>
      </aside>
    </div>
  </>;
}

function Card({ label, value, danger = false, positive = false, attention = false }: { label: string; value: string; danger?: boolean; positive?: boolean; attention?: boolean }) {
  return <div className={`panel p-5 ${attention ? 'ring-1 ring-warning/15' : ''}`}><p className="eyebrow mb-2">{label}</p><p className={`m-0 text-2xl font-black ${danger ? 'text-danger' : positive ? 'text-success' : attention ? 'text-warning' : 'text-wine'}`}>{value}</p></div>;
}
