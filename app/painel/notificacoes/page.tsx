import Link from 'next/link';
import { AlertTriangle, Bell, CalendarClock, CircleDollarSign, PackageOpen, TimerReset } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, numberPt, shortDateTime } from '@/lib/format';
import { markAllNotificationsReadAction, markNotificationReadAction } from './actions';

type LiveAlert={key:string;title:string;body:string;href:string;tone:'danger'|'warning'|'info';icon:React.ComponentType<{size?:number;className?:string}>};

export default async function NotificacoesPage(){
  const context=await getBusinessContext(); if(!context) return null;
  const supabase=await createClient();
  const now=new Date();
  const tomorrow=new Date(now.getTime()+24*60*60*1000);
  const expiryLimit=new Date(now.getTime()+3*24*60*60*1000).toISOString().slice(0,10);

  const [storedResult,ordersResult,stockResult,batchesResult,summariesResult]=await Promise.all([
    supabase.from('notifications').select('id,title,body,type,action_url,read_at,created_at').eq('business_id',context.business.id).order('created_at',{ascending:false}).limit(50),
    supabase.from('orders').select('id,order_number,status,scheduled_at,total,customer:customers(name)').eq('business_id',context.business.id).gte('scheduled_at',now.toISOString()).lte('scheduled_at',tomorrow.toISOString()).in('status',['draft','awaiting_deposit','confirmed','production','ready','out_for_delivery']).order('scheduled_at').limit(20),
    supabase.from('inventory_stock_summary').select('inventory_item_id,name,base_unit,available,min_stock').eq('business_id',context.business.id).order('available').limit(30),
    supabase.from('inventory_batches').select('id,inventory_item_id,expires_at,quantity_remaining,item:inventory_items(name,base_unit)').eq('business_id',context.business.id).gt('quantity_remaining',0).lte('expires_at',expiryLimit).order('expires_at').limit(20),
    supabase.from('order_financial_summary').select('order_id,balance,payment_status').eq('business_id',context.business.id)
  ]);

  const summaries=new Map((summariesResult.data??[]).map(row=>[row.order_id,row]));
  const live:LiveAlert[]=[];
  for(const order of ordersResult.data??[]){
    const customer=Array.isArray(order.customer)?order.customer[0]:order.customer;
    const balance=Number(summaries.get(order.id)?.balance??order.total);
    live.push({key:`order-${order.id}`,title:`Pedido #${order.order_number} nas próximas 24h`,body:`${customer?.name||'Sem cliente'} · ${shortDateTime(order.scheduled_at)}${balance>0?` · falta receber ${money(balance)}`:''}`,href:`/painel/pedidos/${order.id}`,tone:order.status==='draft'||order.status==='awaiting_deposit'?'warning':'info',icon:CalendarClock});
  }
  for(const item of (stockResult.data??[]).filter(item=>Number(item.available)<Number(item.min_stock))){
    live.push({key:`stock-${item.inventory_item_id}`,title:`${item.name} abaixo do mínimo`,body:`Disponível: ${numberPt(item.available)} ${item.base_unit} · mínimo: ${numberPt(item.min_stock)} ${item.base_unit}`,href:'/painel/compras/lista',tone:'danger',icon:PackageOpen});
  }
  for(const batch of batchesResult.data??[]){
    const item=Array.isArray(batch.item)?batch.item[0]:batch.item;
    live.push({key:`batch-${batch.id}`,title:`${item?.name||'Ingrediente'} perto da validade`,body:`Validade: ${batch.expires_at} · saldo: ${numberPt(batch.quantity_remaining)} ${item?.base_unit||''}`,href:'/painel/estoque',tone:'warning',icon:TimerReset});
  }

  const openBalance=(ordersResult.data??[]).reduce((sum,order)=>sum+Math.max(Number(summaries.get(order.id)?.balance??0),0),0);
  if(openBalance>0) live.unshift({key:'receivable-24h',title:'Recebimentos dos próximos pedidos',body:`${money(openBalance)} ainda pendentes nos pedidos das próximas 24h.`,href:'/painel/financeiro',tone:'warning',icon:CircleDollarSign});

  const stored=storedResult.data??[];
  const unread=stored.filter(item=>!item.read_at);

  return <><PageHeader eyebrow="Central de atenção" title="Avisos" description="Prazos, estoque, validade e pendências importantes reunidos em um lugar."/>
    {live.length===0&&unread.length===0?<div className="panel p-10 text-center"><Bell className="mx-auto mb-3 text-wine/20"/><p className="m-0 text-sm font-black text-wine">Tudo em ordem por aqui.</p><p className="mb-0 mt-2 text-xs text-graphite/45">Novos alertas operacionais aparecem automaticamente conforme os dados da confeitaria.</p></div>:<div className="space-y-5">
      {live.length>0&&<section><div className="mb-3 flex items-center justify-between"><div><p className="eyebrow mb-1">Gerados agora</p><h2 className="m-0 text-xl font-black text-wine">O que merece atenção</h2></div><span className="rounded-full bg-wine px-3 py-1.5 text-[10px] font-bold text-cream">{live.length}</span></div><div className="grid gap-3 lg:grid-cols-2">{live.map(alert=><AlertCard key={alert.key} alert={alert}/>)}</div></section>}
      <section className="panel overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-wine/10 px-5 py-4"><div><p className="m-0 text-sm font-black text-wine">Avisos salvos</p><p className="m-0 mt-1 text-[10px] text-graphite/40">{unread.length} não lidos</p></div>{unread.length>0&&<form action={markAllNotificationsReadAction}><button className="rounded-xl bg-cream px-3 py-2 text-[10px] font-bold text-wine">Marcar todos como lidos</button></form>}</div>
        {stored.length===0?<div className="p-8 text-center text-xs text-graphite/40">Nenhum aviso salvo.</div>:<div className="divide-y divide-wine/5">{stored.map(item=><div key={item.id} className={`flex items-start gap-3 px-5 py-4 ${item.read_at?'opacity-55':''}`}><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cream text-wine"><Bell size={14}/></div><div className="min-w-0 flex-1"><p className="m-0 text-sm font-bold text-graphite">{item.title}</p>{item.body&&<p className="mb-0 mt-1 text-xs leading-5 text-graphite/45">{item.body}</p>}<p className="mb-0 mt-2 text-[9px] text-graphite/30">{shortDateTime(item.created_at)}</p></div><div className="flex shrink-0 gap-2">{item.action_url&&<Link href={item.action_url} className="rounded-xl bg-wine px-3 py-2 text-[10px] font-bold text-cream">Abrir</Link>}{!item.read_at&&<form action={markNotificationReadAction.bind(null,item.id)}><button title="Marcar como lido" className="rounded-xl border border-wine/10 bg-white px-3 py-2 text-[10px] font-bold text-wine">Lido</button></form>}</div></div>)}</div>}
      </section>
    </div>}
  </>;
}

function AlertCard({alert}:{alert:LiveAlert}){
  const Icon=alert.icon;
  const tone=alert.tone==='danger'?'bg-danger/10 text-danger':alert.tone==='warning'?'bg-warning/10 text-warning':'bg-wine/8 text-wine';
  return <Link href={alert.href} className="panel flex items-start gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-soft"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone}`}><Icon size={18}/></div><div><p className="m-0 text-sm font-black text-graphite">{alert.title}</p><p className="mb-0 mt-1 text-xs leading-5 text-graphite/45">{alert.body}</p></div></Link>;
}
