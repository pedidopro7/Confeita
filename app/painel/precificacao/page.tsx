import { Calculator, CircleDollarSign, LockKeyhole, TrendingUp, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, numberPt } from '@/lib/format';
import { applySuggestedPriceAction, savePricingSettingsAction } from './actions';

type PricingRow = {
  product_id: string;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  current_price: number | string;
  recipe_version_id: string | null;
  recipe_output_qty: number | string;
  recipe_output_unit: string;
  material_cost: number | string;
  gross_profit: number | string;
  gross_margin_percent: number | string;
  target_margin_percent: number | string;
  suggested_price: number | string;
  has_variable_recipe_options: boolean;
};

export default async function PrecificacaoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requireOwner();
  const params = await searchParams;
  const ok = typeof params.ok === 'string' ? params.ok : null;
  const erro = typeof params.erro === 'string' ? params.erro : null;
  const supabase = await createClient();
  const [settingsResult, pricingResult] = await Promise.all([
    supabase.from('pricing_settings').select('target_margin_percent').eq('business_id', context.business.id).maybeSingle(),
    supabase.rpc('product_pricing_summary', { p_business_id: context.business.id })
  ]);

  const target = Number(settingsResult.data?.target_margin_percent ?? 60);
  const rows = (pricingResult.data ?? []) as PricingRow[];
  const withRecipe = rows.filter((row) => row.recipe_version_id && Number(row.material_cost) > 0);
  const belowTarget = withRecipe.filter((row) => Number(row.gross_margin_percent) < target).length;
  const averageMargin = withRecipe.length ? withRecipe.reduce((sum, row) => sum + Number(row.gross_margin_percent), 0) / withRecipe.length : 0;

  return <>
    <PageHeader eyebrow="Custos e margem" title="Precificação" description="Veja quanto cada receita custa hoje, compare com o preço de venda e simule uma margem-alvo sem alterar seus preços automaticamente." />

    {(erro || pricingResult.error) && <div className="mb-5 rounded-2xl bg-danger/10 p-4 text-sm font-bold text-danger">{erro || pricingResult.error?.message}</div>}
    {ok && <div className="mb-5 rounded-2xl bg-success/10 p-4 text-sm font-bold text-success">{ok === 'preco' ? 'Preço sugerido aplicado.' : 'Margem-alvo atualizada.'}</div>}

    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      <Metric icon={Calculator} label="Produtos com custo" value={String(withRecipe.length)} />
      <Metric icon={TrendingUp} label="Margem média de insumos" value={`${numberPt(averageMargin, 1)}%`} />
      <Metric icon={TriangleAlert} label="Abaixo da margem-alvo" value={String(belowTarget)} attention={belowTarget > 0} />
    </div>

    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className="space-y-3">
        {rows.length === 0 ? <div className="panel p-10 text-center"><CircleDollarSign className="mx-auto text-wine/25" /><h2 className="mb-1 mt-4 text-lg font-black text-wine">Cadastre produtos e receitas primeiro</h2><p className="m-0 text-sm text-graphite/45">Assim que uma fórmula estiver conectada ao produto, o custo aparece aqui.</p></div> : rows.map((row) => {
          const currentPrice = Number(row.current_price);
          const materialCost = Number(row.material_cost);
          const margin = Number(row.gross_margin_percent);
          const suggested = Number(row.suggested_price);
          const hasCost = Boolean(row.recipe_version_id && materialCost > 0);
          const underTarget = hasCost && margin < target;
          return <article key={`${row.product_id}-${row.variant_id ?? 'base'}`} className={`panel overflow-hidden ${underTarget ? 'border-terracotta/25' : ''}`}>
            <div className="grid gap-4 p-5 lg:grid-cols-[1.25fr_.9fr_auto] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h2 className="m-0 text-sm font-black text-wine">{row.product_name}{row.variant_name ? ` · ${row.variant_name}` : ''}</h2>{row.variant_name ? <span className="rounded-full bg-cream px-2 py-1 text-[9px] font-bold text-wine">variante</span> : null}</div>
                {hasCost ? <p className="mb-0 mt-2 text-xs text-graphite/50"><LockKeyhole size={11} className="mr-1 inline" /> Receita protegida · custo calculado para {numberPt(row.recipe_output_qty, 4)} {row.recipe_output_unit}</p> : <p className="mb-0 mt-2 text-xs font-bold text-terracotta">Sem custo calculável: vincule uma receita completa e custos aos ingredientes.</p>}
                {row.has_variable_recipe_options && <p className="mb-0 mt-1 text-[10px] text-graphite/40">Este produto tem escolhas com receitas próprias. O custo-base abaixo não inclui opções variáveis até o pedido ser montado.</p>}
              </div>

              <div className="grid grid-cols-2 gap-x-5 gap-y-2 rounded-2xl bg-cream/65 p-4 text-xs">
                <Value label="Custo de insumos" value={hasCost ? money(materialCost) : '—'} />
                <Value label="Preço atual" value={money(currentPrice)} />
                <Value label="Lucro bruto de insumos" value={hasCost ? money(Number(row.gross_profit)) : '—'} />
                <Value label="Margem" value={hasCost ? `${numberPt(margin, 1)}%` : '—'} attention={underTarget} />
              </div>

              <div className="min-w-40 text-left lg:text-right">
                <p className="m-0 text-[9px] font-bold uppercase tracking-wider text-graphite/35">Preço p/ {numberPt(target, 1)}%</p>
                <p className="m-0 mt-1 text-xl font-black text-wine">{hasCost && suggested > 0 ? money(suggested) : '—'}</p>
                {hasCost && suggested > 0 && Math.abs(suggested - currentPrice) >= 0.01 ? <form action={applySuggestedPriceAction} className="mt-2"><input type="hidden" name="product_id" value={row.product_id}/><input type="hidden" name="variant_id" value={row.variant_id ?? ''}/><button className="rounded-xl bg-wine px-3 py-2 text-[10px] font-bold text-cream">Aplicar sugerido</button></form> : null}
              </div>
            </div>
          </article>;
        })}
      </section>

      <aside className="space-y-5">
        <form action={savePricingSettingsAction} className="panel p-5">
          <p className="eyebrow mb-1">Regra da confeitaria</p><h2 className="mt-0 text-lg font-black text-wine">Margem-alvo</h2>
          <p className="text-xs leading-5 text-graphite/50">Usada somente para sugerir preço. A Confeita nunca altera seu catálogo sem você confirmar.</p>
          <label className="mt-4 block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-graphite/40">Margem sobre o preço de venda</span><div className="relative"><input name="target_margin_percent" type="number" min="0" max="99.99" step="0.01" defaultValue={target} className="input pr-10"/><span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-wine/40">%</span></div></label>
          <button className="mt-4 h-11 w-full rounded-2xl bg-wine text-sm font-bold text-cream">Salvar margem</button>
        </form>

        <div className="panel p-5"><p className="eyebrow mb-2">Como calculamos</p><p className="m-0 text-xs leading-5 text-graphite/55">O custo atual soma os ingredientes e embalagens da receita usando o custo médio registrado no estoque. O preço sugerido usa a margem-alvo configurada.</p><div className="mt-4 rounded-2xl bg-cream/70 p-4 text-[11px] leading-5 text-graphite/55"><strong className="text-wine">Importante:</strong> nesta versão a margem é de insumos. Mão de obra, energia, taxas, entrega e outros custos indiretos ainda não entram automaticamente nesse cálculo.</div></div>

        <div className="panel p-5"><p className="eyebrow mb-2">Histórico protegido</p><p className="m-0 text-xs leading-5 text-graphite/55">Quando uma encomenda é confirmada, o custo dos materiais daquele pedido fica congelado em um snapshot. Se o leite condensado subir depois, o resultado histórico do pedido não muda.</p></div>
      </aside>
    </div>
  </>;
}

function Metric({ icon: Icon, label, value, attention = false }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string; attention?: boolean }) {
  return <div className="panel flex items-center gap-4 p-5"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${attention ? 'bg-terracotta/10 text-terracotta' : 'bg-wine/5 text-wine'}`}><Icon size={18}/></div><div><p className="m-0 text-[9px] font-bold uppercase tracking-wider text-graphite/35">{label}</p><p className={`m-0 mt-1 text-xl font-black ${attention ? 'text-terracotta' : 'text-wine'}`}>{value}</p></div></div>;
}

function Value({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) {
  return <div><p className="m-0 text-[9px] uppercase tracking-wider text-graphite/35">{label}</p><p className={`m-0 mt-1 font-black ${attention ? 'text-terracotta' : 'text-wine'}`}>{value}</p></div>;
}
