import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, shortDateTime } from '@/lib/format';
import { QuoteActions } from '@/components/quote-actions';

const labels:Record<string,string>={draft:'Rascunho',sent:'Enviado',waiting:'Aguardando',approved:'Aprovado',rejected:'Recusado',expired:'Expirado'};

export default async function OrcamentosPage() {
  const context = await getBusinessContext(); if (!context) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('quotes').select('id,status,desired_at,total,deposit_required,fulfillment_type,created_at,customer:customers(name)').eq('business_id', context.business.id).order('created_at', { ascending: false }).limit(100);
  const quotes = data ?? [];
  return <><PageHeader eyebrow="Comercial" title="Orçamentos" description="Monte propostas rápidas e transforme as aprovadas em encomendas sem redigitar." actionHref="/painel/orcamentos/novo" actionLabel="Novo orçamento" />
    <section className="panel overflow-hidden">{quotes.length === 0 ? <div className="p-10 text-center text-sm text-graphite/45">Nenhum orçamento criado.</div> : quotes.map((q: any) => {
      const customer=Array.isArray(q.customer)?q.customer[0]:q.customer;
      return <div key={q.id} className="grid gap-3 border-b border-wine/5 px-5 py-4 last:border-0 lg:grid-cols-[1fr_150px_140px_250px] lg:items-center">
        <Link href={'/painel/orcamentos/'+q.id} className="min-w-0"><p className="m-0 truncate text-sm font-bold text-graphite">{customer?.name||'Cliente não informado'}</p><p className="m-0 mt-1 text-xs text-graphite/40">{q.desired_at?'Desejado: '+shortDateTime(q.desired_at):'Data não definida'} · {q.fulfillment_type==='delivery'?'Entrega':'Retirada'}</p></Link>
        <div><span className="rounded-full bg-cream px-2.5 py-1 text-[10px] font-bold text-wine">{labels[q.status]??q.status}</span></div>
        <div><strong className="block text-wine">{money(q.total)}</strong>{Number(q.deposit_required)>0&&<span className="text-[9px] text-graphite/35">sinal {money(q.deposit_required)}</span>}</div>
        <QuoteActions id={q.id} status={q.status} />
      </div>;
    })}</section>
  </>;
}
