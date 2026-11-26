import { todayIsoDate, type Bill, type BillStatus } from "@fd/contracts";

import { formatDayMonth } from "./format";
import { daysBetweenIso } from "./period";

export interface BillStatusMeta {
  label: string;
  variant: "info" | "warning" | "positive" | "negative" | "secondary";
  description: string;
}

/** Status de fatura é derivado no servidor (datas + pagamentos). */
export const BILL_STATUS_META: Record<BillStatus, BillStatusMeta> = {
  open: {
    label: "Aberta",
    variant: "info",
    description: "Fatura em andamento, ainda recebendo lançamentos.",
  },
  closed: {
    label: "Fechada",
    variant: "warning",
    description: "Fechada e aguardando pagamento.",
  },
  paid: {
    label: "Paga",
    variant: "positive",
    description: "Pagamento identificado.",
  },
  overdue: {
    label: "Vencida",
    variant: "negative",
    description: "Passou do vencimento sem pagamento identificado.",
  },
};

export function billStatusMeta(status: BillStatus): BillStatusMeta {
  return BILL_STATUS_META[status];
}

/** Status do histórico: fechada, vencida e antiga, sem pagamento no provedor. */
const ARCHIVED_BILL_META: BillStatusMeta = {
  label: "Encerrada",
  variant: "secondary",
  description: "Fatura antiga encerrada no histórico, sem pagamento registrado no provedor.",
};

/**
 * Status exibido na lista de faturas. O servidor devolve `closed` tanto para a
 * fatura recém-fechada (aguardando pagamento) quanto para o histórico sem
 * pagamento registrado há mais de 90 dias, rederivado em vez de ficar
 * "vencido" para sempre. O segundo caso é arquivo, não pendência: mostrar
 * "Encerrada" em tom neutro evita que ele pareça algo a pagar.
 *
 * O limiar de 90 dias é do servidor (`billStatusOnDate`) e está fixado em
 * `apps/api/test/credit-cards-closing-day.test.ts`; por isso "closed com
 * vencimento no passado" só acontece no caso histórico.
 */
export function billStatusForDisplay(
  bill: Pick<Bill, "status" | "dueDate">,
  today: string = todayIsoDate(),
): BillStatusMeta {
  if (bill.status === "closed" && bill.dueDate < today) {
    return ARCHIVED_BILL_META;
  }

  return billStatusMeta(bill.status);
}

/** "vence hoje", "vence em 3 dias", "venceu há 2 dias". */
export function dueLabel(daysUntilDue: number): string {
  if (daysUntilDue === 0) {
    return "vence hoje";
  }

  if (daysUntilDue > 0) {
    return `vence em ${daysUntilDue} ${daysUntilDue === 1 ? "dia" : "dias"}`;
  }

  const days = Math.abs(daysUntilDue);
  return `venceu há ${days} ${days === 1 ? "dia" : "dias"}`;
}

export interface UpcomingBillsEmptyCopy {
  description: string;
  /** Mostra a ação "Conectar instituição" no estado vazio. */
  showConnect: boolean;
}

/** Janela padrão de "Próximas faturas" usada pelas páginas (dias). */
export const UPCOMING_BILLS_WINDOW_DAYS = 30;

/**
 * Texto do estado vazio de "Próximas faturas". Com cartão já conectado o
 * vazio é sobre o período, não sobre a conexão: pedir para conectar outro
 * cartão confunde quem já tem cartão e nenhuma fatura vencendo. Enquanto os
 * cartões carregam (`null`) o texto é neutro — nem afirma que não há cartão,
 * nem manda conectar.
 */
export function upcomingBillsEmptyCopy(
  hasCreditCards: boolean | null,
  days: number = UPCOMING_BILLS_WINDOW_DAYS,
): UpcomingBillsEmptyCopy {
  if (hasCreditCards === false) {
    return {
      description: "Conecte um cartão para acompanhar limites, fechamento e vencimento.",
      showConnect: true,
    };
  }

  return { description: `Nenhuma fatura vence nos próximos ${days} dias.`, showConnect: false };
}

/**
 * Texto de prazo da fatura considerando o status. Fatura paga não deve soar
 * atrasada ("venceu há 4 dias"): mostra a data ("venceu em 07/11") ou "paga"
 * quando o pagamento veio antes do vencimento. O histórico encerrado também
 * ganha a data em vez da contagem de dias.
 */
export function billDueLabel(
  bill: Pick<Bill, "status" | "dueDate">,
  today: string = todayIsoDate(),
): string {
  const isPast = bill.dueDate < today;

  if (bill.status === "paid") {
    return isPast ? `venceu em ${formatDayMonth(bill.dueDate)}` : "paga";
  }

  if (bill.status === "closed" && isPast) {
    return `venceu em ${formatDayMonth(bill.dueDate)}`;
  }

  return dueLabel(daysBetweenIso(today, bill.dueDate));
}
