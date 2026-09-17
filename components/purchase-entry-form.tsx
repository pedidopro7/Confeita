'use client';

import { useMemo, useState } from 'react';
import { recordPurchaseNormalizedAction } from '@/app/painel/compras/actions';

type Supplier = { id: string; name: string };
type Item = {
  id: string;
  name: string;
  base_unit: string;
  purchase_unit: string | null;
  purchase_unit_multiplier: number | string | null;
};

type Initial = {
  itemId?: string;
  quantity?: string;
  unit?: string;
  supplierId?: string;
};

export function PurchaseEntryForm({ suppliers, items, initial }: { suppliers: Supplier[]; items: Item[]; initial?: Initial }) {
  const [itemId, setItemId] = useState(initial?.itemId ?? '');
  const selected = items.find((item) => item.id === itemId);
  const [unit, setUnit] = useState(initial?.unit ?? selected?.purchase_unit ?? selected?.base_unit ?? 'un');

  const unitOptions = useMemo(() => {
    if (!selected) return ['g', 'kg', 'ml', 'L', 'un'];
    const values = new Set<string>();
    if (selected.purchase_unit) values.add(selected.purchase_unit);
    values.add(selected.base_unit);
    if (selected.base_unit === 'g') values.add('kg');
    if (selected.base_unit === 'kg') values.add('g');
    if (selected.base_unit === 'ml') values.add('L');
    if (selected.base_unit === 'L') values.add('ml');
    if (selected.base_unit === 'un') values.add('un');
    return Array.from(values);
  }, [selected]);

  function changeItem(nextId: string) {
    setItemId(nextId);
    const next = items.find((item) => item.id === nextId);
    setUnit(next?.purchase_unit || next?.base_unit || 'un');
  }

  return <form action={recordPurchaseNormalizedAction} className="panel p-5">
    <p className="eyebrow mb-1">Entrada rápida</p>
    <h2 className="mt-0 text-xl font-black text-wine">Registrar compra</h2>
    <div className="space-y-3">
      <select name="supplier_id" className="input" defaultValue={initial?.supplierId ?? ''}>
        <option value="">Fornecedor (opcional)</option>
        {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
      </select>

      <select required name="inventory_item_id" className="input" value={itemId} onChange={(event) => changeItem(event.target.value)}>
        <option value="">Item comprado</option>
        {items.map((item) => <option key={item.id} value={item.id}>{item.name} · estoque em {item.base_unit}</option>)}
      </select>

      <div className="grid grid-cols-2 gap-3">
        <input required name="quantity" min="0.0001" step="0.0001" type="number" defaultValue={initial?.quantity ?? ''} placeholder="Quantidade" className="input" />
        <select name="unit" required className="input" value={unit} onChange={(event) => setUnit(event.target.value)}>
          {unitOptions.map((value) => <option key={value} value={value}>{unitLabel(value, selected)}</option>)}
        </select>
      </div>

      <input required name="total_cost" min="0" step="0.01" type="number" placeholder="Valor total pago" className="input" />
      <div className="grid grid-cols-2 gap-3">
        <input name="lot_code" placeholder="Lote" className="input" />
        <input name="expires_at" type="date" className="input" />
      </div>
      <select name="payment_method" className="input">
        <option value="pix">Pix</option><option value="card">Cartão</option><option value="cash">Dinheiro</option><option value="boleto">Boleto</option>
      </select>
      <textarea name="notes" placeholder="Observação da compra (opcional)" className="input min-h-20 py-3" />
    </div>

    {selected && <p className="mb-0 mt-3 text-[10px] leading-4 text-graphite/40">
      Estoque base: {selected.base_unit}. {selected.purchase_unit && selected.purchase_unit !== selected.base_unit
        ? `1 ${selected.purchase_unit} = ${Number(selected.purchase_unit_multiplier ?? 1).toLocaleString('pt-BR')} ${selected.base_unit}.`
        : 'A quantidade será normalizada automaticamente.'}
    </p>}
    <button className="mt-4 h-11 w-full rounded-2xl bg-wine text-sm font-bold text-cream">Dar entrada no estoque</button>
  </form>;
}

function unitLabel(value: string, item?: Item) {
  if (item?.purchase_unit === value && value !== item.base_unit) {
    return `${value} (${Number(item.purchase_unit_multiplier ?? 1).toLocaleString('pt-BR')} ${item.base_unit})`;
  }
  return value;
}
