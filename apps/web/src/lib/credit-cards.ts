import type { Bill, CreditCard, UpcomingBill } from "@fd/contracts";

/** Totais agregados dos cartões de crédito (centavos). */
export interface CreditCardTotals {
  /** Soma dos limites informados; `null` quando nenhum cartão traz limite. */
  limitCents: number | null;
  /** Soma dos limites disponíveis informados; `null` quando nenhum cartão traz. */
  availableCents: number | null;
  /** Faturas abertas somadas (`account.balanceCents`, dívida em positivo). */
  usedCents: number;
  cards: number;
  cardsWithLimit: number;
}

/**
 * Agrega limite, limite disponível e fatura atual dos cartões.
 * Valores ausentes (`null`) não entram na soma — o KPI mostra "—" quando
 * nenhum cartão reporta limite em vez de fingir um total.
 */
export function creditCardTotals(cards: readonly CreditCard[]): CreditCardTotals {
  let limitCents: number | null = null;
  let availableCents: number | null = null;
  let usedCents = 0;
  let cardsWithLimit = 0;

  for (const card of cards) {
    usedCents += card.account.balanceCents;

    if (card.limitCents !== null) {
      limitCents = (limitCents ?? 0) + card.limitCents;
      cardsWithLimit += 1;
    }

    if (card.availableLimitCents !== null) {
      availableCents = (availableCents ?? 0) + card.availableLimitCents;
    }
  }

  return {
    limitCents,
    availableCents,
    usedCents,
    cards: cards.length,
    cardsWithLimit,
  };
}

/**
 * Uso do limite como razão 0–1 (para barra de progresso). `null` quando o
 * cartão não informa limite; o valor é limitado a 1 para não estourar a barra.
 */
export function usageRatio(usedCents: number, limitCents: number | null): number | null {
  if (limitCents === null || limitCents <= 0) {
    return null;
  }

  return Math.min(Math.max(usedCents / limitCents, 0), 1);
}

/** De onde saiu o valor comprometido do limite. */
export type LimitUsageBasis = "available" | "invoice";

/** Uso do limite de um cartão, já apurado para a barra e para o texto. */
export interface LimitUsage {
  /** Razão 0–1 (limitada a 1) para a barra de progresso. */
  ratio: number;
  /** Centavos que comprometem o limite. */
  committedCents: number;
  /** `available`: limite − disponível; `invoice`: fatura aberta (fallback). */
  basis: LimitUsageBasis;
}

/**
 * Uso do limite do cartão. O limite disponível informado pelo provider já
 * desconta as parcelas futuras, então `(limite − disponível) / limite` é o uso
 * real; a fatura aberta (`account.balanceCents`) é só o ciclo atual e subestima
 * o comprometimento. A fatura vira o fallback quando não há disponível.
 */
export function limitUsage(
  card: Pick<CreditCard, "limitCents" | "availableLimitCents" | "account">,
): LimitUsage | null {
  const { limitCents, availableLimitCents } = card;

  if (limitCents === null || limitCents <= 0) {
    return null;
  }

  const fromAvailable = availableLimitCents !== null;
  const committedCents = Math.max(
    fromAvailable ? limitCents - availableLimitCents : card.account.balanceCents,
    0,
  );
  // `usageRatio` é o único lugar com o clamp de 0–1; com limite válido ele só
  // devolveria `null` se o limite não fosse positivo, já barrado acima.
  const ratio = usageRatio(committedCents, limitCents);

  if (ratio === null) {
    return null;
  }

  return { ratio, committedCents, basis: fromAvailable ? "available" : "invoice" };
}

/** Rótulo do produto: "Visa · Platinum" (ou fallback quando o provider omite). */
export function creditCardProductLabel(
  card: Pick<CreditCard, "brand" | "level">,
  fallback = "Cartão de crédito",
): string {
  const parts = [card.brand, card.level].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );

  return parts.length > 0 ? parts.join(" · ") : fallback;
}

/** Faturas da mais recente para a mais antiga (a API não garante a ordem). */
export function sortBillsByDueDate(bills: readonly Bill[]): Bill[] {
  return [...bills].sort((a, b) => b.dueDate.localeCompare(a.dueDate) || b.id.localeCompare(a.id));
}

/**
 * Fatura inicial de um cartão: a aberta (em andamento) se existir; senão a
 * mais recente. Evita abrir a tela com uma fatura antiga selecionada.
 */
export function selectInitialBillId(bills: readonly Bill[]): string | null {
  if (bills.length === 0) {
    return null;
  }

  const sorted = sortBillsByDueDate(bills);
  const open = sorted.find((bill) => bill.status === "open");

  return (open ?? sorted[0]!).id;
}

/**
 * Próxima fatura a vencer: menor `dueDate` entre as que ainda não venceram.
 * Se todas já venceram, devolve a mais antiga (a dívida mais atrasada).
 */
export function nextDueBill(bills: readonly UpcomingBill[]): UpcomingBill | null {
  if (bills.length === 0) {
    return null;
  }

  const upcoming = bills.filter((bill) => bill.daysUntilDue >= 0);
  const pool = upcoming.length > 0 ? upcoming : bills;

  return [...pool].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
  )[0]!;
}

/** Dias até o vencimento a partir dos quais a fatura aparece em destaque (`warning`). */
export const DUE_SOON_DAYS = 7;

/** `true` quando a fatura vence em até `DUE_SOON_DAYS` (ou já venceu). */
export function isDueSoon(daysUntilDue: number): boolean {
  return daysUntilDue <= DUE_SOON_DAYS;
}

/**
 * Próxima fatura a vencer **de um cartão** entre as faturas futuras da API
 * (`/api/bills/upcoming`, janela de 30 dias). `null` quando o cartão não tem
 * fatura na janela: a tela mostra só o dia de vencimento do cadastro.
 */
export function nextBillForCard(
  bills: readonly UpcomingBill[],
  accountId: string,
): UpcomingBill | null {
  return nextDueBill(bills.filter((bill) => bill.accountId === accountId));
}
