const orderLabels: Record<string, string> = {
  draft: 'Rascunho',
  awaiting_deposit: 'Aguardando sinal',
  confirmed: 'Confirmado',
  production: 'Em produção',
  ready: 'Pronto',
  out_for_delivery: 'Em entrega',
  completed: 'Concluído',
  canceled: 'Cancelado',
  refunded: 'Reembolsado',
  todo: 'A fazer',
  in_progress: 'Produzindo',
  done: 'Pronto',
  pending: 'Pendente',
  paid: 'Pago',
  failed: 'Falhou'
};

const tones: Record<string, string> = {
  draft: 'bg-graphite/8 text-graphite/60',
  awaiting_deposit: 'bg-warning/12 text-warning',
  confirmed: 'bg-wine/8 text-wine',
  production: 'bg-terracotta/12 text-terracotta',
  ready: 'bg-success/12 text-success',
  out_for_delivery: 'bg-wine/10 text-wine',
  completed: 'bg-success/12 text-success',
  canceled: 'bg-danger/10 text-danger',
  refunded: 'bg-danger/10 text-danger',
  todo: 'bg-graphite/8 text-graphite/60',
  in_progress: 'bg-terracotta/12 text-terracotta',
  done: 'bg-success/12 text-success',
  pending: 'bg-warning/12 text-warning',
  paid: 'bg-success/12 text-success',
  failed: 'bg-danger/10 text-danger'
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${tones[status] ?? 'bg-graphite/8 text-graphite/60'}`}>{orderLabels[status] ?? status}</span>;
}
