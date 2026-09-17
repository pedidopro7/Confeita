import { PageHeader } from '@/components/page-header';
import { getBusinessContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createSupplierAction, recordPurchaseAction } from '../actions';
import { money, shortDateTime } from '@/lib/format';

export default async function ComprasPage() {
  const context = await getBusinessContext(); if (!context) return null;
  const supabase = await createClient();
  const [suppliersResult, itemsResult, purchasesResult] = await Promise.all([
    supabase.from('suppliers').select('id,name,whatsapp').eq('business_id', context.business.id).order('name'),
    supabase.from('inventory_items').select('id,name,base_unit').eq('business_id', context.business.id).eq('active', true).order('name'),
    supabase.from('purchases').select('id,total,purchased_at,payment_method,supplier:suppliers(name)').eq('business_id', context.business.id).order('purchased_at', { ascending: false }).limit(20)
  ]);
  const suppliers = suppliersResult.data ?? [];
  const items = itemsResult.data ?? [];
  const purchases = purchasesResult.data ?? [];

  return <><PageHeader eyebrow="Abastecimento" title="Compras" description="Registre entradas para atualizar estoque, custo e histórico de fornecedores." />
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <section className="panel overflow-hidden"><div className="border-b border-wine/10 px-5 py-4 font-bold text-wine">Últimas compras</div>{purchases.length === 0 ? <div className="p-8 text-center text-sm text-graphite/45">Nenhuma compra registrada.</div> : purchases.map((p: any) => <div key={p.id} className="flex items-center justify-between border-b border-wine/5 px-5 py-4 last:border-0"><div><p className="m-0 text-sm font-bold text-graphite">{Array.isArray(p.supplier) ? p.supplier[0]?.name : p.supplier?.name || 'Sem fornecedor'}</p><p className="m-0 mt-1 text-xs text-graphite/40">{shortDateTime(p.purchased_at)} · {p.payment_method || 'pagamento não informado'}</p></div><strong className="text-wine">{money(p.total)}</strong></div>)}</section>
      <div className="space-y-5"><form action={recordPurchaseAction} className="panel p-5"><p className="eyebrow mb-1">Entrada rápida</p><h2 className="mt-0 text-xl font-black text-wine">Registrar compra</h2><div className="space-y-3"><select name="supplier_id" className="input"><option value="">Fornecedor (opcional)</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select required name="inventory_item_id" className="input"><option value="">Item comprado</option>{items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select><div className="grid grid-cols-2 gap-3"><input required name="quantity" min="0.0001" step="0.0001" type="number" placeholder="Quantidade" className="input" /><select name="unit" required className="input"><option value="g">g</option><option value="ml">ml</option><option value="un">un</option><option value="kg">kg</option><option value="L">L</option></select></div><input required name="total_cost" min="0" step="0.01" type="number" placeholder="Valor total pago" className="input" /><div className="grid grid-cols-2 gap-3"><input name="lot_code" placeholder="Lote" className="input" /><input name="expires_at" type="date" className="input" /></div><select name="payment_method" className="input"><option value="pix">Pix</option><option value="card">Cartão</option><option value="cash">Dinheiro</option><option value="boleto">Boleto</option></select></div><button className="mt-4 h-11 w-full rounded-2xl bg-wine text-sm font-bold text-cream">Dar entrada no estoque</button></form>
      <form action={createSupplierAction} className="panel p-5"><p className="text-sm font-black text-wine">Novo fornecedor</p><div className="mt-3 grid gap-3"><input required name="name" placeholder="Nome" className="input" /><input name="whatsapp" placeholder="WhatsApp" className="input" /></div><button className="mt-3 h-10 w-full rounded-2xl bg-cream text-xs font-bold text-wine">Salvar fornecedor</button></form></div>
    </div></>;
}
