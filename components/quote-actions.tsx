'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveQuoteAction, markQuoteSentAction, rejectQuoteAction } from '@/app/painel/orcamentos/actions';

export function QuoteActions({id,status}:{id:string;status:string}){
  const router=useRouter();
  const[pending,startTransition]=useTransition();
  const[error,setError]=useState('');
  const[success,setSuccess]=useState('');

  function run(fn:()=>Promise<any>,options?:{goOrder?:boolean;message?:string}){
    startTransition(async()=>{
      setError('');setSuccess('');
      const result=await fn();
      if(!result?.ok){setError(result?.error||'Falha na ação.');return;}
      if(options?.goOrder&&result.orderId){router.push(`/painel/pedidos/${result.orderId}`);return;}
      setSuccess(options?.message||'Atualizado.');
      router.refresh();
    });
  }

  return <div>
    <div className="flex flex-wrap gap-2">
      {status==='draft'&&<button disabled={pending} onClick={()=>run(()=>markQuoteSentAction(id),{message:'Marcado como enviado.'})} className="action-button border border-wine/10 bg-white text-wine">Marcar enviado</button>}
      {!['approved','rejected','expired'].includes(status)&&<button disabled={pending} onClick={()=>run(()=>approveQuoteAction(id),{goOrder:true})} className="action-button bg-wine text-cream">Aprovar → pedido</button>}
      {!['approved','rejected','expired'].includes(status)&&<button disabled={pending} onClick={()=>run(()=>rejectQuoteAction(id),{message:'Orçamento recusado.'})} className="action-button border border-danger/15 bg-white text-danger">Recusado</button>}
    </div>
    {success&&<p className="mb-0 mt-2 text-[10px] font-bold text-success">{success}</p>}
    {error&&<p className="mb-0 mt-2 text-[10px] font-bold text-danger">{error}</p>}
  </div>;
}
