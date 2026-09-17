'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getBusinessContext, hasPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function applyInventoryCountAction(formData:FormData){
  const context=await getBusinessContext(); if(!context) redirect('/login');
  if(!hasPermission(context,'adjust_stock')) redirect('/painel/estoque?erro='+encodeURIComponent('Seu perfil não pode corrigir o estoque.'));
  const counts:Array<{inventory_item_id:string;counted:number}>=[];
  for(const [key,value] of formData.entries()){
    if(!key.startsWith('counted__')) continue;
    const id=key.slice('counted__'.length);
    const raw=String(value??'').trim().replace(',','.');
    if(!raw) continue;
    const counted=Number(raw);
    if(!id||!Number.isFinite(counted)||counted<0) redirect('/painel/estoque/inventario?erro='+encodeURIComponent('Revise as quantidades contadas.'));
    counts.push({inventory_item_id:id,counted});
  }
  if(!counts.length) redirect('/painel/estoque/inventario?erro='+encodeURIComponent('Informe pelo menos uma contagem.'));
  const supabase=await createClient();
  const {error}=await supabase.rpc('apply_inventory_count',{p_counts:counts,p_note:String(formData.get('note')||'Conferência de estoque').trim()||'Conferência de estoque'});
  if(error) redirect('/painel/estoque/inventario?erro='+encodeURIComponent(error.message));
  revalidatePath('/painel/estoque');
  revalidatePath('/painel/estoque/inventario');
  revalidatePath('/painel/compras/lista');
  revalidatePath('/painel');
  redirect('/painel/estoque?ok=inventario');
}
