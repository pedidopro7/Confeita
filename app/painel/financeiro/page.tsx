import { PageHeader } from '@/components/page-header';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createExpenseAction } from '../actions';
import { money, shortDate } from '@/lib/format';

export default async function FinanceiroPage() {
  const context = await getBusinessContext(); if (!context) return null;
  const supabase = await createClient();
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const [paymentsResult, expensesResult, ordersResult] = await Promise.all([
    supabase.from('order_payments').select('amount,status,paid_at').eq('business_id', context.business.id).eq('status', 'paid').gte('paid_at', start.toISOString()),
    supabase.from('expenses').select('id,category,description,amount,occurred_at').eq('business_id', context.business.id).gte('occurred_at', start.toISOString().slice(0, 10)).order('occurred_at', { ascending: false }),
    supabase.from('orders').select('total,status').eq('business_id', context.business.id).gte('created_at', start.toISOString())
  ]);
  const payments = paymentsResult.data ?? [];
  const expenses = expensesResult.data ?? [];
  const orders = ordersResult.data ?? [];
  const received = payments.reduce((s, p) => s + Number(p.amount), 0);
  const spent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const sold = orders.filter(o => o.status !== 'canceled').reduce((s, o) => s + Number(o.total), 0);

  return <><PageHeader eyebrow="Saúde financeira" title="Financeiro" description="Entradas, despesas e resultado operacional da confeitaria." />
    <div className="mb-5 grid gap-3 md:grid-cols-3"><Card label="Vendido no mês" value={money(sold)} /><Card label="Recebido" value={money(received)} /><Card label="Despesas" value={money(spent)} danger /></div>
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><section className="panel overflow-hidden"><div className="border-b border-wine/10 px-5 py-4 font-bold text-wine">Despesas deste mês</div>{expenses.length === 0 ? <div className="p-8 text-center text-sm text-graphite/45">Nenhuma despesa registrada.</div> : expenses.map(e => <div key={e.id} className="flex items-center justify-between border-b border-wine/5 px-5 py-4 last:border-0"><div><p className="m-0 text-sm font-bold text-graphite">{e.description}</p><p className="m-0 mt-1 text-xs text-graphite/40">{e.category} · {shortDate(e.occurred_at)}</p></div><strong className="text-danger">-{money(e.amount)}</strong></div>)}</section>
    <form action={createExpenseAction} className="panel h-fit p-5"><p className="eyebrow mb-1">Saída</p><h2 className="mt-0 text-xl font-black text-wine">Nova despesa</h2><div className="space-y-3"><select name="category" className="input"><option value="ingredientes">Ingredientes</option><option value="embalagens">Embalagens</option><option value="aluguel">Aluguel</option><option value="energia">Energia</option><option value="gas">Gás</option><option value="marketing">Marketing</option><option value="entrega">Entrega</option><option value="funcionarios">Funcionários</option><option value="equipamentos">Equipamentos</option><option value="impostos">Impostos</option><option value="outros">Outros</option></select><input required name="description" placeholder="Descrição" className="input" /><input required name="amount" type="number" min="0.01" step="0.01" placeholder="Valor" className="input" /><input name="occurred_at" type="date" className="input" /></div><button className="mt-4 h-11 w-full rounded-2xl bg-wine text-sm font-bold text-cream">Registrar despesa</button></form></div>
  </>;
}

function Card({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <div className="panel p-5"><p className="eyebrow mb-2">{label}</p><p className={`m-0 text-2xl font-black ${danger ? 'text-danger' : 'text-wine'}`}>{value}</p></div>; }
