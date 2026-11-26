import type { ProviderBillStatus } from "./types";

export interface BillStatusInput {
  /** `YYYY-MM-DD` (data local da fatura). */
  dueDate: string;
  /** `YYYY-MM-DD`; `null` quando o fornecedor não informa fechamento. */
  closingDate?: string | null;
  totalCents: number;
  /** Soma dos pagamentos já registrados; default 0. */
  paidCents?: number | null;
  /** `YYYY-MM-DD` de referência (hoje em America/Sao_Paulo). */
  today: string;
}

/** Faturas vencidas há mais que isso são histórico fechado, não "atrasadas". */
export const HISTORICAL_BILL_DAYS = 90;

function addDaysIso(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(time)) return date;
  return new Date(time + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Faturas do Pluggy não têm `status`; o domínio deriva:
 * pago → soma de pagamentos cobre o total;
 * atrasada → venceu nos últimos 90 dias e não foi paga;
 * fechada → fechamento já passou e não foi paga, ou venceu há > 90 dias
 * (histórico antigo não deve virar "atrasada" para sempre);
 * aberta → ainda não fechou.
 */
export function deriveBillStatus(input: BillStatusInput): ProviderBillStatus {
  const dueDate = input.dueDate.slice(0, 10);
  const closingDate = input.closingDate?.slice(0, 10) ?? null;
  const today = input.today.slice(0, 10);
  const totalCents = Math.max(0, Math.round(input.totalCents));
  const paidCents = Math.max(0, Math.round(input.paidCents ?? 0));

  if (paidCents >= totalCents) return "paid";
  if (dueDate.length > 0 && dueDate < today) {
    return dueDate < addDaysIso(today, -HISTORICAL_BILL_DAYS) ? "closed" : "overdue";
  }
  if (closingDate !== null && closingDate.length > 0 && closingDate <= today) return "closed";
  return "open";
}
