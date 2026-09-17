'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getBusinessContext, hasPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function text(value: FormDataEntryValue | null) {
  return String(value ?? '').trim();
}

function num(value: FormDataEntryValue | null) {
  const parsed = Number(text(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function message(error: string) {
  if (error.includes('payment_exceeds_balance')) return 'O valor informado é maior que o saldo do pedido.';
  if (error.includes('invalid_payment_amount')) return 'Informe um valor de pagamento válido.';
  if (error.includes('order_does_not_accept_payment')) return 'Este pedido não aceita novos pagamentos.';
  if (error.includes('order_not_found_or_forbidden')) return 'Você não tem permissão para registrar este pagamento.';
  return error;
}

export async function recordOrderPaymentAction(orderId: string, formData: FormData) {
  const context = await getBusinessContext();
  if (!context) redirect('/login');
  if (!(hasPermission(context, 'manage_finance') || hasPermission(context, 'manage_orders'))) redirect('/painel');
  const amount = num(formData.get('amount'));
  const method = text(formData.get('method'));
  const key = text(formData.get('idempotency_key'));
  const supabase = await createClient();

  const { error } = await supabase.rpc('record_order_payment', {
    p_order_id: orderId,
    p_amount: amount,
    p_method: method,
    p_notes: text(formData.get('notes')) || null,
    p_idempotency_key: key || null
  });

  if (error) redirect(`/painel/pedidos/${orderId}?erro_pagamento=${encodeURIComponent(message(error.message))}`);
  revalidatePath(`/painel/pedidos/${orderId}`);
  revalidatePath('/painel');
  revalidatePath('/painel/financeiro');
  revalidatePath('/painel/agenda');
  revalidatePath('/painel/estoque');
  redirect(`/painel/pedidos/${orderId}?ok=pagamento`);
}

export async function refundOrderPaymentAction(orderId: string, paymentId: string, _formData: FormData) {
  const context = await getBusinessContext();
  if (!context) redirect('/login');
  if (!hasPermission(context, 'manage_finance')) redirect('/painel');
  const supabase = await createClient();
  const { error } = await supabase.rpc('refund_order_payment', { p_payment_id: paymentId });
  if (error) redirect(`/painel/pedidos/${orderId}?erro_pagamento=${encodeURIComponent(message(error.message))}`);
  revalidatePath(`/painel/pedidos/${orderId}`);
  revalidatePath('/painel');
  revalidatePath('/painel/financeiro');
  redirect(`/painel/pedidos/${orderId}?ok=estorno`);
}
