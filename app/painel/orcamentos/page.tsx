import { PageHeader } from '@/components/page-header';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, shortDateTime } from '@/lib/format';
import { QuoteActions } from '@/components/quote-actions';

export default async function OrcamentosPage() {
  const context = await getBusinessContext(); if (!context) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('quotes').select('id,status,desired_at,total,created_at,customer:customers(name)').eq('business_id', context.business.id).order('created_at', { ascending: false }).limit(100);
  const quotes = data ?? [];
  return <><PageHeader eyebrow="Comercial" title="Orçamentos" description="Monte propostas rápidas e transforme as aprovadas em encomendas sem redigitar." actionHref="/painel/orcamentos/novo" actionLabel="Novo orçamento" />
    <section className="panel overflow-hidden">{quotes.length === 0 ? <div className="p-10 text-center text-sm text-graphite/45">Nenhum orçamento criado.</div> : quotes.map((q: any) => <div key={q.id} className="grid gap-3 border-b border-wine/5 px-5 py-4 last:border-0 lg:grid-cols-[1fr_160px_130px_220px] lg:items-center"><div><p className="m-0 text-sm font-bold text-graphite">{Array.isArray(q.customer) ? q.customer[0]?.name : q.customer?.name || 'Cliente não informado'}</p><p className="m-0 mt-1 text-xs text-graphite/40">Desejado: {shortDateTime(q.desired_at)}</p></div><span className="text-xs font-bold uppercase text-wine">{q.status}</span><strong className="text-wine">{money(q.total)}</strong><QuoteActions id={q.id} status={q.status} /></div>)}</section>
  </>;
}
