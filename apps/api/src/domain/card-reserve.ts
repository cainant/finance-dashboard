/**
 * Reserva para faturas: cartões no modo `reserve` guardam o valor das compras
 * numa conta ou num investimento, e o app compara o que já está guardado com o
 * que as faturas vão cobrar. Ver `docs/decisions/2026-11-18-reserva-para-faturas.md`.
 */
import {
  addDays,
  type CardPaymentPlan,
  type CardReserves,
  type ReserveStatus,
} from "@fd/contracts";
import type { Database } from "@fd/database";
import {
  accounts,
  bills,
  cardPaymentPlans,
  connections,
  institutions,
  investments,
} from "@fd/database/schema";
import { and, eq, gte, inArray, ne } from "drizzle-orm";

import { billStatusOnDate, derivedOpenBillRow, isUnpaidStatus } from "./bills";
import { loadOpenBillCards } from "./open-bill-cards";

/** Mesma janela de `GET /api/bills/upcoming`: atrasadas há mais que isso são histórico. */
const UNPAID_FLOOR_DAYS = 90;

type PlanRow = typeof cardPaymentPlans.$inferSelect;

export function planDto(row: PlanRow): CardPaymentPlan {
  return {
    accountId: row.accountId,
    mode: row.mode,
    reserveAccountId: row.reserveAccountId,
    reserveInvestmentId: row.reserveInvestmentId,
  };
}

/** Chave da fonte da reserva (cartões que apontam para a mesma fonte somam). */
function sourceKey(plan: PlanRow): string | null {
  if (plan.reserveAccountId) return `account:${plan.reserveAccountId}`;
  if (plan.reserveInvestmentId) return `investment:${plan.reserveInvestmentId}`;
  return null;
}

/**
 * Quanto cada cartão vai cobrar: faturas não pagas (status efetivo na data,
 * mesma janela de 90 dias de "Faturas a vencer") + a fatura corrente derivada.
 * Parcelas futuras não entram: só o que já caiu numa fatura ou no ciclo aberto.
 */
export async function neededByCard(
  db: Database,
  userId: string,
  cardIds: readonly string[],
  today: string,
): Promise<Map<string, number>> {
  const needed = new Map<string, number>(cardIds.map((id) => [id, 0]));
  if (cardIds.length === 0) return needed;

  const [billRows, cards] = await Promise.all([
    db
      .select()
      .from(bills)
      .where(
        and(
          inArray(bills.accountId, [...cardIds]),
          ne(bills.status, "paid"),
          gte(bills.dueDate, addDays(today, -UNPAID_FLOOR_DAYS)),
        ),
      ),
    loadOpenBillCards(db, userId),
  ]);

  for (const bill of billRows) {
    if (!isUnpaidStatus(billStatusOnDate(bill, today))) continue;
    needed.set(bill.accountId, (needed.get(bill.accountId) ?? 0) + bill.totalCents);
  }
  for (const card of cards) {
    if (!needed.has(card.accountId)) continue;
    const open = derivedOpenBillRow(card, today);
    if (open) needed.set(card.accountId, (needed.get(card.accountId) ?? 0) + open.totalCents);
  }
  for (const [id, cents] of needed) needed.set(id, Math.max(0, cents));
  return needed;
}

interface DepositRow {
  account_id: string;
  last_deposit: string | null;
}

export async function loadCardReserves(
  d1: D1Database,
  db: Database,
  userId: string,
  today: string,
): Promise<CardReserves> {
  const planRows = await db
    .select()
    .from(cardPaymentPlans)
    .where(eq(cardPaymentPlans.userId, userId));

  const reservePlans = planRows.filter((plan) => plan.mode === "reserve");
  const unconfiguredCardIds = reservePlans
    .filter((plan) => sourceKey(plan) === null)
    .map((plan) => plan.accountId);
  const configured = reservePlans.filter((plan) => sourceKey(plan) !== null);

  const base = { plans: planRows.map(planDto), unconfiguredCardIds };
  if (configured.length === 0) return { ...base, reserves: [] };

  const cardIds = configured.map((plan) => plan.accountId);
  const sourceAccountIds = [
    ...new Set(
      configured.flatMap((plan) => (plan.reserveAccountId ? [plan.reserveAccountId] : [])),
    ),
  ];
  const sourceInvestmentIds = [
    ...new Set(
      configured.flatMap((plan) => (plan.reserveInvestmentId ? [plan.reserveInvestmentId] : [])),
    ),
  ];

  const [needed, cardRows, accountRows, investmentRows, depositRows] = await Promise.all([
    neededByCard(db, userId, cardIds, today),
    db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), inArray(accounts.id, cardIds))),
    sourceAccountIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: accounts.id,
            name: accounts.name,
            institutionName: accounts.institutionName,
            balanceCents: accounts.balanceCents,
          })
          .from(accounts)
          .where(and(eq(accounts.userId, userId), inArray(accounts.id, sourceAccountIds))),
    sourceInvestmentIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: investments.id,
            name: investments.name,
            institutionName: institutions.name,
            balanceCents: investments.balanceCents,
          })
          .from(investments)
          .innerJoin(connections, eq(connections.id, investments.connectionId))
          .leftJoin(institutions, eq(institutions.id, connections.institutionId))
          .where(and(eq(investments.userId, userId), inArray(investments.id, sourceInvestmentIds))),
    sourceAccountIds.length === 0
      ? Promise.resolve({ results: [] as DepositRow[] })
      : d1
          .prepare(
            `SELECT account_id, MAX(date) AS last_deposit FROM transactions
              WHERE user_id = ? AND amount_cents > 0
                AND account_id IN (${sourceAccountIds.map(() => "?").join(", ")})
              GROUP BY account_id`,
          )
          .bind(userId, ...sourceAccountIds)
          .all<DepositRow>(),
  ]);

  const cardNames = new Map(cardRows.map((row) => [row.id, row.name]));
  const lastDeposit = new Map(depositRows.results.map((row) => [row.account_id, row.last_deposit]));

  const groups = new Map<string, PlanRow[]>();
  for (const plan of configured) {
    const key = sourceKey(plan)!;
    groups.set(key, [...(groups.get(key) ?? []), plan]);
  }

  const reserves: ReserveStatus[] = [];
  for (const plans of groups.values()) {
    const first = plans[0]!;
    const source = first.reserveAccountId
      ? accountRows.find((row) => row.id === first.reserveAccountId)
      : investmentRows.find((row) => row.id === first.reserveInvestmentId);
    // Fonte apagada entre a leitura do plano e esta (o FK zera a coluna).
    if (!source) continue;

    const cards = plans.map((plan) => ({
      accountId: plan.accountId,
      name: cardNames.get(plan.accountId) ?? "Cartão",
      neededCents: needed.get(plan.accountId) ?? 0,
    }));
    const neededCents = cards.reduce((total, card) => total + card.neededCents, 0);
    const depositDate = first.reserveAccountId
      ? (lastDeposit.get(first.reserveAccountId) ?? null)
      : null;

    reserves.push({
      source: {
        kind: first.reserveAccountId ? "account" : "investment",
        id: source.id,
        name: source.name,
        institutionName: source.institutionName ?? null,
      },
      cards,
      neededCents,
      reservedCents: source.balanceCents,
      gapCents: Math.max(0, neededCents - source.balanceCents),
      lastDepositDate: depositDate,
      spentSinceDepositCents:
        depositDate === null
          ? null
          : await spentSince(
              d1,
              userId,
              plans.map((plan) => plan.accountId),
              depositDate,
            ),
    });
  }

  return { ...base, reserves };
}

/**
 * Compras líquidas (despesas − estornos) nos cartões **depois** do dia do último
 * depósito. O próprio dia fica fora: não dá para saber se a compra veio antes
 * ou depois do depósito, e o "falta guardar" já é o número que manda.
 */
async function spentSince(
  d1: D1Database,
  userId: string,
  cardIds: readonly string[],
  date: string,
): Promise<number> {
  const row = await d1
    .prepare(
      `SELECT COALESCE(SUM(-amount_cents), 0) AS spent FROM transactions
        WHERE user_id = ? AND date > ? AND type IN ('expense', 'income')
          AND account_id IN (${cardIds.map(() => "?").join(", ")})`,
    )
    .bind(userId, date, ...cardIds)
    .first<{ spent: number }>();
  return Math.max(0, row?.spent ?? 0);
}
