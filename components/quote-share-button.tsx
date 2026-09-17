'use client';

import { Check, Copy, Share2 } from 'lucide-react';
import { useState } from 'react';

export function QuoteShareButton({text}:{text:string}){
  const[copied,setCopied]=useState(false);
  async function share(){
    try{
      if(typeof navigator!=='undefined'&&navigator.share){
        await navigator.share({title:'Orçamento Confeita',text});
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(()=>setCopied(false),1800);
    }catch{
      try{
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(()=>setCopied(false),1800);
      }catch{}
    }
  }
  return <button type="button" onClick={share} className="action-button border border-wine/10 bg-white text-wine">{copied?<><Check size={14}/>Copiado</>:<><Share2 size={14}/><span className="ml-1">Compartilhar / copiar</span></>}</button>;
}
