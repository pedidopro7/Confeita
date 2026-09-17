import Link from 'next/link';
import { Clock3, MessageCircle, PackageCheck, ShoppingBasket, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, numberPt, shortDateTime } from '@/lib/format';

type PlanRow = {
  inventory_item_id: string;
  item_name: string;
  base_unit: string;
  purchase_unit: string;
  purchase_unit_multiplier: number | string;
  min_stock: number | string;
  on_hand: number | string;
  required_qty: number | string;
  projected_balance: number | string;
  buy_qty_base: number | string;
  suggested_purchase_qty: number | string;
  estimated_cost: number | string;
  earliest_due: string | null;
  orders_count: number | string;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_whatsapp: string | null;
};

const horizons = [
  { days: 1, label: 'Próximas 24h' },
  { days: 3, label: '3 dias' },
  { days: 7, label: '7 dias' },
  { days: 14, label: '14 dias' },
  { days: 30, label: '30 dias' }
];

export default async function ListaComprasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getBusinessContext(); if (!context) return null;
  const params = await searchParams;
  const requestedDays = typeof params.dias === 'string' ? Number(params.dias) : 7;
  const days = horizons.some((option) => option.days === requestedDays) ? requestedDays : 7;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('purchase_plan', { p_business_id: context.business.id, p_days: days });
  const rows = (data ?? []) as PlanRow[];
  const estimate = rows.reduce((sum, row) => sum + Number(row.estimated_cost ?? 0), 0);
  const urgent = rows.filter((row) => row.earliest_due && new Date(row.earliest_due).getTime() <= Date.now() + 48 * 60 * 60 * 1000).length;

  return <>
    <PageHeader eyebrow="Planejamento automático" title="Lista de compras" description="A Confeita cruza pedidos confirmados, ingredientes reservados, estoque físico e estoque mínimo para dizer o que realmente precisa ser comprado." actionHref="/painel/compras" actionLabel="Registrar compra" />

    <div className="mb-5 flex flex-wrap gap-2">
      {horizons.map((option) => <Link key={option.days} href={`/painel/compras/lista?dias=${option.days}`} className={`rounded-full px-4 py-2 text-xs font-bold ${days === option.days ? 'bg-wine text-cream' : 'border border-wine/10 bg-white text-wine'}`}>{option.label}</Link>)}
    </div>

    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      <Metric icon={ShoppingBasket} label="Itens para comprar" value={String(rows.length)} />
      <Metric icon={TriangleAlert} label="Urgentes em até 48h" value={String(urgent)} attention />
      <Metric icon={PackageCheck} label="Custo estimado" value={money(estimate)} />
    </div>

    {error && <div className="panel mb-5 border-danger/20 bg-danger/5 p-4 text-sm font-bold text-danger">Não foi possível calcular a lista agora: {error.message}</div>}

    {rows.length === 0 && !error ? <section className="panel p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 text-success"><PackageCheck size={24} /></div><h2 className="mb-1 mt-4 text-xl font-black text-wine">Nada para comprar neste período</h2><p className="mx-auto mb-0 max-w-lg text-sm leading-6 text-graphite/50">Com os pedidos confirmados e os mínimos atuais, seu estoque cobre o planejamento selecionado.</p></section> : <div className="space-y-3">
      {rows.map((row) => {
        const purchaseQty = Number(row.suggested_purchase_qty);
        const unit = row.purchase_unit || row.base_unit;
        const entryHref = `/painel/compras?item=${encodeURIComponent(row.inventory_item_id)}&qtd=${encodeURIComponent(String(purchaseQty))}&unidade=${encodeURIComponent(unit)}${row.supplier_id ? `&fornecedor=${encodeURIComponent(row.supplier_id)}` : ''}`;
        const whatsapp = whatsappUrl(row);
        const isUrgent = Boolean(row.earliest_due && new Date(row.earliest_due).getTime() <= Date.now() + 48 * 60 * 60 * 1000);

        return <article key={row.inventory_item_id} className="panel overflow-hidden">
          <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_.9fr_auto] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2"><h2 className="m-0 text-base font-black text-wine">{row.item_name}</h2>{isUrgent && <span className="rounded-full bg-danger/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-danger">urgente</span>}</div>
              <p className="mb-0 mt-2 text-sm text-graphite/55">Comprar <strong className="text-terracotta">{numberPt(purchaseQty, 4)} {unit}</strong>{unit !== row.base_unit ? <span> · equivalente a pelo menos {numberPt(row.buy_qty_base, 4)} {row.base_unit}</span> : null}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-graphite/45"><span>Físico: <strong className="text-graphite/70">{numberPt(row.on_hand)} {row.base_unit}</strong></span><span>Reservado: <strong className="text-graphite/70">{numberPt(row.required_qty)} {row.base_unit}</strong></span><span>Mínimo: <strong className="text-graphite/70">{numberPt(row.min_stock)} {row.base_unit}</strong></span></div>
            </div>

            <div className="rounded-2xl bg-cream/65 p-4 text-xs">
              <div className="flex items-center gap-2 font-bold text-wine"><Clock3 size={13} /> {row.earliest_due ? `Próximo pedido: ${shortDateTime(row.earliest_due)}` : 'Reposição por estoque mínimo'}</div>
              <p className="mb-0 mt-2 text-graphite/45">{Number(row.orders_count)} pedido(s) neste planejamento · saldo projetado {numberPt(row.projected_balance)} {row.base_unit}</p>
              {row.supplier_name && <p className="mb-0 mt-2 font-bold text-graphite/60">Último fornecedor: {row.supplier_name}</p>}
            </div>

            <div className="flex gap-2 lg:flex-col">
              <Link href={entryHref} className="flex h-10 flex-1 items-center justify-center rounded-2xl bg-wine px-4 text-xs font-bold text-cream">Dar entrada</Link>
              {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="flex h-10 flex-1 items-center justify-center gap-2 rounded-2xl border border-wine/10 bg-white px-4 text-xs font-bold text-wine"><MessageCircle size={14} /> Fornecedor</a>}
            </div>
          </div>
        </article>;
      })}
    </div>}

    <p className="mt-5 text-[10px] leading-5 text-graphite/40">A lista considera somente pedidos confirmados, porque são eles que já comprometem ingredientes de verdade. Pedidos em produção já tiveram o estoque consumido e não entram novamente no cálculo.</p>
  </>;
}

function whatsappUrl(row: PlanRow) {
  const digits = String(row.supplier_whatsapp ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const phone = digits.length <= 11 ? `55${digits}` : digits;
  const text = `Olá! Preciso cotar ${numberPt(row.suggested_purchase_qty, 4)} ${row.purchase_unit || row.base_unit} de ${row.item_name}.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function Metric({ icon: Icon, label, value, attention = false }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string; attention?: boolean }) {
  return <div className={`panel flex items-center gap-4 p-5 ${attention ? 'border-terracotta/30' : ''}`}><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${attention ? 'bg-terracotta/10 text-terracotta' : 'bg-wine/5 text-wine'}`}><Icon size={18} /></div><div><p className="m-0 text-[10px] font-bold uppercase tracking-wider text-graphite/35">{label}</p><p className={`m-0 mt-1 text-xl font-black ${attention ? 'text-terracotta' : 'text-wine'}`}>{value}</p></div></div>;
}
