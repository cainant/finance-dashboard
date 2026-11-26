import { z } from "zod";

/** Tipos de conta financeira exibidos no app. */
export const ACCOUNT_TYPES = ["checking", "savings", "credit_card", "investment", "other"] as const;
export const accountTypeSchema = z.enum(ACCOUNT_TYPES);
export type AccountType = z.infer<typeof accountTypeSchema>;

/** Situação da conexão com o provider (Open Finance). */
export const CONNECTION_STATUSES = [
  "active",
  "syncing",
  "error",
  "login_required",
  "outdated",
  "disconnected",
] as const;
export const connectionStatusSchema = z.enum(CONNECTION_STATUSES);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

/** Tipo derivado da transação (o sinal vem de `amountCents`). */
export const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;
export const transactionTypeSchema = z.enum(TRANSACTION_TYPES);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

/** Status de uma transação no provider. */
export const TRANSACTION_STATUSES = ["posted", "pending"] as const;
export const transactionStatusSchema = z.enum(TRANSACTION_STATUSES);
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

/**
 * Status de fatura derivado de datas/pagamentos (o Pluggy não envia status):
 * `open` (fechamento futuro), `closed` (fechada e não paga), `paid` e `overdue`.
 */
export const BILL_STATUSES = ["open", "closed", "paid", "overdue"] as const;
export const billStatusSchema = z.enum(BILL_STATUSES);
export type BillStatus = z.infer<typeof billStatusSchema>;

/** Natureza da categoria. */
export const CATEGORY_KINDS = ["income", "expense", "transfer"] as const;
export const categoryKindSchema = z.enum(CATEGORY_KINDS);
export type CategoryKind = z.infer<typeof categoryKindSchema>;

/** Providers financeiros suportados. */
export const PROVIDER_IDS = ["demo", "pluggy"] as const;
export const providerIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof providerIdSchema>;

/** Tipos normalizados de investimento. */
export const INVESTMENT_TYPES = [
  "fixed_income",
  "fund",
  "equity",
  "etf",
  "security",
  "other",
] as const;
export const investmentTypeSchema = z.enum(INVESTMENT_TYPES);
export type InvestmentType = z.infer<typeof investmentTypeSchema>;

/** Status de uma execução de sincronização. */
export const SYNC_RUN_STATUSES = ["running", "success", "error"] as const;
export const syncRunStatusSchema = z.enum(SYNC_RUN_STATUSES);
export type SyncRunStatus = z.infer<typeof syncRunStatusSchema>;

/** Granularidade de séries temporais (cashflow). */
export const GRANULARITIES = ["day", "week", "month"] as const;
export const granularitySchema = z.enum(GRANULARITIES);
export type Granularity = z.infer<typeof granularitySchema>;

/** Ordenação aceita por `GET /api/transactions`. */
export const TRANSACTION_SORTS = ["date_desc", "date_asc", "amount_desc", "amount_asc"] as const;
export const transactionSortSchema = z.enum(TRANSACTION_SORTS);
export type TransactionSort = z.infer<typeof transactionSortSchema>;

/** Tema persistido nas settings do usuário. */
export const THEMES = ["dark", "light", "system"] as const;
export const themeSchema = z.enum(THEMES);
export type Theme = z.infer<typeof themeSchema>;
