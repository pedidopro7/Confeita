import Link from 'next/link';
import { CalendarDays, ChevronRight, CircleDollarSign, LockKeyhole, PackageOpen, ShoppingBasket, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, timeOnly, numberPt } from '@/lib/format';
import { StatusBadge } from '@/components/status-badge';

function brazilDayRange() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  return { start: `${day}T00:00:00-03:00`, end: `${day}T23:59:59.999-03:00`, label: day };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getBusinessContext();
  if (!context) return null;
  const supabase = await createClient();
  const businessId = context.business.id;
  const { start, end } = brazilDayRange();

  const [ordersResult, productionResult, stockResult, recipesResult, productsCountResult, stockCountResult, paidResult] = await Promise.all([
    supabase.from('orders').select('id,order_number,status,scheduled_at,total,customer:customers(name)').eq('business_id', businessId).gte('scheduled_at', start).lte('scheduled_at', end).neq('status', 'canceled').order('scheduled_at').limit(8),
    supabase.from('production_orders').select('id,status,planned_qty').eq('business_id', businessId).in('status', ['todo','in_progress']),
    supabase.from('inventory_stock_summary').select('inventory_item_id,name,base_unit,min_stock,on_hand,reserved,available').eq('business_id', businessId).order('available').limit(8),
    supabase.from('recipes').select('id,is_complete').eq('business_id', businessId),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('active', true),
    supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('active', true),
    supabase.from('order_payments').select('amount').eq('business_id', businessId).eq('status', 'paid')
  ]);

  const orders = ordersResult.data ?? [];
  const production = productionResult.data ?? [];
  const stock = (stockResult.data ?? []).map((item) => ({ ...item, available: Number(item.available ?? 0), min_stock: Number(item.min_stock ?? 0) }));
  const lowStock = stock.filter((item) => item.available <= item.min_stock).slice(0, 4);
  const recipes = recipesResult.data ?? [];
  const completeRecipes = recipes.filter((recipe) => recipe.is_complete).length;
  const pendingProduction = production.reduce((sum, item) => sum + Number(item.planned_qty ?? 0), 0);
  const paidTotal = (paidResult.data ?? []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

  const { data: openOrders } = await supabase
    .from('orders')
    .select('total')
    .eq('business_id', businessId)
    .in('status', ['awaiting_deposit','confirmed','production','ready','out_for_delivery']);
  const openOrderTotal = (openOrders ?? []).reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const receivable = Math.max(0, openOrderTotal - paidTotal);

  const userName = context.user.fullName?.split(' ')[0] || 'Confeiteira';
  const formatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo' });
  const dateLabel = formatter.format(new Date());
  const firstAccess = (await searchParams).primeiro_acesso === '1';
  const productCount = productsCountResult.count ?? 0;
  const stockCount = stockCountResult.count ?? 0;

  return (
    <>
      {firstAccess && (
        <div className="mb-5 flex items-start gap-3 rounded-3xl border border-success/15 bg-success/10 p-4 text-success">
          <CheckCircle2 className="mt-0.5 shrink-0" size={20} />
          <div><p className="m-0 text-sm font-black">Seu ambiente está pronto.</p><p className="mb-0 mt-1 text-xs leading-5 opacity-80">Agora vamos cadastrar ingredientes, produtos e conectar suas fórmulas no Cofre.</p></div>
        </div>
      )}

      <section className="mb-6 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <div className="panel overflow-hidden p-6 md:p-8">
          <div className="mb-7 flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow mb-2">{dateLabel}</p>
              <h1 className="m-0 text-3xl font-black tracking-[-0.04em] text-wine md:text-5xl">Bom dia, {userName} 👋</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-graphite/55">Aqui está o que merece sua atenção na {context.business.name} hoje.</p>
            </div>
            <div className="hidden rounded-3xl bg-cream p-4 text-wine md:block"><Sparkles size={28} strokeWidth={1.7} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric value={String(orders.length)} label="Encomendas hoje" />
            <Metric value={numberPt(pendingProduction, 0)} label="Itens em produção" />
            <Metric value={money(receivable)} label="A receber" />
            <Metric value={String(lowStock.length)} label="Alertas de estoque" attention={lowStock.length > 0} />
          </div>
        </div>

        <div className="rounded-3xl bg-wine p-6 text-cream shadow-soft md:p-7">
          <div className="mb-6 flex items-center justify-between">
            <div><p className="m-0 text-[10px] font-bold uppercase tracking-[.22em] text-cream/50">Cofre de Receitas</p><h2 className="mt-2 text-2xl font-black tracking-[-.03em]">Suas fórmulas. Seu patrimônio.</h2></div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10"><LockKeyhole size={21} /></div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[.06] p-4">
            <div className="flex items-center justify-between text-sm"><span className="text-cream/60">Receitas configuradas</span><strong>{completeRecipes} de {recipes.length}</strong></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-terracotta" style={{ width: recipes.length ? `${Math.round((completeRecipes / recipes.length) * 100)}%` : '0%' }} /></div>
          </div>
          <Link href="/painel/cofre" className="mt-5 flex w-full items-center justify-between rounded-2xl bg-cream px-4 py-3.5 text-sm font-bold text-wine">Abrir meu Cofre <ChevronRight size={18} /></Link>
        </div>
      </section>

      {(productCount === 0 || stockCount === 0 || recipes.length === 0) && (
        <section className="mb-6 panel p-5 md:p-6">
          <p className="eyebrow mb-1">Primeiros passos</p>
          <h2 className="m-0 text-xl font-black tracking-[-.03em] text-wine">Faça a Confeita trabalhar por você</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <SetupStep done={stockCount > 0} number="1" title="Ingredientes e estoque" text="Cadastre o que você compra e quanto possui." href="/painel/estoque/novo" />
            <SetupStep done={productCount > 0} number="2" title="Produtos" text="Cadastre bolos, doces, kits e variações." href="/painel/produtos/novo" />
            <SetupStep done={recipes.length > 0} number="3" title="Cofre de Receitas" text="Vincule ingredientes e rendimentos em sigilo." href="/painel/cofre/nova" />
          </div>
        </section>
      )}

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickAction href="/painel/pedidos/novo" icon={CalendarDays} title="Nova encomenda" text="Pedido, data e cliente" />
        <QuickAction href="/painel/producao" icon={Sparkles} title="Começar produção" text="Veja o que precisa ser feito" />
        <QuickAction href="/painel/compras/nova" icon={ShoppingBasket} title="Registrar compra" text="Atualize seu estoque" />
        <QuickAction href="/painel/cofre" icon={LockKeyhole} title="Abrir Cofre" text="Fórmulas protegidas" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <div className="panel p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between"><div><p className="eyebrow mb-1">Hoje</p><h2 className="m-0 text-xl font-black tracking-[-.03em] text-wine">Próximas encomendas</h2></div><Link href="/painel/agenda" className="text-xs font-bold text-terracotta">Ver agenda</Link></div>
          {orders.length === 0 ? <div className="rounded-2xl bg-cream/55 p-6 text-center text-sm text-graphite/45">Nenhuma encomenda para hoje.</div> : <div className="space-y-3">{orders.slice(0, 4).map((order) => {
            const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer;
            return <Link href={`/painel/pedidos/${order.id}`} key={order.id} className="flex items-center gap-4 rounded-2xl bg-cream/55 p-3.5 transition hover:bg-cream"><div className="min-w-14 rounded-xl bg-white px-2 py-2 text-center text-xs font-black text-wine">{timeOnly(order.scheduled_at)}</div><div className="min-w-0 flex-1"><p className="m-0 truncate text-sm font-bold text-graphite">Pedido #{order.order_number}</p><p className="mb-0 mt-1 truncate text-xs text-graphite/45">{customer?.name ?? 'Cliente não informado'} · {money(order.total)}</p></div><StatusBadge status={order.status} /><ChevronRight size={16} className="hidden text-wine/30 sm:block" /></Link>;
          })}</div>}
        </div>

        <div className="panel p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between"><div><p className="eyebrow mb-1">Estoque inteligente</p><h2 className="m-0 text-xl font-black tracking-[-.03em] text-wine">Atenção</h2></div><PackageOpen className="text-wine/30" size={24} /></div>
          {lowStock.length === 0 ? <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl bg-success/7 text-center"><CheckCircle2 className="mb-2 text-success" size={24} /><p className="m-0 text-sm font-bold text-success">Estoque sem alertas</p><p className="mb-0 mt-1 text-xs text-graphite/40">Nada abaixo do mínimo agora.</p></div> : <div className="space-y-3">{lowStock.map((item) => <Link key={item.inventory_item_id} href="/painel/estoque" className="flex items-center gap-3 rounded-2xl bg-cream/55 p-3.5"><AlertTriangle size={16} className="shrink-0 text-danger" /><div className="flex-1"><p className="m-0 text-sm font-bold text-graphite">{item.name}</p><p className="mb-0 mt-1 text-xs text-graphite/45">Disponível: {numberPt(item.available)} {item.base_unit} · mínimo {numberPt(item.min_stock)} {item.base_unit}</p></div><ChevronRight size={16} className="text-wine/30" /></Link>)}</div>}
          <Link href="/painel/compras" className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-wine/10 bg-cream/65 px-4 py-3 text-sm font-bold text-wine"><ShoppingBasket size={17} /> Abrir lista de compras</Link>
        </div>
      </section>
    </>
  );
}

function Metric({ value, label, attention = false }: { value: string; label: string; attention?: boolean }) {
  return <div className={`rounded-2xl p-4 ${attention ? 'bg-terracotta/10' : 'bg-cream/75'}`}><strong className={`block text-xl md:text-2xl ${attention ? 'text-terracotta' : 'text-wine'}`}>{value}</strong><span className="mt-1 block text-[11px] leading-4 text-graphite/55">{label}</span></div>;
}

function QuickAction({ href, icon: Icon, title, text }: { href: string; icon: typeof CalendarDays; title: string; text: string }) {
  return <Link href={href} className="action-card"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cream text-wine"><Icon size={19} strokeWidth={1.8} /></div><div><p className="mb-1 mt-5 text-sm font-bold text-wine md:text-base">{title}</p><p className="m-0 hidden text-xs leading-5 text-graphite/50 sm:block">{text}</p></div></Link>;
}

function SetupStep({ done, number, title, text, href }: { done: boolean; number: string; title: string; text: string; href: string }) {
  return <Link href={href} className={`rounded-2xl border p-4 transition ${done ? 'border-success/15 bg-success/7' : 'border-wine/10 bg-cream/55 hover:border-terracotta/30'}`}><div className="mb-4 flex items-center justify-between"><span className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-black ${done ? 'bg-success text-white' : 'bg-wine text-cream'}`}>{done ? <CheckCircle2 size={16} /> : number}</span><ChevronRight size={16} className="text-wine/25" /></div><p className="m-0 text-sm font-black text-wine">{title}</p><p className="mb-0 mt-1 text-xs leading-5 text-graphite/45">{text}</p></Link>;
}
