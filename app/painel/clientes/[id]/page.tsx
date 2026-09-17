import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CalendarDays, Heart, MessageCircle, ShoppingBag, Star, WalletCards } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { getBusinessContext, hasPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, shortDate, shortDateTime } from '@/lib/format';
import { updateCustomerProfileAction } from './actions';

type Address = { street?: string; number?: string; complement?: string; neighborhood?: string; city?: string; state?: string; zip?: string };

export default async function ClienteDetalhePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const context = await getBusinessContext();
  if (!context) return null;
  if (!hasPermission(context, 'view_customers')) redirect('/painel?erro=' + encodeURIComponent('Seu perfil não pode acessar clientes.'));
  const supabase = await createClient();
  const [customerResult, metricsResult, ordersResult] = await Promise.all([
    supabase.from('customers').select('id,name,whatsapp,email,birth_date,address,notes,tags,restrictions,preferences,created_at').eq('business_id', context.business.id).eq('id', id).maybeSingle(),
    supabase.from('customer_metrics').select('order_count,revenue,average_ticket,last_order_at').eq('business_id', context.business.id).eq('customer_id', id).maybeSingle(),
    supabase.from('orders').select('id,order_number,status,total,scheduled_at,created_at,items:order_items(name_snapshot,quantity,total_price)').eq('business_id', context.business.id).eq('customer_id', id).order('created_at', { ascending: false }).limit(30)
  ]);
  const customer = customerResult.data;
  if (!customer) notFound();
  const metrics = metricsResult.data ?? { order_count: 0, revenue: 0, average_ticket: 0, last_order_at: null };
  const orders = ordersResult.data ?? [];
  const address = (customer.address && typeof customer.address === 'object' ? customer.address : {}) as Address;
  const favoriteCount = new Map<string, number>();
  for (const order of orders as any[]) {
    if (['canceled','refunded'].includes(order.status)) continue;
    for (const item of order.items ?? []) favoriteCount.set(item.name_snapshot, (favoriteCount.get(item.name_snapshot) ?? 0) + Number(item.quantity ?? 0));
  }
  const favorites = [...favoriteCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const canEdit = ['owner','manager','service'].includes(context.role);
  const ok = typeof query.ok === 'string' ? query.ok : null;
  const error = typeof query.erro === 'string' ? query.erro : null;

  return <>
    <PageHeader eyebrow="CRM" title={customer.name} description={`Cliente desde ${shortDate(customer.created_at)} · ${Number(metrics.order_count)} pedidos válidos`} />
    {(ok || error) && <div className={`mb-5 rounded-2xl px-4 py-3 text-xs font-bold ${error ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>{error || 'Dados do cliente atualizados.'}</div>}

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={ShoppingBag} label="Pedidos" value={String(metrics.order_count ?? 0)} />
      <Metric icon={WalletCards} label="Total comprado" value={money(metrics.revenue)} />
      <Metric icon={Star} label="Ticket médio" value={money(metrics.average_ticket)} />
      <Metric icon={CalendarDays} label="Último pedido" value={metrics.last_order_at ? shortDate(metrics.last_order_at) : '—'} />
    </div>

    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <section className="panel overflow-hidden">
          <div className="border-b border-wine/10 px-5 py-4"><p className="eyebrow mb-1">Histórico</p><h2 className="m-0 text-lg font-black text-wine">Encomendas</h2></div>
          {orders.length === 0 ? <div className="p-8 text-center text-xs text-graphite/40">Este cliente ainda não tem encomendas.</div> : <div className="divide-y divide-wine/5">{orders.map((order: any) => <Link href={`/painel/pedidos/${order.id}`} key={order.id} className="flex items-center gap-3 px-5 py-4 transition hover:bg-cream/40"><div className="min-w-0 flex-1"><p className="m-0 text-sm font-black text-graphite">Pedido #{order.order_number}</p><p className="m-0 mt-1 text-xs text-graphite/40">{shortDateTime(order.scheduled_at ?? order.created_at)} · {(order.items ?? []).slice(0, 2).map((item: any) => item.name_snapshot).join(', ') || 'Sem itens'}</p></div><StatusBadge status={order.status}/><strong className="shrink-0 text-sm text-wine">{money(order.total)}</strong></Link>)}</div>}
        </section>

        <section className="panel p-5"><div className="flex items-center gap-2"><Heart size={15} className="text-terracotta"/><p className="eyebrow m-0">Preferências</p></div><div className="mt-4 grid gap-4 md:grid-cols-2"><div><p className="m-0 text-xs font-black text-wine">Mais comprados</p>{favorites.length === 0 ? <p className="mb-0 mt-2 text-xs text-graphite/40">Ainda sem histórico suficiente.</p> : <div className="mt-2 flex flex-wrap gap-2">{favorites.map(([name, quantity]) => <span key={name} className="rounded-full bg-cream px-3 py-1.5 text-[10px] font-bold text-wine">{name} · {quantity}</span>)}</div>}</div><div><p className="m-0 text-xs font-black text-wine">Notas da confeitaria</p><p className="mb-0 mt-2 whitespace-pre-wrap text-xs leading-5 text-graphite/50">{customer.preferences || customer.notes || 'Nenhuma preferência registrada.'}</p></div></div></section>
      </div>

      <aside className="space-y-5">
        <section className="panel p-5">
          <p className="eyebrow mb-3">Contato</p>
          <div className="space-y-2 text-sm"><p className="m-0 font-bold text-graphite">{customer.whatsapp || 'WhatsApp não informado'}</p><p className="m-0 text-xs text-graphite/45">{customer.email || 'E-mail não informado'}</p>{customer.birth_date && <p className="m-0 text-xs text-graphite/45">Aniversário: {shortDate(customer.birth_date)}</p>}</div>
          {customer.whatsapp && <a href={`https://wa.me/${customer.whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="mt-4 flex h-10 items-center justify-center gap-2 rounded-2xl bg-success/10 text-xs font-bold text-success"><MessageCircle size={14}/> Abrir WhatsApp</a>}
          {(customer.tags ?? []).length > 0 && <div className="mt-4 flex flex-wrap gap-2">{(customer.tags as string[]).map((tag) => <span key={tag} className="rounded-full bg-rose/25 px-3 py-1 text-[9px] font-bold text-wine">{tag}</span>)}</div>}
        </section>

        {canEdit && <form action={updateCustomerProfileAction.bind(null, customer.id)} className="panel p-5"><p className="eyebrow mb-1">Ficha do cliente</p><h2 className="mt-0 text-lg font-black text-wine">Editar dados</h2><div className="space-y-3"><input required name="name" defaultValue={customer.name} className="input" placeholder="Nome"/><div className="grid grid-cols-2 gap-2"><input name="whatsapp" defaultValue={customer.whatsapp ?? ''} className="input" placeholder="WhatsApp"/><input name="email" type="email" defaultValue={customer.email ?? ''} className="input" placeholder="E-mail"/></div><input name="birth_date" type="date" defaultValue={customer.birth_date ?? ''} className="input"/><input name="tags" defaultValue={(customer.tags ?? []).join(', ')} className="input" placeholder="Tags separadas por vírgula"/><textarea name="restrictions" defaultValue={customer.restrictions ?? ''} className="input min-h-20 py-3" placeholder="Restrições, alergias, cuidados..."/><textarea name="preferences" defaultValue={customer.preferences ?? ''} className="input min-h-20 py-3" placeholder="Preferências do cliente"/><div className="grid grid-cols-2 gap-2"><input name="street" defaultValue={address.street ?? ''} className="input col-span-2" placeholder="Rua"/><input name="number" defaultValue={address.number ?? ''} className="input" placeholder="Número"/><input name="complement" defaultValue={address.complement ?? ''} className="input" placeholder="Complemento"/><input name="neighborhood" defaultValue={address.neighborhood ?? ''} className="input" placeholder="Bairro"/><input name="city" defaultValue={address.city ?? ''} className="input" placeholder="Cidade"/><input name="state" defaultValue={address.state ?? ''} className="input" placeholder="UF"/><input name="zip" defaultValue={address.zip ?? ''} className="input" placeholder="CEP"/></div><textarea name="notes" defaultValue={customer.notes ?? ''} className="input min-h-20 py-3" placeholder="Observações internas"/></div><button className="mt-4 h-11 w-full rounded-2xl bg-wine text-xs font-bold text-cream">Salvar ficha</button></form>}
      </aside>
    </div>
  </>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof ShoppingBag; label: string; value: string }) {
  return <div className="panel p-4"><div className="flex items-center gap-2 text-wine/45"><Icon size={14}/><span className="text-[9px] font-bold uppercase tracking-wider">{label}</span></div><p className="mb-0 mt-3 text-xl font-black text-wine">{value}</p></div>;
}
