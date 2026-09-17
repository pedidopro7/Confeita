'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function text(value: FormDataEntryValue | null) {
  return String(value ?? '').trim();
}

export async function updateCustomerProfileAction(customerId: string, formData: FormData) {
  const context = await getBusinessContext();
  if (!context) redirect('/login');
  if (!['owner', 'manager', 'service'].includes(context.role)) redirect(`/painel/clientes/${customerId}?erro=${encodeURIComponent('Seu perfil não pode editar clientes.')}`);

  const tags = text(formData.get('tags')).split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20);
  const address = {
    street: text(formData.get('street')),
    number: text(formData.get('number')),
    complement: text(formData.get('complement')),
    neighborhood: text(formData.get('neighborhood')),
    city: text(formData.get('city')),
    state: text(formData.get('state')),
    zip: text(formData.get('zip'))
  };
  const supabase = await createClient();
  const { error } = await supabase.from('customers').update({
    name: text(formData.get('name')),
    whatsapp: text(formData.get('whatsapp')) || null,
    email: text(formData.get('email')) || null,
    birth_date: text(formData.get('birth_date')) || null,
    notes: text(formData.get('notes')) || null,
    restrictions: text(formData.get('restrictions')) || null,
    preferences: text(formData.get('preferences')) || null,
    tags,
    address
  }).eq('business_id', context.business.id).eq('id', customerId);

  if (error) redirect(`/painel/clientes/${customerId}?erro=${encodeURIComponent(error.message)}`);
  revalidatePath(`/painel/clientes/${customerId}`);
  revalidatePath('/painel/clientes');
  redirect(`/painel/clientes/${customerId}?ok=dados`);
}
