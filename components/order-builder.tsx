'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Minus, Plus, Trash2 } from 'lucide-react';
import { createConfiguredOrderAction } from '@/app/painel/pedidos/create-order-action';
import { money } from '@/lib/format';

type Customer = { id: string; name: string };
type ProductOption = {
  id: string;
  name: string;
  priceDelta: number;
  recipeId?: string | null;
  recipeVersionId?: string | null;
  recipeOutputQty: number;
  recipeOutputUnit: string;
};
type ProductGroup = {
  id: string;
  name: string;
  selectionType: 'single' | 'multiple';
  minSelect: number;
  maxSelect: number | null;
  options: ProductOption[];
};
type ProductVariant = {
  id: string;
  name: string;
  price: number;
  recipeOutputQty: number;
  recipeOutputUnit: string;
  recipeVersionId?: string | null;
};
type Product = {
  id: string;
  name: string;
  basePrice: number;
  recipeOutputQty: number;
  recipeOutputUnit: string;
  recipeVersionId?: string | null;
  variants: ProductVariant[];
  groups: ProductGroup[];
};
type Row = {
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  optionIds: string[];
  summary: string[];
  recipeConnected: boolean;
};

export function OrderBuilder({ customers, products }: { customers: Customer[]; products: Product[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<Row[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [deposit, setDeposit] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [draftQuantity, setDraftQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});

  const selectedProduct = products.find((product) => product.id === productId);
  const selectedVariant = selectedProduct?.variants.find((variant) => variant.id === variantId);
  const chosenOptions = useMemo(() => {
    if (!selectedProduct) return [] as ProductOption[];
    return selectedProduct.groups.flatMap((group) => group.options.filter((option) => (selectedOptions[group.id] ?? []).includes(option.id)));
  }, [selectedProduct, selectedOptions]);
  const draftUnitPrice = (selectedVariant?.price ?? selectedProduct?.basePrice ?? 0) + chosenOptions.reduce((sum, option) => sum + option.priceDelta, 0);
  const subtotal = useMemo(() => rows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0), [rows]);

  function chooseProduct(id: string) {
    setProductId(id);
    setVariantId('');
    setDraftQuantity(1);
    setSelectedOptions({});
    setError('');
  }

  function toggleOption(group: ProductGroup, optionId: string) {
    setSelectedOptions((current) => {
      const selected = current[group.id] ?? [];
      if (group.selectionType === 'single') return { ...current, [group.id]: selected.includes(optionId) ? [] : [optionId] };
      if (selected.includes(optionId)) return { ...current, [group.id]: selected.filter((id) => id !== optionId) };
      if (group.maxSelect !== null && selected.length >= group.maxSelect) return current;
      return { ...current, [group.id]: [...selected, optionId] };
    });
  }

  function addConfiguredItem() {
    if (!selectedProduct) return;
    if (selectedProduct.variants.length > 0 && !selectedVariant) {
      setError(`Escolha um tamanho ou formato para ${selectedProduct.name}.`);
      return;
    }
    for (const group of selectedProduct.groups) {
      const count = (selectedOptions[group.id] ?? []).length;
      if (count < group.minSelect) {
        setError(`${group.name}: escolha pelo menos ${group.minSelect} opção(ões).`);
        return;
      }
      if (group.maxSelect !== null && count > group.maxSelect) {
        setError(`${group.name}: escolha no máximo ${group.maxSelect} opção(ões).`);
        return;
      }
    }

    const optionSummary = selectedProduct.groups.flatMap((group) => {
      const ids = selectedOptions[group.id] ?? [];
      const names = group.options.filter((option) => ids.includes(option.id)).map((option) => option.name);
      return names.length ? [`${group.name}: ${names.join(', ')}`] : [];
    });
    const recipeConnected = Boolean((selectedVariant?.recipeVersionId ?? selectedProduct.recipeVersionId) || chosenOptions.some((option) => option.recipeVersionId));

    setRows((current) => [...current, {
      key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      productId: selectedProduct.id,
      variantId: selectedVariant?.id ?? null,
      name: selectedVariant ? `${selectedProduct.name} · ${selectedVariant.name}` : selectedProduct.name,
      quantity: Math.max(draftQuantity, 0.0001),
      unitPrice: draftUnitPrice,
      optionIds: chosenOptions.map((option) => option.id),
      summary: optionSummary,
      recipeConnected
    }]);

    setProductId('');
    setVariantId('');
    setSelectedOptions({});
    setDraftQuantity(1);
    setError('');
  }

  function changeQty(key: string, delta: number) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, quantity: Math.max(0.0001, Number((row.quantity + delta).toFixed(4))) } : row));
  }

  function submit() {
    setError('');
    startTransition(async () => {
      const result = await createConfiguredOrderAction({
        customerId: customerId || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        fulfillmentType: fulfillment,
        notes,
        depositRequired: deposit,
        deliveryFee,
        items: rows.map((row) => ({ productId: row.productId, variantId: row.variantId, quantity: row.quantity, optionIds: row.optionIds }))
      });
      if (!result.ok) {
        setError(result.error || 'Não foi possível criar a encomenda.');
        return;
      }
      router.push(`/painel/pedidos/${result.orderId}`);
      router.refresh();
    });
  }

  return <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
    <section className="space-y-5">
      <div className="panel p-5">
        <p className="eyebrow mb-1">Cliente e prazo</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="input"><option value="">Cliente não informado</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>
          <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="input"/>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2"><button type="button" onClick={() => setFulfillment('pickup')} className={`h-11 rounded-2xl text-xs font-bold ${fulfillment === 'pickup' ? 'bg-wine text-cream' : 'border border-wine/10 bg-white text-wine'}`}>Retirada</button><button type="button" onClick={() => setFulfillment('delivery')} className={`h-11 rounded-2xl text-xs font-bold ${fulfillment === 'delivery' ? 'bg-wine text-cream' : 'border border-wine/10 bg-white text-wine'}`}>Entrega</button></div>
        </div>
      </div>

      <div className="panel p-5">
        <p className="eyebrow mb-1">Adicionar produto</p>
        <select value={productId} onChange={(event) => chooseProduct(event.target.value)} className="input mt-4"><option value="">Escolha um produto</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · a partir de {money(product.basePrice)}</option>)}</select>

        {selectedProduct && <div className="mt-5 space-y-5 rounded-3xl bg-cream/60 p-4">
          {selectedProduct.variants.length > 0 && <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-graphite/40">Tamanho / formato</p><div className="grid gap-2 sm:grid-cols-2">{selectedProduct.variants.map((variant) => <button type="button" key={variant.id} onClick={() => setVariantId(variant.id)} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-xs font-bold ${variantId === variant.id ? 'border-wine bg-wine text-cream' : 'border-wine/10 bg-white text-graphite'}`}><span>{variant.name}</span><span>{money(variant.price)}</span></button>)}</div></div>}

          {selectedProduct.groups.map((group) => {
            const selected = selectedOptions[group.id] ?? [];
            return <div key={group.id}><div className="mb-2 flex items-center justify-between gap-3"><p className="m-0 text-[10px] font-bold uppercase tracking-[.14em] text-graphite/40">{group.name}</p><span className="text-[10px] text-graphite/35">{group.minSelect > 0 ? `mín. ${group.minSelect}` : 'opcional'}{group.maxSelect ? ` · máx. ${group.maxSelect}` : ''}</span></div><div className="grid gap-2 sm:grid-cols-2">{group.options.map((option) => {
              const active = selected.includes(option.id);
              return <button type="button" key={option.id} onClick={() => toggleOption(group, option.id)} className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left ${active ? 'border-wine bg-white shadow-sm' : 'border-transparent bg-white/70'}`}><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? 'border-wine bg-wine text-cream' : 'border-wine/15'}`}>{active && <Check size={12}/>}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-graphite">{option.name}</span><span className="mt-0.5 block text-[10px] text-graphite/40">{option.priceDelta === 0 ? 'sem acréscimo' : `${option.priceDelta > 0 ? '+' : ''}${money(option.priceDelta)}`}{option.recipeVersionId ? ' · estoque automático' : ''}</span></span></button>;
            })}</div></div>;
          })}

          <div className="grid gap-3 border-t border-wine/10 pt-4 sm:grid-cols-[120px_1fr_auto] sm:items-end"><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-graphite/40">Quantidade</span><input type="number" min="0.0001" step="1" value={draftQuantity} onChange={(event) => setDraftQuantity(Math.max(Number(event.target.value), 0.0001))} className="input"/></label><div><p className="m-0 text-[10px] uppercase tracking-wider text-graphite/35">Valor desta configuração</p><p className="m-0 mt-1 text-xl font-black text-wine">{money(draftUnitPrice * draftQuantity)}</p></div><button type="button" onClick={addConfiguredItem} className="h-11 rounded-2xl bg-terracotta px-5 text-xs font-bold text-white">Adicionar ao pedido</button></div>
        </div>}
      </div>

      <div className="panel overflow-hidden">
        <div className="border-b border-wine/10 px-5 py-4"><p className="m-0 text-sm font-black text-wine">Itens da encomenda</p></div>
        {rows.length === 0 ? <div className="p-8 text-center text-xs text-graphite/45">Configure e adicione os produtos acima.</div> : <div className="divide-y divide-wine/5">{rows.map((row) => <div key={row.key} className="px-5 py-4"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="m-0 text-sm font-black text-graphite">{row.name}</p>{row.summary.length > 0 && <p className="m-0 mt-1 text-xs leading-5 text-graphite/45">{row.summary.join(' · ')}</p>}<p className="m-0 mt-1 text-[10px] font-bold text-graphite/35">{row.recipeConnected ? '🔐 receita conectada ao estoque' : 'sem receita vinculada'}</p></div><strong className="text-sm text-wine">{money(row.unitPrice * row.quantity)}</strong></div><div className="mt-3 flex items-center justify-end gap-2"><button type="button" onClick={() => changeQty(row.key, -1)} className="mini-button"><Minus size={13}/></button><span className="w-10 text-center text-xs font-bold">{row.quantity}</span><button type="button" onClick={() => changeQty(row.key, 1)} className="mini-button"><Plus size={13}/></button><button type="button" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))} className="mini-button text-danger"><Trash2 size={13}/></button></div></div>)}</div>}
      </div>

      <div className="panel p-5"><p className="eyebrow mb-1">Observações</p><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="input mt-3 min-h-28 py-3" placeholder="Tema, nome, idade, cores, referência, restrições..."/></div>
    </section>

    <aside className="panel h-fit p-5 xl:sticky xl:top-8">
      <p className="eyebrow mb-1">Resumo</p><h2 className="mt-0 text-xl font-black text-wine">Nova encomenda</h2>
      <div className="space-y-3 border-y border-wine/10 py-4 text-sm"><div className="flex justify-between"><span className="text-graphite/50">Produtos</span><strong>{money(subtotal)}</strong></div><label className="flex items-center justify-between gap-4"><span className="text-graphite/50">Entrega</span><input type="number" min="0" step="0.01" value={deliveryFee} onChange={(event) => setDeliveryFee(Number(event.target.value))} className="w-28 rounded-xl border border-wine/10 bg-cream px-2 py-1.5 text-right text-xs"/></label><label className="flex items-center justify-between gap-4"><span className="text-graphite/50">Sinal</span><input type="number" min="0" step="0.01" value={deposit} onChange={(event) => setDeposit(Number(event.target.value))} className="w-28 rounded-xl border border-wine/10 bg-cream px-2 py-1.5 text-right text-xs"/></label></div>
      <div className="flex items-end justify-between py-4"><span className="font-bold text-graphite/60">Total</span><strong className="text-3xl text-wine">{money(subtotal + deliveryFee)}</strong></div>
      {error && <p className="rounded-2xl bg-danger/10 p-3 text-xs font-bold text-danger">{error}</p>}
      <button disabled={pending || rows.length === 0} onClick={submit} className="h-12 w-full rounded-2xl bg-wine text-sm font-bold text-cream disabled:opacity-40">{pending ? 'Salvando...' : 'Criar encomenda'}</button>
    </aside>
  </div>;
}
