import Link from 'next/link';
import { ClipboardCheck, PackageOpen } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { getBusinessContext, hasPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { numberPt } from '@/lib/format';
import { applyInventoryCountAction } from './actions';

export default async function InventarioPage(){
  const context=await getBusinessContext(); if(!context)return null;
  const canAdjust=hasPermission(context,'adjust_stock');
  const supabase=await createClient();
  const {data:stockRows}=await supabase.from('inventory_stock_summary').select('inventory_item_id,name,base_unit,on_hand,reserved,available').eq('business_id',context.business.id).order('name');
  const data=stockRows??[];
  return <><PageHeader eyebrow="Conferência física" title="Inventário" description="Informe quanto existe de verdade. A Confeita registra apenas a diferença como ajuste, preservando todo o histórico."/>
    {!canAdjust?<div className="panel p-8 text-center text-sm text-graphite/50">Seu perfil pode consultar o estoque, mas não pode fazer ajustes de inventário.</div>:data.length===0?<div className="panel p-10 text-center"><PackageOpen className="mx-auto mb-3 text-wine/20"/><p className="m-0 font-bold text-wine">Cadastre ingredientes antes de fazer a conferência.</p><Link href="/painel/estoque" className="mt-4 inline-flex rounded-2xl bg-wine px-4 py-2.5 text-xs font-bold text-cream">Ir para estoque</Link></div>:<form action={applyInventoryCountAction} className="space-y-5">
      <div className="rounded-3xl bg-wine p-5 text-cream"><div className="flex items-start gap-3"><ClipboardCheck className="mt-0.5 shrink-0"/><div><p className="m-0 text-sm font-black">Como funciona</p><p className="mb-0 mt-1 text-xs leading-5 text-cream/60">O valor atual não é apagado. Se o sistema tem 5 kg e você contar 4,8 kg, será criado um ajuste de -0,2 kg com data, usuário e motivo.</p></div></div></div>
      <section className="panel overflow-hidden"><div className="grid grid-cols-[1.3fr_.65fr_.75fr] gap-2 border-b border-wine/10 px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-graphite/40"><span>Item</span><span>Sistema</span><span>Contado</span></div>{data.map(item=><div key={item.inventory_item_id} className="grid grid-cols-[1.3fr_.65fr_.75fr] items-center gap-2 border-b border-wine/5 px-5 py-3 last:border-0"><div><p className="m-0 text-xs font-bold text-graphite">{item.name}</p><p className="m-0 mt-1 text-[9px] text-graphite/35">Reservado: {numberPt(item.reserved)} {item.base_unit}</p></div><span className="text-xs text-graphite/55">{numberPt(item.on_hand)} {item.base_unit}</span><div className="relative"><input name={`counted__${item.inventory_item_id}`} type="number" min="0" step="0.0001" defaultValue={Number(item.on_hand)} className="input pr-10"/><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-graphite/35">{item.base_unit}</span></div></div>)}</section>
      <div className="panel p-5"><label className="text-xs font-bold text-graphite/55">Motivo / observação<input name="note" defaultValue="Conferência de estoque" className="input mt-2"/></label><div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end"><Link href="/painel/estoque" className="action-button border border-wine/10 bg-white text-wine">Cancelar</Link><button className="action-button bg-wine text-cream">Confirmar conferência</button></div></div>
    </form>}
  </>;
}
