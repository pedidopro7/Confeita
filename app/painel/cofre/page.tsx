import Link from 'next/link';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { shortDateTime } from '@/lib/format';

export default async function CofrePage() {
  const context = await requireOwner();
  const supabase = await createClient();
  const { data } = await supabase
    .from('recipes')
    .select('id,name,confidentiality,is_complete,updated_at,product:products(name),active:recipe_versions!recipes_active_version_fk(yield_qty,yield_unit,version_no)')
    .eq('business_id', context.business.id)
    .order('updated_at', { ascending: false });
  const recipes = data ?? [];

  return <>
    <PageHeader eyebrow="Propriedade intelectual" title="Cofre de Receitas" description="Suas fórmulas são cadastradas diretamente aqui. O suporte comum da Confeita não precisa receber sua receita." actionHref="/painel/cofre/nova" actionLabel="Nova fórmula" />
    <section className="mb-5 rounded-3xl bg-wine p-6 text-cream"><div className="flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10"><ShieldCheck /></div><div><p className="m-0 text-lg font-black">Suas receitas. Seu patrimônio.</p><p className="mb-0 mt-2 max-w-3xl text-xs leading-5 text-cream/60">Ingredientes, quantidades e rendimentos ficam isolados por confeitaria e sujeitos às regras do Cofre. O modo de preparo é opcional.</p></div></div></section>
    {recipes.length === 0 ? <div className="panel p-10 text-center"><LockKeyhole className="mx-auto mb-3 text-wine/25" /><p className="font-bold text-wine">Seu Cofre está vazio.</p><Link href="/painel/cofre/nova" className="mt-3 inline-flex rounded-2xl bg-wine px-4 py-2.5 text-xs font-bold text-cream">Cadastrar primeira fórmula</Link></div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{recipes.map((r: any) => { const product = Array.isArray(r.product) ? r.product[0] : r.product; const active = Array.isArray(r.active) ? r.active[0] : r.active; return <div key={r.id} className="panel p-5"><div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-wine text-cream"><LockKeyhole size={17} /></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase ${r.is_complete ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{r.is_complete ? 'Protegida' : 'Incompleta'}</span></div><p className="mb-0 mt-4 font-black text-wine">{r.name}</p><p className="m-0 mt-1 text-xs text-graphite/40">{product?.name || 'Sub-receita interna'}</p><div className="mt-4 rounded-2xl bg-cream/70 p-3 text-xs text-graphite/55"><p className="m-0">Rendimento: <strong>{active?.yield_qty || '—'} {active?.yield_unit || ''}</strong></p><p className="mb-0 mt-1">Versão: <strong>v{active?.version_no || 1}</strong></p></div><p className="mb-0 mt-3 text-[10px] text-graphite/35">Atualizada {shortDateTime(r.updated_at)}</p></div>; })}</div>}
  </>;
}
