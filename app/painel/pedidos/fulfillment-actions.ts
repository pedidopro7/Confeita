'use server';

import { revalidatePath } from 'next/cache';
import { getBusinessContext, hasPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function friendly(message:string){
  if(message.includes('order_not_found_or_forbidden')) return 'Pedido não encontrado ou sem permissão.';
  if(message.includes('order_is_not_delivery')) return 'Este pedido foi configurado para retirada.';
  if(message.includes('order_is_not_ready')) return 'O pedido precisa estar pronto antes de sair para entrega.';
  if(message.includes('delivery_must_be_out_for_delivery_before_completion')) return 'Marque primeiro que o pedido saiu para entrega.';
  if(message.includes('pickup_order_is_not_ready')) return 'O pedido precisa estar pronto antes de concluir a retirada.';
  return message;
}

export async function markOutForDeliveryAction(orderId:string){
  const context=await getBusinessContext();
  if(!context) return {ok:false,error:'Sessão expirada.'} as const;
  if(!hasPermission(context,'manage_orders')) return {ok:false,error:'Seu perfil não pode alterar a entrega.'} as const;
  const supabase=await createClient();
  const {data,error}=await supabase.rpc('mark_order_out_for_delivery',{p_order_id:orderId});
  if(error) return {ok:false,error:friendly(error.message)} as const;
  revalidatePath('/painel');
  revalidatePath('/painel/pedidos');
  revalidatePath('/painel/agenda');
  revalidatePath('/painel/producao');
  return {ok:true,result:data} as const;
}

export async function completeOrderFulfillmentAction(orderId:string){
  const context=await getBusinessContext();
  if(!context) return {ok:false,error:'Sessão expirada.'} as const;
  if(!hasPermission(context,'manage_orders')) return {ok:false,error:'Seu perfil não pode concluir pedidos.'} as const;
  const supabase=await createClient();
  const {data,error}=await supabase.rpc('complete_order_fulfillment',{p_order_id:orderId});
  if(error) return {ok:false,error:friendly(error.message)} as const;
  revalidatePath('/painel');
  revalidatePath('/painel/pedidos');
  revalidatePath('/painel/agenda');
  revalidatePath('/painel/producao');
  revalidatePath('/painel/financeiro');
  return {ok:true,result:data} as const;
}
