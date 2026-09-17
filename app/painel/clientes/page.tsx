import { PageHeader } from '@/components/page-header';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createCustomerAction } from '../actions';
import { UsersRound } from 'lucide-react';

export default async function ClientesPage() {
  const context = await getBusinessContext();
  if (!context) return null;
  const supabase = await createClient();
  const { data: customersData } = await supabase.from('customers').select('id,name,whatsapp,email,created_at').eq('business_id', context.business.id).order('name');
  const customers = customersData ?? [];
  return <>
    <PageHeader eyebrow="Relacionamento" title="Clientes" description="Histórico e dados dos clientes da sua confeitaria." />
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className="panel overflow-hidden">
        <div className="border-b border-wine/10 px-5 py-4"><p className="m-0 text-sm font-bold text-wine">{customers.length} clientes cadastrados</p></div>
        {customers.length === 0 ? <div className="p-8 text-center"><UsersRound className="mx-auto mb-3 text-wine/25"/><p className="font-bold text-wine">Sua lista ainda está vazia.</p><p className="text-sm text-graphite/50">Cadastre o primeiro cliente ao lado.</p></div> : <div className="divide-y divide-wine/5">{customers.map((c) => <div key={c.id} className="flex items-center gap-4 px-5 py-4"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose/35 font-black text-wine">{c.name.slice(0,1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="m-0 truncate text-sm font-bold text-graphite">{c.name}</p><p className="m-0 mt-1 text-xs text-graphite/45">{c.whatsapp || c.email || 'Sem contato informado'}</p></div></div>)}</div>}
      </section>
      <form action={createCustomerAction} className="panel h-fit p-5">
        <p className="eyebrow mb-1">Cadastro rápido</p><h2 className="mt-0 text-xl font-black text-wine">Novo cliente</h2>
        <div className="space-y-3"><input name="name" required placeholder="Nome" className="input"/><input name="whatsapp" placeholder="WhatsApp" className="input"/><input name="email" type="email" placeholder="E-mail" className="input"/><input name="birth_date" type="date" className="input"/><textarea name="notes" placeholder="Observações" className="input min-h-24 py-3"/></div>
        <button className="mt-4 h-11 w-full rounded-2xl bg-wine text-sm font-bold text-cream">Salvar cliente</button>
      </form>
    </div>
  </>;
}
