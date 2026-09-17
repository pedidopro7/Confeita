'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import { recordPurchaseBatchAction } from '@/app/painel/compras/batch-actions';
import { money } from '@/lib/format';

type InventoryItem = {
  id: string;
  name: string;
  base_unit: string;
  purchase_unit: string | null;
};
type Supplier = { id: string; name: string };
type Row = {
  key: string;
  inventoryItemId: string;
  quantity: number;
  unit: string;
  totalCost: number;
  lotCode: string;
  expiresAt: string;
};

function newKey() {
  return globalThis.crypto.randomUUID();
}

export function PurchaseBuilder({ items, suppliers }: { items: InventoryItem[]; suppliers: Supplier[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [supplierId, setSupplierId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [picker, setPicker] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const total = useMemo(() => rows.reduce((sum, row) => sum + Number(row.totalCost || 0), 0), [rows]);
  const selected = useMemo(() => new Set(rows.map((row) => row.inventoryItemId)), [rows]);

  function addItem() {
    const item = items.find((candidate) => candidate.id === picker);
    if (!item || selected.has(item.id)) return;
    setRows((current) => [...current, {
      key: newKey(),
      inventoryItemId: item.id,
      quantity: 1,
      unit: item.purchase_unit || item.base_unit,
      totalCost: 0,
      lotCode: '',
      expiresAt: ''
    }]);
    setPicker('');
  }

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await recordPurchaseBatchAction({
        supplierId: supplierId || null,
        paymentMethod,
        notes,
        idempotencyKey,
        items: rows.map((row) => ({
          inventoryItemId: row.inventoryItemId,
          quantity: Number(row.quantity),
          unit: row.unit,
          totalCost: Number(row.totalCost),
          lotCode: row.lotCode,
          expiresAt: row.expiresAt
        }))
      });
      if (!result.ok) {
        setMessage({ type: 'error', text: result.error });
        return;
      }
      setRows([]);
      setNotes('');
      setIdempotencyKey(newKey());
      setMessage({ type: 'ok', text: 'Compra registrada. Estoque, custos e financeiro foram atualizados.' });
      router.refresh();
    });
  }

  return <section className="panel p-5 md:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="eyebrow mb-1">Entrada completa</p><h2 className="m-0 text-xl font-black text-wine">Registrar compra</h2><p className="mb-0 mt-2 max-w-xl text-xs leading-5 text-graphite/45">Uma compra pode ter vários ingredientes e embalagens. A Confeita converte as unidades, recalcula o custo médio e dá entrada no estoque de uma vez.</p></div>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-wine text-cream"><ShoppingBasket size={18}/></div>
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="input"><option value="">Fornecedor não informado</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>
      <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="input"><option value="pix">Pix</option><option value="card">Cartão</option><option value="cash">Dinheiro</option><option value="boleto">Boleto</option><option value="other">Outro</option></select>
    </div>

    <div className="mt-5 rounded-3xl bg-cream/55 p-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><select value={picker} onChange={(event) => setPicker(event.target.value)} className="input"><option value="">Escolha um ingrediente ou material</option>{items.filter((item) => !selected.has(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name} · estoque em {item.base_unit}</option>)}</select><button type="button" disabled={!picker} onClick={addItem} className="h-11 rounded-2xl bg-wine px-4 text-xs font-bold text-cream disabled:opacity-40"><Plus size={13} className="mr-1 inline"/>Adicionar item</button></div>
    </div>

    <div className="mt-4 space-y-3">
      {rows.length === 0 ? <div className="rounded-2xl border border-dashed border-wine/15 p-8 text-center text-xs text-graphite/40">Adicione os itens desta compra.</div> : rows.map((row) => {
        const item = items.find((candidate) => candidate.id === row.inventoryItemId)!;
        return <div key={row.key} className="rounded-3xl border border-wine/5 bg-white p-4">
          <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="m-0 text-sm font-black text-graphite">{item.name}</p><p className="m-0 mt-1 text-[10px] text-graphite/35">Estoque interno em {item.base_unit}</p></div><button type="button" onClick={() => setRows((current) => current.filter((candidate) => candidate.key !== row.key))} className="mini-button text-danger"><Trash2 size={14}/></button></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <label><span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-graphite/35">Quantidade</span><input type="number" min="0.0001" step="0.0001" value={row.quantity} onChange={(event) => patchRow(row.key, { quantity: Number(event.target.value) })} className="input"/></label>
            <label><span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-graphite/35">Unidade comprada</span><input value={row.unit} onChange={(event) => patchRow(row.key, { unit: event.target.value })} className="input" placeholder="kg, g, caixa..."/></label>
            <label><span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-graphite/35">Valor total</span><input type="number" min="0" step="0.01" value={row.totalCost} onChange={(event) => patchRow(row.key, { totalCost: Number(event.target.value) })} className="input"/></label>
            <label><span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-graphite/35">Lote</span><input value={row.lotCode} onChange={(event) => patchRow(row.key, { lotCode: event.target.value })} className="input" placeholder="Opcional"/></label>
            <label><span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-graphite/35">Validade</span><input type="date" value={row.expiresAt} onChange={(event) => patchRow(row.key, { expiresAt: event.target.value })} className="input"/></label>
          </div>
        </div>;
      })}
    </div>

    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="input mt-4 min-h-20 py-3" placeholder="Observações da compra (opcional)"/>
    <div className="mt-5 flex flex-col gap-3 border-t border-wine/10 pt-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="m-0 text-[10px] font-bold uppercase tracking-wider text-graphite/35">Total da compra</p><p className="m-0 mt-1 text-2xl font-black text-wine">{money(total)}</p></div><button type="button" disabled={pending || rows.length === 0 || rows.some((row) => row.quantity <= 0 || row.totalCost < 0 || !row.unit.trim())} onClick={submit} className="h-12 rounded-2xl bg-wine px-7 text-sm font-bold text-cream disabled:opacity-40">{pending ? 'Registrando...' : 'Dar entrada em tudo'}</button></div>
    {message && <div className={`mt-4 flex items-start gap-2 rounded-2xl p-3 text-xs font-bold ${message.type === 'ok' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>{message.type === 'ok' && <CheckCircle2 size={15}/>}<span>{message.text}</span></div>}
  </section>;
}
