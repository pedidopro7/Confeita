'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function markNotificationReadAction(id:string,_formData:FormData){
  const context=await getBusinessContext(); if(!context) redirect('/login');
  const supabase=await createClient();
  const {error}=await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('business_id',context.business.id).eq('id',id);
  if(error) redirect('/painel/notificacoes?erro='+encodeURIComponent(error.message));
  revalidatePath('/painel/notificacoes');
  redirect('/painel/notificacoes?ok=lido');
}

export async function markAllNotificationsReadAction(){
  const context=await getBusinessContext(); if(!context) redirect('/login');
  const supabase=await createClient();
  const {error}=await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('business_id',context.business.id).is('read_at',null);
  if(error) redirect('/painel/notificacoes?erro='+encodeURIComponent(error.message));
  revalidatePath('/painel/notificacoes');
  redirect('/painel/notificacoes?ok=lido');
}
