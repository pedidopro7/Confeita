import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { shortDate, timeOnly, money } from '@/lib/format';

type ViewMode='day'|'week'|'month';

function ymd(date:Date){return date.toISOString().slice(0,10);}
function safeDate(raw:string|undefined){const d=raw?new Date(raw+'T12:00:00Z'):new Date();return Number.isNaN(d.getTime())?new Date():d;}

function rangeFor(anchor:Date,view:ViewMode){
  const start=new Date(anchor);
  const end=new Date(anchor);
  if(view==='day'){start.setUTCHours(0,0,0,0);end.setTime(start.getTime()+86400000);}
  else if(view==='week'){const day=(start.getUTCDay()+6)%7;start.setUTCDate(start.getUTCDate()-day);start.setUTCHours(0,0,0,0);end.setTime(start.getTime()+7*86400000);}
  else{start.setUTCDate(1);start.setUTCHours(0,0,0,0);end.setTime(start.getTime());end.setUTCMonth(end.getUTCMonth()+1);}
  return{start,end};
}
function shift(anchor:Date,view:ViewMode,direction:number){const d=new Date(anchor);if(view==='day')d.setUTCDate(d.getUTCDate()+direction);else if(view==='week')d.setUTCDate(d.getUTCDate()+direction*7);else d.setUTCMonth(d.getUTCMonth()+direction);return d;}
function titleFor(start:Date,end:Date,view:ViewMode){
  if(view==='day')return start.toLocaleDateString('pt-BR',{timeZone:'UTC',weekday:'long',day:'2-digit',month:'long'});
  if(view==='month')return start.toLocaleDateString('pt-BR',{timeZone:'UTC',month:'long',year:'numeric'});
  const last=new Date(end.getTime()-1);return start.toLocaleDateString('pt-BR',{timeZone:'UTC',day:'2-digit',month:'short'})+' — '+last.toLocaleDateString('pt-BR',{timeZone:'UTC',day:'2-digit',month:'short'});
}

export default async function AgendaPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const context=await getBusinessContext();if(!context)return null;
  const params=await searchParams;
  const rawView=typeof params.view==='string'?params.view:'week';
  const view:ViewMode=rawView==='day'||rawView==='month'?rawView:'week';
  const anchor=safeDate(typeof params.date==='string'?params.date:undefined);
  const {start,end}=rangeFor(anchor,view);
  const previous=shift(anchor,view,-1);
  const next=shift(anchor,view,1);
  const supabase=await createClient();
  const {data:ordersData}=await supabase.from('orders').select('id,order_number,status,scheduled_at,total,fulfillment_type,customer:customers(name)').eq('business_id',context.business.id).gte('scheduled_at',start.toISOString()).lt('scheduled_at',end.toISOString()).neq('status','canceled').order('scheduled_at');
  const orders=ordersData??[];
  const groups=new Map<string,any[]>();
  for(const order of orders){const key=shortDate(order.scheduled_at);groups.set(key,[...(groups.get(key)||[]),order]);}

  return <><PageHeader eyebrow="Planejamento" title="Agenda" description="Veja sua carga de encomendas por dia, semana ou mês." actionHref="/painel/pedidos/novo" actionLabel="Nova encomenda"/>
    <section className="panel mb-5 p-3 sm:p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex rounded-2xl bg-cream p-1">{(['day','week','month'] as ViewMode[]).map(mode=><Link key={mode} href={'/painel/agenda?view='+mode+'&date='+ymd(anchor)} className={`rounded-xl px-4 py-2 text-[10px] font-bold ${view===mode?'bg-wine text-cream':'text-wine/55'}`}>{mode==='day'?'Dia':mode==='week'?'Semana':'Mês'}</Link>)}</div><div className="flex items-center justify-between gap-2 sm:justify-end"><Link aria-label="Período anterior" href={'/painel/agenda?view='+view+'&date='+ymd(previous)} className="mini-button"><ChevronLeft size={15}/></Link><p className="m-0 min-w-40 text-center text-xs font-black capitalize text-wine">{titleFor(start,end,view)}</p><Link aria-label="Próximo período" href={'/painel/agenda?view='+view+'&date='+ymd(next)} className="mini-button"><ChevronRight size={15}/></Link><Link href={'/painel/agenda?view='+view+'&date='+ymd(new Date())} className="rounded-xl bg-cream px-3 py-2 text-[10px] font-bold text-wine">Hoje</Link></div></div></section>
    {orders.length===0?<div className="panel p-10 text-center text-sm text-graphite/45">Nenhuma encomenda neste período.</div>:<div className="space-y-5">{Array.from(groups.entries()).map(([date,list])=><section key={date}><div className="mb-2 flex items-center gap-3"><span className="rounded-full bg-wine px-3 py-1 text-xs font-bold text-cream">{date}</span><div className="h-px flex-1 bg-wine/10"/><span className="text-[10px] font-bold text-graphite/35">{list.length} {list.length===1?'encomenda':'encomendas'}</span></div><div className="panel divide-y divide-wine/5 overflow-hidden">{list.map((o:any)=><Link key={o.id} href={'/painel/pedidos/'+o.id} className="flex items-center gap-4 px-5 py-4 hover:bg-wine/[.025]"><div className="w-14 text-sm font-black text-wine">{timeOnly(o.scheduled_at)}</div><div className="min-w-0 flex-1"><p className="m-0 text-sm font-bold text-graphite">Pedido #{o.order_number} · {Array.isArray(o.customer)?o.customer[0]?.name:o.customer?.name||'Cliente não informado'}</p><p className="m-0 mt-1 text-xs text-graphite/40">{o.fulfillment_type==='delivery'?'Entrega':'Retirada'} · {o.status}</p></div><strong className="hidden text-sm text-wine sm:block">{money(o.total)}</strong></Link>)}</div></section>)}</div>}
  </>;
}
