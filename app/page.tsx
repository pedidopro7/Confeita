import Image from 'next/image';
import {
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  LockKeyhole,
  PackageOpen,
  Plus,
  ShoppingBasket,
  Sparkles,
  Wheat
} from 'lucide-react';

const actions = [
  { label: 'Nova encomenda', hint: 'Pedido, data e cliente', icon: CalendarDays },
  { label: 'Começar produção', hint: 'Veja o que precisa ser feito', icon: Sparkles },
  { label: 'Registrar compra', hint: 'Atualize o estoque em segundos', icon: ShoppingBasket },
  { label: 'Abrir Cofre', hint: 'Receitas e fórmulas protegidas', icon: LockKeyhole }
];

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-wine shadow-soft">
              <Image src="/confeita-mark.svg" alt="Confeita" width={34} height={34} priority />
            </div>
            <div>
              <div className="text-2xl font-black tracking-[-0.04em] text-wine">confeita<span className="text-terracotta">.</span></div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-wine/45">gestão para confeitaria</div>
            </div>
          </div>
          <button className="flex h-11 w-11 items-center justify-center rounded-2xl border border-wine/10 bg-white/70 text-wine md:hidden">
            <Plus size={20} />
          </button>
          <div className="hidden items-center gap-3 md:flex">
            <div className="text-right">
              <p className="m-0 text-sm font-semibold text-graphite">Mariana</p>
              <p className="m-0 text-xs text-graphite/50">Doce Ateliê</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-rose/50" />
          </div>
        </header>

        <section className="mb-6 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
          <div className="panel overflow-hidden p-6 md:p-8">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow mb-2">quarta-feira, 16 de setembro</p>
                <h1 className="m-0 max-w-xl text-3xl font-black tracking-[-0.04em] text-wine md:text-5xl">
                  Bom dia, Mariana 👋
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-graphite/60 md:text-base">
                  Sua produção está organizada. Existem 4 encomendas hoje e 3 ingredientes merecem atenção.
                </p>
              </div>
              <div className="hidden rounded-3xl bg-cream p-4 text-wine md:block">
                <Wheat size={28} strokeWidth={1.7} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric value="4" label="Encomendas" />
              <Metric value="18" label="Itens a produzir" />
              <Metric value="R$ 680" label="A receber" />
              <Metric value="3" label="Alertas de estoque" attention />
            </div>
          </div>

          <div className="rounded-3xl bg-wine p-6 text-cream shadow-soft md:p-7">
            <div className="mb-7 flex items-center justify-between">
              <div>
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-cream/55">Cofre de Receitas</p>
                <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em]">Suas fórmulas. Seu patrimônio.</h2>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                <LockKeyhole size={22} />
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-cream/65">Receitas configuradas</span>
                <strong>12 de 15</strong>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-4/5 rounded-full bg-terracotta" />
              </div>
            </div>
            <button className="mt-5 flex w-full items-center justify-between rounded-2xl bg-cream px-4 py-3.5 text-sm font-bold text-wine">
              Abrir meu Cofre <ChevronRight size={18} />
            </button>
          </div>
        </section>

        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="eyebrow mb-1">Ações rápidas</p>
              <h2 className="m-0 text-xl font-bold tracking-[-0.03em] text-wine">O que você precisa fazer?</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {actions.map(({ label, hint, icon: Icon }) => (
              <button key={label} className="action-card text-left">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cream text-wine">
                  <Icon size={19} strokeWidth={1.8} />
                </div>
                <div>
                  <p className="mb-1 mt-5 text-sm font-bold text-wine md:text-base">{label}</p>
                  <p className="m-0 hidden text-xs leading-5 text-graphite/50 sm:block">{hint}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <div className="panel p-5 md:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="eyebrow mb-1">Hoje</p>
                <h2 className="m-0 text-xl font-bold tracking-[-0.03em] text-wine">Próximas encomendas</h2>
              </div>
              <button className="text-xs font-bold text-terracotta">Ver agenda</button>
            </div>
            <div className="space-y-3">
              <OrderRow time="14:30" title="Bolo Ninho com Morango" customer="Ana Paula" status="Em produção" />
              <OrderRow time="17:00" title="100 Brigadeiros Gourmet" customer="Juliana" status="Confirmado" />
              <OrderRow time="19:30" title="Kit Festa 20 pessoas" customer="Camila" status="Aguardando" />
            </div>
          </div>

          <div className="panel p-5 md:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="eyebrow mb-1">Estoque inteligente</p>
                <h2 className="m-0 text-xl font-bold tracking-[-0.03em] text-wine">Atenção</h2>
              </div>
              <PackageOpen className="text-wine/35" size={24} />
            </div>
            <div className="space-y-3">
              <StockRow name="Leite condensado" detail="Faltam 4 unidades" tone="danger" />
              <StockRow name="Morango" detail="Vence amanhã" tone="warning" />
              <StockRow name="Caixa nº 25" detail="Faltam 3 unidades" tone="danger" />
            </div>
            <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-wine/10 bg-cream/65 px-4 py-3 text-sm font-bold text-wine">
              <ShoppingBasket size={17} /> Gerar lista de compras
            </button>
          </div>
        </section>

        <nav className="fixed bottom-3 left-1/2 z-20 flex w-[calc(100%-24px)] max-w-md -translate-x-1/2 items-center justify-around rounded-3xl border border-wine/10 bg-white/90 px-3 py-2.5 shadow-soft backdrop-blur md:hidden">
          <MobileNav icon={CalendarDays} label="Início" active />
          <MobileNav icon={Clock3} label="Pedidos" />
          <button className="-mt-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-wine text-cream shadow-soft"><Plus /></button>
          <MobileNav icon={Sparkles} label="Produção" />
          <MobileNav icon={CircleDollarSign} label="Mais" />
        </nav>
      </div>
    </main>
  );
}

function Metric({ value, label, attention = false }: { value: string; label: string; attention?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${attention ? 'bg-terracotta/10' : 'bg-cream/75'}`}>
      <strong className={`block text-xl md:text-2xl ${attention ? 'text-terracotta' : 'text-wine'}`}>{value}</strong>
      <span className="mt-1 block text-[11px] leading-4 text-graphite/55">{label}</span>
    </div>
  );
}

function OrderRow({ time, title, customer, status }: { time: string; title: string; customer: string; status: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-cream/55 p-3.5">
      <div className="min-w-14 rounded-xl bg-white px-2 py-2 text-center text-xs font-black text-wine">{time}</div>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-bold text-graphite">{title}</p>
        <p className="mb-0 mt-1 text-xs text-graphite/45">{customer}</p>
      </div>
      <span className="hidden rounded-full bg-white px-3 py-1.5 text-[10px] font-bold text-wine sm:inline">{status}</span>
      <ChevronRight size={17} className="text-wine/35" />
    </div>
  );
}

function StockRow({ name, detail, tone }: { name: string; detail: string; tone: 'danger' | 'warning' }) {
  const dot = tone === 'danger' ? 'bg-danger' : 'bg-warning';
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-cream/55 p-3.5">
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      <div className="flex-1">
        <p className="m-0 text-sm font-bold text-graphite">{name}</p>
        <p className="mb-0 mt-1 text-xs text-graphite/45">{detail}</p>
      </div>
      <ChevronRight size={17} className="text-wine/35" />
    </div>
  );
}

function MobileNav({ icon: Icon, label, active = false }: { icon: typeof CalendarDays; label: string; active?: boolean }) {
  return (
    <button className={`flex min-w-12 flex-col items-center gap-1 text-[9px] font-bold ${active ? 'text-wine' : 'text-graphite/40'}`}>
      <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
      {label}
    </button>
  );
}
