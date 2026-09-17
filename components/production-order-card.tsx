'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Circle, Scale } from 'lucide-react';
import { numberPt } from '@/lib/format';
import { setProductionActualQtyAction, toggleProductionStepAction } from '@/app/painel/producao/actions';

type Step = { id: string; title: string; completed: boolean };
type Props = {
  id: string;
  recipeName: string;
  orderLabel: string;
  plannedQty: number;
  actualQty: number | null;
  unit: string;
  steps: Step[];
};

export function ProductionOrderCard({ id, recipeName, orderLabel, plannedQty, actualQty, unit, steps }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [yieldValue, setYieldValue] = useState(actualQty ?? plannedQty);
  const [error, setError] = useState('');
  const done = steps.filter((step) => step.completed).length;

  function toggle(step: Step) {
    setError('');
    startTransition(async () => {
      const result = await toggleProductionStepAction(step.id, !step.completed);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function saveYield() {
    setError('');
    startTransition(async () => {
      const result = await setProductionActualQtyAction(id, Number(yieldValue));
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return <article className="panel overflow-hidden">
    <div className="border-b border-wine/10 p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="m-0 text-sm font-black text-wine">{recipeName}</p><p className="m-0 mt-1 text-[10px] text-graphite/40">{orderLabel}</p></div><span className="rounded-full bg-terracotta/10 px-2.5 py-1 text-[9px] font-bold text-terracotta">{done}/{steps.length}</span></div>
      <p className="mb-0 mt-3 text-xs text-graphite/55">Planejado: <strong className="text-wine">{numberPt(plannedQty)} {unit}</strong></p>
    </div>

    <div className="space-y-1 p-3">{steps.map((step) => <button key={step.id} type="button" disabled={pending} onClick={() => toggle(step)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-xs font-bold transition ${step.completed ? 'bg-success/10 text-success' : 'bg-cream/60 text-graphite/60 hover:bg-cream'}`}>{step.completed ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-white"><Check size={11}/></span> : <Circle size={20} className="text-wine/20"/>}<span className={step.completed ? 'line-through opacity-70' : ''}>{step.title}</span></button>)}</div>

    <div className="border-t border-wine/10 p-4"><div className="flex items-center gap-2"><Scale size={14} className="text-wine"/><p className="eyebrow m-0">Rendimento real</p></div><div className="mt-3 grid grid-cols-[1fr_auto] gap-2"><div className="relative"><input type="number" min="0" step="0.0001" value={yieldValue} onChange={(event) => setYieldValue(Number(event.target.value))} className="input pr-14"/><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-graphite/35">{unit}</span></div><button type="button" disabled={pending} onClick={saveYield} className="h-11 rounded-2xl bg-wine px-4 text-xs font-bold text-cream">Salvar</button></div>{actualQty !== null && <p className={`mb-0 mt-2 text-[10px] font-bold ${actualQty < plannedQty ? 'text-warning' : 'text-success'}`}>{actualQty < plannedQty ? `Diferença: -${numberPt(plannedQty - actualQty)} ${unit}` : `Rendimento registrado: ${numberPt(actualQty)} ${unit}`}</p>}{error && <p className="mb-0 mt-2 text-[10px] font-bold text-danger">{error}</p>}</div>
  </article>;
}
