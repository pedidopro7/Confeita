import Link from 'next/link';
import type { ReactNode } from 'react';
import { ClipboardList, Cookie, LockKeyhole, PackageOpen, Search, UsersRound } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, shortDateTime } from '@/lib/format';

export default async function BuscaPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const context=await getBusinessContext(); if(!context) return null;
  const params=await searchParams;
  const q=(typeof params.q==='string'?params.q:'').trim();
  const supabase=await createClient();
  const canCustomers=['owner','manager','service'].includes(context.role);
  const canProducts=['owner','manager'].includes(context.role);
  const canInventory=['owner','manager','stock','production'].includes(context.role);
  const canRecipes=context.role==='owner';
  const numeric=/^\d+$/.test(q)?Number(q):null;

  const empty={data:[] as any[]};
  const [customersResult,productsResult,inventoryResult,recipesResult,ordersResult]=q.length>=2?await Promise.all([
    canCustomers?supabase.from('customers').select('id,name,whatsapp,email').eq('business_id',context.business.id).ilike('name',`%${q}%`).limit(8):Promise.resolve(empty),
    canProducts?supabase.from('products').select('id,name,base_price,product_type').eq('business_id',context.business.id).ilike('name',`%${q}%`).limit(8):Promise.resolve(empty),
    canInventory?supabase.from('inventory_items').select('id,name,base_unit,item_type').eq('business_id',context.business.id).ilike('name',`%${q}%`).limit(8):Promise.resolve(empty),
    canRecipes?supabase.from('recipes').select('id,name,is_complete').eq('business_id',context.business.id).ilike('name',`%${q}%`).limit(8):Promise.resolve(empty),
    numeric!==null?supabase.from('orders').select('id,order_number,total,status,scheduled_at,customer:customers(name)').eq('business_id',context.business.id).eq('order_number',numeric).limit(8):Promise.resolve(empty)
  ]):[empty,empty,empty,empty,empty];

  const groups:Array<{label:string;icon:any;rows:any[];render:(row:any)=>ReactNode}>=[
    {label:'Clientes',icon:UsersRound,rows:customersResult.data??[],render:(row:any)=><Result key={row.id} href={`/painel/clientes/${row.id}`} title={row.name} detail={row.whatsapp||row.email||'Sem contato'}/>},
    {label:'Pedidos',icon:ClipboardList,rows:ordersResult.data??[],render:(row:any)=>{const customer=Array.isArray(row.customer)?row.customer[0]:row.customer;return <Result key={row.id} href={`/painel/pedidos/${row.id}`} title={`Pedido #${row.order_number} · ${customer?.name||'Sem cliente'}`} detail={`${shortDateTime(row.scheduled_at)} · ${money(row.total)}`}/>}},
    {label:'Produtos',icon:Cookie,rows:productsResult.data??[],render:(row:any)=><Result key={row.id} href={`/painel/produtos/${row.id}`} title={row.name} detail={`${row.product_type} · ${money(row.base_price)}`}/>},
    {label:'Estoque',icon:PackageOpen,rows:inventoryResult.data??[],render:(row:any)=><Result key={row.id} href="/painel/estoque" title={row.name} detail={`${row.item_type} · unidade ${row.base_unit}`}/>},
    {label:'Cofre',icon:LockKeyhole,rows:recipesResult.data??[],render:(row:any)=><Result key={row.id} href={`/painel/cofre/${row.id}`} title={row.name} detail={row.is_complete?'Fórmula protegida':'Fórmula incompleta'}/>}
  ].filter(group=>group.rows.length>0);
  const count=groups.reduce((sum,group)=>sum+group.rows.length,0);

  return <><PageHeader eyebrow="Atalho" title="Busca global" description="Encontre cliente, pedido, produto, ingrediente ou fórmula sem navegar por várias telas."/>
    <form action="/painel/busca" method="get" className="panel mb-5 flex gap-2 p-3">
      <div className="relative flex-1"><Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-wine/35"/><input autoFocus name="q" defaultValue={q} placeholder="Digite um nome ou número de pedido..." className="input pl-11"/></div>
      <button className="h-11 rounded-2xl bg-wine px-5 text-xs font-bold text-cream">Buscar</button>
    </form>
    {q.length<2?<div className="panel p-10 text-center text-sm text-graphite/45">Digite pelo menos 2 caracteres. Para pedidos, você também pode digitar o número exato.</div>:count===0?<div className="panel p-10 text-center text-sm text-graphite/45">Nenhum resultado encontrado para <strong className="text-wine">{q}</strong>.</div>:<div className="grid gap-5 lg:grid-cols-2">{groups.map(group=>{const Icon=group.icon;return <section key={group.label} className="panel overflow-hidden"><div className="flex items-center gap-2 border-b border-wine/10 px-5 py-4"><Icon size={15} className="text-wine"/><p className="m-0 text-sm font-black text-wine">{group.label}</p><span className="ml-auto rounded-full bg-cream px-2.5 py-1 text-[9px] font-bold text-wine">{group.rows.length}</span></div><div className="divide-y divide-wine/5">{group.rows.map(group.render)}</div></section>})}</div>}
  </>;
}

function Result({href,title,detail}:{href:string;title:string;detail:string}){
  return <Link href={href} className="block px-5 py-4 transition hover:bg-cream/45"><p className="m-0 text-sm font-bold text-graphite">{title}</p><p className="m-0 mt-1 text-xs text-graphite/40">{detail}</p></Link>;
}
