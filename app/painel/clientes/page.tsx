import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, UsersRound } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { getBusinessContext, hasPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createCustomerAction } from '../actions';
import { money, shortDate } from '@/lib/format';

export default async function ClientesPage() {
  const context = await getBusinessContext(); if (!context) return null; if (!hasPermission(context, 'view_customers')) redirect('/painel?erro=' + encodeURIComponent('Seu perfil não pode acessar clientes.'));
  if (!context) return null;
  const supabase = await createClient();
  const [customersResult, metricsResult] = await Promise.all([
    supabase.from('customers').select('id,name,whatsapp,email,tags,created_at').eq('business_id', context.business.id).order('name'),
    supabase.from('customer_metrics').select('customer_id,order_count,revenue,average_ticket,last_order_at').eq('business_id', context.business.id)
  ]);
  const customers = customersResult.data ?? [];
  const metrics = new Map((metricsResult.data ?? []).map((metric) => [metric.customer_id, metric]));
  const canCreate = ['owner','manager','service'].includes(context.role);
  return <>
    <PageHeader eyebrow="Relacionamento" title="Clientes" description="Histórico, recorrência, ticket e preferências em uma ficha só." />
    <div className={`grid gap-5 ${canCreate ? 'xl:grid-cols-[1fr_360px]' : ''}`}>
      <section className="panel overflow-hidden">
        <div className="border-b border-wine/10 px-5 py-4"><p className="m-0 text-sm font-bold text-wine">{customers.length} clientes cadastrados</p></div>
        {customers.length === 0 ? <div className="p-8 text-center"><UsersRound className="mx-auto mb-3 text-wine/25"/><p className="font-bold text-wine">Sua lista ainda está vazia.</p><p className="text-sm text-graphite/50">Cadastre o primeiro cliente para começar o histórico.</p></div> : <div className="divide-y divide-wine/5">{customers.map((customer) => {
          const metric = metrics.get(customer.id);
          return <Link href={`/painel/clientes/${customer.id}`} key={customer.id} className="flex items-center gap-4 px-5 py-4 transition hover:bg-cream/40"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose/35 font-black text-wine">{customer.name.slice(0,1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="m-0 truncate text-sm font-bold text-graphite">{customer.name}</p><p className="m-0 mt-1 truncate text-xs text-graphite/45">{customer.whatsapp || customer.email || 'Sem contato informado'}</p>{(customer.tags ?? []).length > 0 && <div className="mt-2 flex flex-wrap gap-1">{(customer.tags as string[]).slice(0,3).map((tag) => <span key={tag} className="rounded-full bg-cream px-2 py-0.5 text-[8px] font-bold text-wine">{tag}</span>)}</div>}</div><div className="hidden text-right sm:block"><p className="m-0 text-xs font-black text-wine">{money(metric?.revenue ?? 0)}</p><p className="m-0 mt-1 text-[9px] text-graphite/35">{metric?.order_count ?? 0} pedidos{metric?.last_order_at ? ` · ${shortDate(metric.last_order_at)}` : ''}</p></div><ChevronRight size={16} className="shrink-0 text-wine/25"/></Link>;
        })}</div>}
      </section>
      {canCreate && <form action={createCustomerAction} className="panel h-fit p-5">
        <p className="eyebrow mb-1">Cadastro rápido</p><h2 className="mt-0 text-xl font-black text-wine">Novo cliente</h2>
        <div className="space-y-3"><input name="name" required placeholder="Nome" className="input"/><input name="whatsapp" placeholder="WhatsApp" className="input"/><input name="email" type="email" placeholder="E-mail" className="input"/><input name="birth_date" type="date" className="input"/><textarea name="notes" placeholder="Observações" className="input min-h-24 py-3"/></div>
        <button className="mt-4 h-11 w-full rounded-2xl bg-wine text-sm font-bold text-cream">Salvar cliente</button>
      </form>}
    </div>
  </>;
}
