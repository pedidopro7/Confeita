export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function money(value: number | string | null | undefined) {
  return brl.format(Number(value ?? 0));
}

export function shortDate(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

export function shortDateTime(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function timeOnly(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function numberPt(value: number | string | null | undefined, digits = 2) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(Number(value ?? 0));
}
