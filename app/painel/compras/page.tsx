import { PageHeader } from '@/components/page-header';
import { PurchaseEntryForm } from '@/components/purchase-entry-form';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createSupplierAction } from '../actions';
import { money, shortDateTime } from '@/lib/format';

export default async function ComprasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getBusinessContext(); if (!context) return null;
  const params = await searchParams;
  const pick = (key: string) => typeof params[key] === 'string' ? params[key] as string : undefined;
  const supabase = await createClient();
  const [suppliersResult, itemsResult, purchasesResult] = await Promise.all([
    supabase.from('suppliers').select('id,name,whatsapp').eq('business_id', context.business.id).order('name'),
    supabase.from('inventory_items').select('id,name,base_unit,purchase_unit,purchase_unit_multiplier').eq('business_id', context.business.id).eq('active', true).order('name'),
    supabase.from('purchases').select('id,total,purchased_at,payment_method,supplier:suppliers(name)').eq('business_id', context.business.id).order('purchased_at', { ascending: false }).limit(20)
  ]);
  const suppliers = suppliersResult.data ?? [];
  const items = itemsResult.data ?? [];
  const purchases = purchasesResult.data ?? [];

  return <>
    <PageHeader eyebrow="Abastecimento" title="Compras" description="Registre entradas por kg, pacote, caixa ou pela unidade que você realmente compra. O estoque é normalizado automaticamente." actionHref="/painel/compras/lista" actionLabel="Lista automática" />
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <section className="panel overflow-hidden">
        <div className="border-b border-wine/10 px-5 py-4 font-bold text-wine">Últimas compras</div>
        {purchases.length === 0 ? <div className="p-8 text-center text-sm text-graphite/45">Nenhuma compra registrada.</div> : purchases.map((p: any) => <div key={p.id} className="flex items-center justify-between border-b border-wine/5 px-5 py-4 last:border-0"><div><p className="m-0 text-sm font-bold text-graphite">{Array.isArray(p.supplier) ? p.supplier[0]?.name : p.supplier?.name || 'Sem fornecedor'}</p><p className="m-0 mt-1 text-xs text-graphite/40">{shortDateTime(p.purchased_at)} · {p.payment_method || 'pagamento não informado'}</p></div><strong className="text-wine">{money(p.total)}</strong></div>)}
      </section>
      <div className="space-y-5">
        <PurchaseEntryForm
          suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
          items={items}
          initial={{ itemId: pick('item'), quantity: pick('qtd'), unit: pick('unidade'), supplierId: pick('fornecedor') }}
        />
        <form action={createSupplierAction} className="panel p-5"><p className="text-sm font-black text-wine">Novo fornecedor</p><div className="mt-3 grid gap-3"><input required name="name" placeholder="Nome" className="input" /><input name="whatsapp" placeholder="WhatsApp" className="input" /></div><button className="mt-3 h-10 w-full rounded-2xl bg-cream text-xs font-bold text-wine">Salvar fornecedor</button></form>
      </div>
    </div>
  </>;
}
