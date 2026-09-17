import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { PurchaseBuilder } from '@/components/purchase-builder';
import { getBusinessContext, hasPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createSupplierAction } from '../actions';
import { money, shortDateTime } from '@/lib/format';

export default async function ComprasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getBusinessContext(); if (!context) return null; if (!hasPermission(context, 'manage_purchases')) redirect('/painel?erro=' + encodeURIComponent('Seu perfil não pode acessar compras.')); if (!context) return null;
  const params = await searchParams;
  const initialItemId = typeof params.item === 'string' ? params.item : '';
  const initialQuantity = typeof params.qtd === 'string' ? Number(params.qtd) : 1;
  const initialUnit = typeof params.unidade === 'string' ? params.unidade : '';
  const initialSupplierId = typeof params.fornecedor === 'string' ? params.fornecedor : '';
  const supabase = await createClient();
  const [suppliersResult, itemsResult, purchasesResult] = await Promise.all([
    supabase.from('suppliers').select('id,name,whatsapp').eq('business_id', context.business.id).order('name'),
    supabase.from('inventory_items').select('id,name,base_unit,purchase_unit').eq('business_id', context.business.id).eq('active', true).order('name'),
    supabase.from('purchases').select('id,total,purchased_at,payment_method,supplier:suppliers(name),items:purchase_items(id)').eq('business_id', context.business.id).order('purchased_at', { ascending: false }).limit(20)
  ]);
  const suppliers = suppliersResult.data ?? [];
  const items = itemsResult.data ?? [];
  const purchases = purchasesResult.data ?? [];

  return <>
    <PageHeader eyebrow="Abastecimento" title="Compras" description="Registre uma compra inteira de uma vez. Estoque, custo médio e financeiro são atualizados juntos." actionHref="/painel/compras/lista" actionLabel="Lista automática" />
    <PurchaseBuilder items={items} suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))} initialItemId={initialItemId} initialQuantity={initialQuantity} initialUnit={initialUnit} initialSupplierId={initialSupplierId}/>

    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className="panel overflow-hidden">
        <div className="border-b border-wine/10 px-5 py-4"><p className="m-0 text-sm font-black text-wine">Últimas compras</p><p className="m-0 mt-1 text-[10px] text-graphite/40">Cada compra mantém seus itens, custo e fornecedor.</p></div>
        {purchases.length === 0 ? <div className="p-8 text-center text-sm text-graphite/45">Nenhuma compra registrada.</div> : purchases.map((purchase: any) => {
          const supplier = Array.isArray(purchase.supplier) ? purchase.supplier[0] : purchase.supplier;
          const itemCount = Array.isArray(purchase.items) ? purchase.items.length : 0;
          return <div key={purchase.id} className="flex items-center justify-between gap-4 border-b border-wine/5 px-5 py-4 last:border-0"><div><p className="m-0 text-sm font-bold text-graphite">{supplier?.name || 'Sem fornecedor'}</p><p className="m-0 mt-1 text-xs text-graphite/40">{shortDateTime(purchase.purchased_at)} · {itemCount} {itemCount === 1 ? 'item' : 'itens'} · {purchase.payment_method || 'pagamento não informado'}</p></div><strong className="shrink-0 text-wine">{money(purchase.total)}</strong></div>;
        })}
      </section>

      <form action={createSupplierAction} className="panel h-fit p-5">
        <p className="eyebrow mb-1">Fornecedores</p><h2 className="mt-0 text-lg font-black text-wine">Novo fornecedor</h2>
        <div className="space-y-3"><input required name="name" placeholder="Nome" className="input" /><input name="whatsapp" placeholder="WhatsApp" className="input" /><input name="email" type="email" placeholder="E-mail" className="input" /><textarea name="notes" placeholder="Prazo, contato, observações..." className="input min-h-20 py-3" /></div>
        <button className="mt-4 h-10 w-full rounded-2xl bg-cream text-xs font-bold text-wine">Salvar fornecedor</button>
      </form>
    </div>
  </>;
}
