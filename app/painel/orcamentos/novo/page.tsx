import { PageHeader } from '@/components/page-header';
import { QuoteBuilder } from '@/components/quote-builder';
import { getBusinessContext, hasPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function NovoOrcamentoPage(){
  const context=await getBusinessContext(); if(!context)return null;
  if(!hasPermission(context,'manage_quotes')) redirect('/painel');
  const supabase=await createClient();
  const [customersResult,productsResult,variantsResult]=await Promise.all([
    supabase.from('customers').select('id,name').eq('business_id',context.business.id).order('name'),
    supabase.from('products').select('id,name,base_price').eq('business_id',context.business.id).eq('active',true).order('name'),
    supabase.from('product_variants').select('id,product_id,name,price').eq('business_id',context.business.id).eq('active',true).order('name')
  ]);
  const customers=customersResult.data??[];
  const variants=variantsResult.data??[];
  const products=(productsResult.data??[]).map(product=>({...product,variants:variants.filter(variant=>variant.product_id===product.id)}));
  return <><PageHeader eyebrow="Proposta" title="Novo orçamento" description="Monte a proposta, defina retirada ou entrega e escolha o sinal antes de enviar ao cliente."/><QuoteBuilder customers={customers} products={products}/></>;
}
