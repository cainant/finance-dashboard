import { z } from "zod";

import {
  addDays,
  idSchema,
  isoDateSchema,
  PERIOD_DEFAULT_DAYS,
  todayIsoDate,
  type IsoDate,
} from "./common";
import { granularitySchema, transactionSortSchema, transactionTypeSchema } from "./enums";
import { isoMonthSchema } from "./entities/budget";

/** Período resolvido (`from` e `to` inclusivos, datas civis ISO). */
export const periodSchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
});
export type Period = z.infer<typeof periodSchema>;

/** Campos crus de período aceitos em query string. */
export const periodFields = {
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
} as const;

export interface PeriodInput {
  from?: IsoDate;
  to?: IsoDate;
}

/**
 * Resolve `{ from, to }` com defaults de "últimos 30 dias" (30 dias
 * inclusivos: `from = to - 29`). `to` default = hoje (UTC).
 */
export function resolvePeriod(
  input: PeriodInput,
  ctx: z.RefinementCtx,
  now: () => Date = () => new Date(),
): Period | null {
  const to = input.to ?? todayIsoDate(now());
  const from = input.from ?? addDays(to, -(PERIOD_DEFAULT_DAYS - 1));

  if (from > to) {
    ctx.addIssue({
      code: "custom",
      path: ["from"],
      message: "`from` não pode ser posterior a `to`",
    });
    return null;
  }

  return { from, to };
}

/**
 * `from`/`to` opcionais com default dos últimos 30 dias.
 * Use `createPeriodQuery(now)` para testes determinísticos.
 */
export function createPeriodQuery(now: () => Date = () => new Date()) {
  return z.object(periodFields).transform((value, ctx) => {
    const period = resolvePeriod(value, ctx, now);
    if (!period) return z.NEVER;
    return period;
  });
}

export const periodQuery = createPeriodQuery();
export type PeriodQuery = z.infer<typeof periodQuery>;

/** Paginação por cursor: `limit` default 50, máximo 200. */
export const paginationQuery = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

/** Filtros de `GET /api/transactions` (input: query string). */
export const transactionFilterFields = {
  ...periodFields,
  accountId: idSchema.optional(),
  categoryId: idSchema.optional(),
  type: transactionTypeSchema.optional(),
  /**
   * `true` = só transações sem categoria. Mesma regra de
   * `GET /api/transactions/uncategorized-count`: `categoryId = null`,
   * `status = posted` e `type` em `income`/`expense` (sem transferências).
   */
  uncategorized: z.stringbool().optional(),
  /** `true` = só transações pendentes (`status = pending`, qualquer tipo). */
  pending: z.stringbool().optional(),
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value ? value : undefined)),
} as const;

/** Filtros de `GET /api/transactions` (input: query string). */
export const transactionsQueryInput = z.object({
  ...transactionFilterFields,
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sort: transactionSortSchema.default("date_desc"),
});
export type TransactionsQueryInput = z.infer<typeof transactionsQueryInput>;

/** `GET /api/transactions`: período resolvido + filtros + paginação. */
export function createTransactionsQuery(now: () => Date = () => new Date()) {
  return transactionsQueryInput.transform((value, ctx) => {
    const period = resolvePeriod(value, ctx, now);
    if (!period) return z.NEVER;
    return { ...value, ...period };
  });
}

export const transactionsQuery = createTransactionsQuery();
export type TransactionsQuery = z.infer<typeof transactionsQuery>;

/**
 * `GET /api/transactions/summary`: os filtros da lista sem paginação nem
 * ordenação (o resumo sempre cobre o filtro inteiro).
 */
export function createTransactionsSummaryQuery(now: () => Date = () => new Date()) {
  return transactionsQueryInput
    .omit({ cursor: true, limit: true, sort: true })
    .transform((value, ctx) => {
      const period = resolvePeriod(value, ctx, now);
      if (!period) return z.NEVER;
      return { ...value, ...period };
    });
}

export const transactionsSummaryQuery = createTransactionsSummaryQuery();
export type TransactionsSummaryQuery = z.infer<typeof transactionsSummaryQuery>;

/** `GET /api/analytics/cashflow`. */
export function createCashflowQuery(now: () => Date = () => new Date()) {
  return z
    .object({
      ...periodFields,
      granularity: granularitySchema.default("day"),
    })
    .transform((value, ctx) => {
      const period = resolvePeriod(value, ctx, now);
      if (!period) return z.NEVER;
      return { ...value, ...period };
    });
}

export const cashflowQuery = createCashflowQuery();
export type CashflowQuery = z.infer<typeof cashflowQuery>;

/** `GET /api/analytics/categories?from&to&type`. */
export function createCategoryBreakdownQuery(now: () => Date = () => new Date()) {
  return z
    .object({
      ...periodFields,
      type: z.enum(["expense", "income"]).default("expense"),
    })
    .transform((value, ctx) => {
      const period = resolvePeriod(value, ctx, now);
      if (!period) return z.NEVER;
      return { ...value, ...period };
    });
}

export const categoryBreakdownQuery = createCategoryBreakdownQuery();
export type CategoryBreakdownQuery = z.infer<typeof categoryBreakdownQuery>;

/** `GET /api/analytics/net-worth` (mesmo período do overview). */
export const netWorthQuery = createPeriodQuery();
export type NetWorthQuery = z.infer<typeof netWorthQuery>;

/** `GET /api/budget/progress?month=YYYY-MM` (default: mês corrente em UTC). */
export const budgetProgressQuery = z.object({
  month: isoMonthSchema.optional(),
});
export type BudgetProgressQuery = z.infer<typeof budgetProgressQuery>;

/** `GET /api/analytics/monthly?months=12` (máximo 36). */
export const monthlyQuery = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
});
export type MonthlyQuery = z.infer<typeof monthlyQuery>;

/** `GET /api/bills/upcoming?days=30&limit=5`. */
export const upcomingBillsQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(50).default(5),
});
export type UpcomingBillsQuery = z.infer<typeof upcomingBillsQuery>;

/**
 * `POST /api/connections/:id/sync?refresh=true`.
 *
 * `refresh` pede ao provider uma atualização do item antes da leitura. No
 * MeuPluggy é no-op (o conector não aceita `PATCH /items`); a UI manda `true`
 * só na primeira chamada de um sync manual.
 */
export const syncConnectionQuery = z.object({
  refresh: z.stringbool().default(false),
});
export type SyncConnectionQuery = z.infer<typeof syncConnectionQuery>;

/** `GET /api/connections/:id/sync-runs?limit=20`. */
export const syncRunsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type SyncRunsQuery = z.infer<typeof syncRunsQuery>;
