'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createQuoteAction } from '@/app/painel/orcamentos/actions';
import { money } from '@/lib/format';
import { Minus, Plus, Trash2 } from 'lucide-react';

type C={id:string;name:string};
type V={id:string;name:string;price:number|string};
type P={id:string;name:string;base_price:number|string;variants:V[]};
type R={key:string;productId:string;variantId?:string|null;name:string;quantity:number;unitPrice:number};

export function QuoteBuilder({customers,products}:{customers:C[];products:P[]}){
  const router=useRouter();
  const[pending,startTransition]=useTransition();
  const[customerId,setCustomerId]=useState('');
  const[desiredAt,setDesiredAt]=useState('');
  const[fulfillment,setFulfillment]=useState<'pickup'|'delivery'>('pickup');
  const[rows,setRows]=useState<R[]>([]);
  const[productId,setProductId]=useState('');
  const[variantId,setVariantId]=useState('');
  const[deliveryFee,setDeliveryFee]=useState(0);
  const[discount,setDiscount]=useState(0);
  const[notes,setNotes]=useState('');
  const[depositMode,setDepositMode]=useState<'none'|'percent'|'fixed'>('percent');
  const[depositValue,setDepositValue]=useState(50);
  const[error,setError]=useState('');

  const selected=products.find(p=>p.id===productId);
  const subtotal=useMemo(()=>rows.reduce((s,r)=>s+r.quantity*r.unitPrice,0),[rows]);
  const total=Math.max(subtotal+deliveryFee-discount,0);
  const depositRequired=depositMode==='none'?0:depositMode==='percent'?Math.min(total,Math.max(total*(depositValue/100),0)):Math.min(total,Math.max(depositValue,0));

  function add(){
    if(!selected)return;
    const variant=selected.variants.find(v=>v.id===variantId);
    const key=`${selected.id}:${variant?.id||'base'}`;
    const name=variant?`${selected.name} · ${variant.name}`:selected.name;
    const price=Number(variant?.price??selected.base_price);
    setRows(current=>{
      const found=current.find(row=>row.key===key);
      return found?current.map(row=>row.key===key?{...row,quantity:row.quantity+1}:row):[...current,{key,productId:selected.id,variantId:variant?.id||null,name,quantity:1,unitPrice:price}];
    });
  }

  function save(){
    setError('');
    startTransition(async()=>{
      const result=await createQuoteAction({
        customerId:customerId||null,desiredAt:desiredAt||null,deliveryFee,discount,notes,
        fulfillmentType:fulfillment,depositRequired,
        items:rows.map(({key,...row})=>row)
      });
      if(!result.ok){setError(result.error||'Falha ao salvar.');return;}
      router.push(`/painel/orcamentos/${result.quoteId}?ok=orcamento`);
      router.refresh();
    });
  }

  return <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
    <div className="space-y-5">
      <section className="panel p-5"><p className="eyebrow">Cliente e data</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><select className="input" value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Cliente não informado</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><input type="datetime-local" className="input" value={desiredAt} onChange={e=>setDesiredAt(e.target.value)}/></div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setFulfillment('pickup')} className={`h-11 rounded-2xl text-xs font-bold ${fulfillment==='pickup'?'bg-wine text-cream':'border border-wine/10 bg-white text-wine'}`}>Retirada</button><button type="button" onClick={()=>setFulfillment('delivery')} className={`h-11 rounded-2xl text-xs font-bold ${fulfillment==='delivery'?'bg-wine text-cream':'border border-wine/10 bg-white text-wine'}`}>Entrega</button></div></section>

      <section className="panel p-5"><p className="eyebrow">Itens</p><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><select className="input" value={productId} onChange={e=>{setProductId(e.target.value);setVariantId('')}}><option value="">Escolha um produto</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.base_price)}</option>)}</select><select className="input" value={variantId} onChange={e=>setVariantId(e.target.value)} disabled={!selected?.variants.length}><option value="">{selected?.variants.length?'Preço base / sem tamanho':'Sem variações'}</option>{selected?.variants.map(v=><option key={v.id} value={v.id}>{v.name} · {money(v.price)}</option>)}</select><button type="button" disabled={!selected} onClick={add} className="rounded-2xl bg-wine px-4 text-xs font-bold text-cream disabled:opacity-40">Adicionar</button></div>
        <div className="mt-4 space-y-2">{rows.length===0?<div className="rounded-2xl bg-cream/55 p-7 text-center text-xs text-graphite/40">Adicione os produtos que farão parte da proposta.</div>:rows.map(row=><div key={row.key} className="rounded-2xl bg-cream/65 p-3"><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="m-0 truncate text-sm font-bold">{row.name}</p><div className="mt-2 flex items-center gap-2"><span className="text-[10px] text-graphite/40">Preço unitário</span><input aria-label="Preço unitário" className="h-8 w-28 rounded-xl border border-wine/10 bg-white px-2 text-xs" type="number" step="0.01" min="0" value={row.unitPrice} onChange={e=>setRows(current=>current.map(item=>item.key===row.key?{...item,unitPrice:Math.max(Number(e.target.value),0)}:item))}/></div></div><button type="button" className="mini-button" onClick={()=>setRows(v=>v.map(x=>x.key===row.key?{...x,quantity:Math.max(1,x.quantity-1)}:x))}><Minus size={13}/></button><span className="min-w-5 text-center text-xs font-bold">{row.quantity}</span><button type="button" className="mini-button" onClick={()=>setRows(v=>v.map(x=>x.key===row.key?{...x,quantity:x.quantity+1}:x))}><Plus size={13}/></button><button type="button" className="mini-button text-danger" onClick={()=>setRows(v=>v.filter(x=>x.key!==row.key))}><Trash2 size={13}/></button></div><div className="mt-2 text-right text-xs font-black text-wine">{money(row.quantity*row.unitPrice)}</div></div>)}</div>
      </section>

      <section className="panel p-5"><p className="eyebrow">Detalhes</p><textarea className="input mt-3 min-h-28 py-3" placeholder="Personalização, tema, cores, topo, referências, observações..." value={notes} onChange={e=>setNotes(e.target.value)}/></section>
    </div>

    <aside className="panel h-fit p-5 xl:sticky xl:top-8"><p className="eyebrow">Resumo</p><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>{fulfillment==='delivery'&&<label className="flex items-center justify-between gap-3"><span>Entrega</span><input className="w-24 rounded-xl border border-wine/10 px-2 py-1 text-right" type="number" step=".01" min="0" value={deliveryFee} onChange={e=>setDeliveryFee(Math.max(Number(e.target.value),0))}/></label>}<label className="flex items-center justify-between gap-3"><span>Desconto</span><input className="w-24 rounded-xl border border-wine/10 px-2 py-1 text-right" type="number" step=".01" min="0" value={discount} onChange={e=>setDiscount(Math.max(Number(e.target.value),0))}/></label></div>
      <div className="mt-4 border-t border-wine/10 pt-4"><p className="m-0 text-xs text-graphite/40">Total</p><p className="m-0 mt-1 text-3xl font-black text-wine">{money(total)}</p></div>
      <div className="mt-5 border-t border-wine/10 pt-4"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-graphite/40">Reserva da data</p><select className="input" value={depositMode} onChange={e=>setDepositMode(e.target.value as 'none'|'percent'|'fixed')}><option value="none">Sem sinal</option><option value="percent">Percentual</option><option value="fixed">Valor fixo</option></select>{depositMode!=='none'&&<div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2"><input type="number" min="0" max={depositMode==='percent'?100:undefined} step={depositMode==='percent'?1:.01} className="input" value={depositValue} onChange={e=>setDepositValue(Math.max(Number(e.target.value),0))}/><span className="text-xs font-bold text-wine">{depositMode==='percent'?'%':'R$'}</span></div>}<p className="mb-0 mt-2 text-xs font-black text-wine">Sinal: {money(depositRequired)}</p></div>
      {error&&<p className="rounded-2xl bg-danger/10 p-3 text-xs font-bold text-danger">{error}</p>}<button disabled={pending||rows.length===0} onClick={save} className="mt-4 h-12 w-full rounded-2xl bg-wine text-sm font-bold text-cream disabled:opacity-40">{pending?'Salvando...':'Salvar orçamento'}</button>
    </aside>
  </div>;
}
