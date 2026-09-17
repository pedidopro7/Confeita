import { notFound } from 'next/navigation';
import { CalendarDays, MapPin, ReceiptText } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { QuoteActions } from '@/components/quote-actions';
import { QuoteShareButton } from '@/components/quote-share-button';
import { getBusinessContext, hasPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, numberPt, shortDateTime } from '@/lib/format';

const labels:Record<string,string>={draft:'Rascunho',sent:'Enviado',waiting:'Aguardando cliente',approved:'Aprovado',rejected:'Recusado',expired:'Expirado'};

export default async function OrcamentoDetalhePage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const context=await getBusinessContext();if(!context)return null;if(!hasPermission(context,'manage_quotes'))redirect('/painel?erro='+encodeURIComponent('Seu perfil não pode acessar orçamentos.')); if(!context)return null;
  const supabase=await createClient();
  const [{data:quote},{data:items=[]}]=await Promise.all([
    supabase.from('quotes').select('id,status,desired_at,subtotal,discount,delivery_fee,total,deposit_required,fulfillment_type,notes,expires_at,created_at,customer:customers(name,whatsapp,email)').eq('business_id',context.business.id).eq('id',id).maybeSingle(),
    supabase.from('quote_items').select('id,name_snapshot,quantity,unit_price,total_price,configuration,created_at').eq('business_id',context.business.id).eq('quote_id',id).order('created_at')
  ]);
  if(!quote)notFound();
  const customer:any=Array.isArray(quote.customer)?quote.customer[0]:quote.customer;
  const shareLines:string[]=[];
  shareLines.push('ORÇAMENTO — '+context.business.name);
  if(customer?.name)shareLines.push('Cliente: '+customer.name);
  if(quote.desired_at)shareLines.push('Data desejada: '+shortDateTime(quote.desired_at));
  shareLines.push('Forma: '+(quote.fulfillment_type==='delivery'?'Entrega':'Retirada'));
  shareLines.push('');
  for(const item of items??[])shareLines.push(numberPt(item.quantity)+'x '+item.name_snapshot+' — '+money(item.total_price));
  shareLines.push('');
  if(Number(quote.discount)>0)shareLines.push('Desconto: -'+money(quote.discount));
  if(Number(quote.delivery_fee)>0)shareLines.push('Entrega: '+money(quote.delivery_fee));
  shareLines.push('Total: '+money(quote.total));
  shareLines.push(Number(quote.deposit_required)>0?'Reserva da data: '+money(quote.deposit_required):'Sem sinal obrigatório');
  if(quote.notes)shareLines.push('', 'Observações: '+quote.notes);
  shareLines.push('', 'Orçamento gerado pela Confeita.');
  const shareText=shareLines.join('\n');

  return <><PageHeader eyebrow="Proposta comercial" title={customer?.name?'Orçamento · '+customer.name:'Orçamento'} description={(labels[quote.status]??quote.status)+' · criado em '+shortDateTime(quote.created_at)}/>
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <section className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-wine/10 px-5 py-4"><div className="flex items-center gap-2"><ReceiptText size={15} className="text-wine"/><strong className="text-sm text-wine">Itens da proposta</strong></div><span className="rounded-full bg-cream px-3 py-1 text-[10px] font-bold text-wine">{labels[quote.status]??quote.status}</span></div>{(items??[]).map(item=><div key={item.id} className="flex items-start gap-3 border-b border-wine/5 px-5 py-4 last:border-0"><div className="min-w-0 flex-1"><p className="m-0 text-sm font-bold text-graphite">{item.name_snapshot}</p><p className="m-0 mt-1 text-xs text-graphite/40">{numberPt(item.quantity)} × {money(item.unit_price)}</p></div><strong className="text-sm text-wine">{money(item.total_price)}</strong></div>)}</section>
        {quote.notes&&<section className="panel p-5"><p className="eyebrow mb-2">Personalização e observações</p><p className="m-0 whitespace-pre-wrap text-sm leading-6 text-graphite/60">{quote.notes}</p></section>}
      </div>
      <aside className="space-y-5">
        <section className="panel p-5"><p className="eyebrow mb-3">Resumo</p>{quote.desired_at&&<div className="mb-3 flex items-center gap-2 rounded-2xl bg-cream p-3 text-xs text-graphite/60"><CalendarDays size={14} className="text-wine"/>{shortDateTime(quote.desired_at)}</div>}<div className="mb-4 flex items-center gap-2 rounded-2xl bg-cream p-3 text-xs text-graphite/60"><MapPin size={14} className="text-wine"/>{quote.fulfillment_type==='delivery'?'Entrega':'Retirada'}</div><div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-graphite/50">Subtotal</span><strong>{money(quote.subtotal)}</strong></div>{Number(quote.discount)>0&&<div className="flex justify-between"><span className="text-graphite/50">Desconto</span><strong>-{money(quote.discount)}</strong></div>}{Number(quote.delivery_fee)>0&&<div className="flex justify-between"><span className="text-graphite/50">Entrega</span><strong>{money(quote.delivery_fee)}</strong></div>}</div><div className="mt-4 border-t border-wine/10 pt-4"><p className="m-0 text-xs text-graphite/40">Total</p><p className="m-0 mt-1 text-3xl font-black text-wine">{money(quote.total)}</p><p className="mb-0 mt-2 text-xs font-bold text-terracotta">Reserva: {money(quote.deposit_required)}</p></div></section>
        <section className="panel p-5"><p className="eyebrow mb-3">Enviar ao cliente</p><QuoteShareButton text={shareText}/>{customer?.whatsapp&&<p className="mb-0 mt-3 text-[10px] text-graphite/40">WhatsApp cadastrado: {customer.whatsapp}</p>}</section>
        <section className="panel p-5"><p className="eyebrow mb-3">Ações</p><QuoteActions id={quote.id} status={quote.status}/></section>
      </aside>
    </div>
  </>;
}
