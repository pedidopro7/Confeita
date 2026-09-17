'use client';

import { CheckCircle2, X, AlertTriangle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

const successMessages: Record<string,string> = {
  cliente: 'Cliente salvo com sucesso.',
  produto: 'Produto salvo com sucesso.',
  dados: 'Alterações salvas com sucesso.',
  item: 'Item cadastrado no estoque.',
  perda: 'Perda registrada e estoque atualizado.',
  fornecedor: 'Fornecedor salvo com sucesso.',
  compra: 'Compra registrada e estoque atualizado.',
  despesa: 'Despesa registrada e financeiro atualizado.',
  convite: 'Convite criado com sucesso.',
  acesso: 'Acesso da equipe atualizado.',
  revogado: 'Convite revogado.',
  pagamento: 'Pagamento registrado e financeiro atualizado.',
  estorno: 'Pagamento estornado e financeiro atualizado.',
  margem: 'Margem-alvo atualizada.',
  preco: 'Preço atualizado.',
  variante: 'Variante adicionada.',
  grupo: 'Grupo de opções criado.',
  opcao: 'Opção adicionada.',
  inventario: 'Conferência concluída e diferenças ajustadas.',
  orcamento: 'Orçamento salvo com sucesso.',
  enviado: 'Orçamento marcado como enviado.',
  recusado: 'Orçamento marcado como recusado.',
  lido: 'Aviso marcado como lido.'
};

export function GlobalFeedback(){
  const params=useSearchParams();
  const error=params.get('erro')||params.get('erro_pagamento');
  const ok=params.get('ok');
  const message=error || (ok ? successMessages[ok] || 'Ação concluída com sucesso.' : '');
  const key=`${ok||''}|${error||''}`;
  const [dismissed,setDismissed]=useState<string|null>(null);
  if(!message || dismissed===key) return null;
  const danger=Boolean(error);
  return <div role={danger?'alert':'status'} className={`fixed right-4 top-20 z-[70] flex w-[calc(100%-32px)] max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur md:top-5 ${danger?'border-danger/15 bg-white text-danger':'border-success/15 bg-white text-success'}`}>
    {danger?<AlertTriangle className="mt-0.5 shrink-0" size={17}/>:<CheckCircle2 className="mt-0.5 shrink-0" size={17}/>}
    <p className="m-0 flex-1 text-xs font-bold leading-5">{message}</p>
    <button type="button" onClick={()=>setDismissed(key)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-black/5" aria-label="Fechar aviso"><X size={14}/></button>
  </div>;
}
