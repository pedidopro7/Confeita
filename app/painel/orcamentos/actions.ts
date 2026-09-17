'use server';

import { revalidatePath } from 'next/cache';
import { getBusinessContext, hasPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export type QuoteInput={
  customerId?:string|null;
  desiredAt?:string|null;
  notes?:string;
  deliveryFee?:number;
  discount?:number;
  fulfillmentType?:'pickup'|'delivery';
  depositRequired?:number;
  items:Array<{productId:string;variantId?:string|null;name:string;quantity:number;unitPrice:number;configuration?:Record<string,unknown>}>;
};

function canManage(context:NonNullable<Awaited<ReturnType<typeof getBusinessContext>>>){
  return hasPermission(context,'manage_quotes');
}

export async function createQuoteAction(input:QuoteInput){
  const context=await getBusinessContext();
  if(!context)return{ok:false,error:'Confeitaria não encontrada.'};
  if(!canManage(context))return{ok:false,error:'Seu perfil não pode criar orçamentos.'};
  if(!input.items?.length)return{ok:false,error:'Adicione pelo menos um item.'};
  if(input.items.some(item=>!item.productId||Number(item.quantity)<=0||Number(item.unitPrice)<0))return{ok:false,error:'Revise os itens do orçamento.'};

  const supabase=await createClient();
  const subtotal=input.items.reduce((s,i)=>s+Number(i.quantity)*Number(i.unitPrice),0);
  const discount=Math.max(Number(input.discount||0),0);
  const fulfillmentType=input.fulfillmentType==='delivery'?'delivery':'pickup';
  const deliveryFee=fulfillmentType==='delivery'?Math.max(Number(input.deliveryFee||0),0):0;
  const total=Math.max(subtotal-discount+deliveryFee,0);
  const depositRequired=Math.min(Math.max(Number(input.depositRequired||0),0),total);

  const {data:quote,error}=await supabase.from('quotes').insert({
    business_id:context.business.id,
    customer_id:input.customerId||null,
    status:'draft',
    desired_at:input.desiredAt?new Date(input.desiredAt).toISOString():null,
    subtotal,discount,delivery_fee:deliveryFee,total,
    fulfillment_type:fulfillmentType,
    deposit_required:depositRequired,
    notes:input.notes?.trim()||null,
    expires_at:new Date(Date.now()+7*86400000).toISOString()
  }).select('id').single();

  if(error||!quote)return{ok:false,error:error?.message||'Falha ao criar orçamento.'};

  const {error:itemError}=await supabase.from('quote_items').insert(input.items.map(i=>({
    business_id:context.business.id,
    quote_id:quote.id,
    product_id:i.productId,
    product_variant_id:i.variantId||null,
    name_snapshot:i.name,
    quantity:Number(i.quantity),
    unit_price:Number(i.unitPrice),
    total_price:Number(i.quantity)*Number(i.unitPrice),
    configuration:i.configuration||{}
  })));
  if(itemError){
    await supabase.from('quotes').delete().eq('business_id',context.business.id).eq('id',quote.id);
    return{ok:false,error:itemError.message};
  }

  revalidatePath('/painel/orcamentos');
  return{ok:true,quoteId:quote.id};
}

export async function markQuoteSentAction(id:string){
  const context=await getBusinessContext();
  if(!context)return{ok:false,error:'Sessão expirada.'};
  if(!canManage(context))return{ok:false,error:'Seu perfil não pode alterar orçamentos.'};
  const supabase=await createClient();
  const{error}=await supabase.from('quotes').update({status:'sent'}).eq('business_id',context.business.id).eq('id',id).eq('status','draft');
  if(error)return{ok:false,error:error.message};
  revalidatePath('/painel/orcamentos');
  revalidatePath(`/painel/orcamentos/${id}`);
  return{ok:true};
}

export async function rejectQuoteAction(id:string){
  const context=await getBusinessContext();
  if(!context)return{ok:false,error:'Sessão expirada.'};
  if(!canManage(context))return{ok:false,error:'Seu perfil não pode alterar orçamentos.'};
  const supabase=await createClient();
  const {data:quote}=await supabase.from('quotes').select('status').eq('business_id',context.business.id).eq('id',id).maybeSingle();
  if(!quote)return{ok:false,error:'Orçamento não encontrado.'};
  if(['approved','expired'].includes(quote.status))return{ok:false,error:'Este orçamento não pode ser recusado neste status.'};
  const{error}=await supabase.from('quotes').update({status:'rejected'}).eq('business_id',context.business.id).eq('id',id);
  if(error)return{ok:false,error:error.message};
  revalidatePath('/painel/orcamentos');
  revalidatePath(`/painel/orcamentos/${id}`);
  return{ok:true};
}

export async function approveQuoteAction(id:string){
  const context=await getBusinessContext();
  if(!context)return{ok:false,error:'Confeitaria não encontrada.'};
  if(!canManage(context))return{ok:false,error:'Seu perfil não pode aprovar orçamentos.'};
  const supabase=await createClient();

  const {data:existing}=await supabase.from('orders').select('id').eq('business_id',context.business.id).eq('quote_id',id).maybeSingle();
  if(existing?.id){
    await supabase.from('quotes').update({status:'approved'}).eq('business_id',context.business.id).eq('id',id);
    return{ok:true,orderId:existing.id};
  }

  const [{data:quote},{data:items=[]}]=await Promise.all([
    supabase.from('quotes').select('*').eq('business_id',context.business.id).eq('id',id).single(),
    supabase.from('quote_items').select('*').eq('business_id',context.business.id).eq('quote_id',id)
  ]);
  if(!quote)return{ok:false,error:'Orçamento não encontrado.'};
  if(['rejected','expired'].includes(quote.status))return{ok:false,error:'Este orçamento não pode ser convertido.'};
  if(!(items??[]).length)return{ok:false,error:'O orçamento não possui itens.'};

  const {data:order,error}=await supabase.from('orders').insert({
    business_id:context.business.id,
    customer_id:quote.customer_id,
    quote_id:id,
    status:'draft',
    fulfillment_type:quote.fulfillment_type||'pickup',
    scheduled_at:quote.desired_at,
    subtotal:quote.subtotal,
    discount:quote.discount,
    delivery_fee:quote.delivery_fee,
    total:quote.total,
    deposit_required:Number(quote.deposit_required||0),
    notes:quote.notes
  }).select('id').single();
  if(error||!order)return{ok:false,error:error?.message||'Falha ao converter.'};

  const productIds=(items??[]).map((i:any)=>i.product_id).filter(Boolean);
  const {data:recipes=[]}=await supabase.from('recipes').select('product_id,product_variant_id,active_version_id').eq('business_id',context.business.id).in('product_id',productIds.length?productIds:['00000000-0000-0000-0000-000000000000']).eq('is_complete',true);
  const versionFor=(item:any)=>{
    const exact=(recipes??[]).find(r=>r.product_id===item.product_id&&r.product_variant_id===item.product_variant_id);
    const base=(recipes??[]).find(r=>r.product_id===item.product_id&&!r.product_variant_id);
    return exact?.active_version_id||base?.active_version_id||null;
  };

  const{error:orderItemsError}=await supabase.from('order_items').insert((items??[]).map((i:any)=>({
    business_id:context.business.id,
    order_id:order.id,
    product_id:i.product_id,
    product_variant_id:i.product_variant_id,
    name_snapshot:i.name_snapshot,
    quantity:i.quantity,
    unit_price:i.unit_price,
    total_price:i.total_price,
    configuration:i.configuration||{},
    recipe_version_id:versionFor(i)
  })));

  if(orderItemsError){
    await supabase.from('orders').delete().eq('business_id',context.business.id).eq('id',order.id);
    return{ok:false,error:orderItemsError.message};
  }

  const {error:statusError}=await supabase.from('quotes').update({status:'approved'}).eq('business_id',context.business.id).eq('id',id);
  if(statusError)return{ok:false,error:statusError.message};

  revalidatePath('/painel/orcamentos');
  revalidatePath(`/painel/orcamentos/${id}`);
  revalidatePath('/painel/pedidos');
  revalidatePath('/painel/agenda');
  return{ok:true,orderId:order.id};
}
