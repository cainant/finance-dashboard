import { z } from "zod";

import {
  amountCentsSchema,
  currencySchema,
  hexColorSchema,
  idSchema,
  isoDateSchema,
  paginatedSchema,
  slugSchema,
} from "./common";
import { granularitySchema, providerIdSchema } from "./enums";

import { accountSchema } from "./entities/account";
import { billSchema, upcomingBillSchema } from "./entities/bill";
import { categorySchema } from "./entities/category";
import { connectionSchema } from "./entities/connection";
import { creditCardSchema } from "./entities/credit-card";
import { investmentSchema } from "./entities/investment";
import { settingsSchema } from "./entities/settings";
import { budgetProgressSchema, budgetSchema } from "./entities/budget";
import { cardPaymentPlanSchema, cardReservesSchema } from "./entities/card-reserve";
import { syncRunSchema } from "./entities/sync-run";
import { transactionSchema } from "./entities/transaction";
import { userSchema } from "./entities/user";
import { periodSchema } from "./queries";

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

/** `GET /api/health`. */
export const healthResponse = z.object({
  status: z.literal("ok"),
  env: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponse>;

/** Resposta de login/setup/me: o usuário nunca inclui `password_hash`. */
export const sessionResponse = z.object({
  user: userSchema,
});
export type SessionResponse = z.infer<typeof sessionResponse>;

/** Resposta genérica de operações sem payload (ex.: `DELETE /api/connections/:id`). */
export const okResponse = z.object({
  ok: z.literal(true),
});
export type OkResponse = z.infer<typeof okResponse>;

/** `POST /api/auth/logout`. */
export const logoutResponse = okResponse;
export type LogoutResponse = z.infer<typeof logoutResponse>;

/** `GET /api/auth/providers`: métodos habilitados no ambiente. */
export const authProvidersResponse = z.object({
  password: z.object({
    enabled: z.boolean(),
  }),
  github: z.object({
    enabled: z.boolean(),
    /** Rota que inicia o OAuth (`GET /api/auth/github`). */
    loginUrl: z.string().min(1),
  }),
  /** `true` quando ainda não existe nenhum usuário (UI deve abrir `/setup`). */
  setupRequired: z.boolean(),
});
export type AuthProvidersResponse = z.infer<typeof authProvidersResponse>;

/* -------------------------------------------------------------------------- */
/* Overview e analytics                                                       */
/* -------------------------------------------------------------------------- */

/**
 * KPI com comparação ao período anterior de mesmo tamanho.
 * - `income`/`expenses`: valores absolutos positivos;
 * - `deltaCents` = `currentCents - previousCents`;
 * - `deltaPercent` é `null` quando `previousCents` é 0.
 */
export const overviewKpiSchema = z.object({
  currentCents: amountCentsSchema,
  previousCents: amountCentsSchema,
  deltaCents: amountCentsSchema,
  deltaPercent: z.number().nullable(),
});
export type OverviewKpi = z.infer<typeof overviewKpiSchema>;

/**
 * `GET /api/overview?from&to`.
 * KPIs: saldo consolidado de contas (sem cartões), receitas, despesas,
 * resultado (receitas - despesas) e patrimônio líquido (contas +
 * investimentos - faturas abertas).
 */
export const overviewResponse = z.object({
  period: periodSchema,
  previousPeriod: periodSchema,
  currency: currencySchema,
  kpis: z.object({
    balance: overviewKpiSchema,
    income: overviewKpiSchema,
    expenses: overviewKpiSchema,
    result: overviewKpiSchema,
    netWorth: overviewKpiSchema,
  }),
});
export type OverviewResponse = z.infer<typeof overviewResponse>;

/** Ponto de fluxo de caixa. `date` é o início do bucket (dia/semana/mês). */
export const cashflowPointSchema = z.object({
  date: isoDateSchema,
  incomeCents: amountCentsSchema,
  expenseCents: amountCentsSchema,
  netCents: amountCentsSchema,
});
export type CashflowPoint = z.infer<typeof cashflowPointSchema>;

export const cashflowResponse = z.object({
  data: z.array(cashflowPointSchema),
  period: periodSchema,
  granularity: granularitySchema,
});
export type CashflowResponse = z.infer<typeof cashflowResponse>;

/** Item do ranking de categorias. `percentage` em 0-100. */
export const categoryBreakdownItemSchema = z.object({
  categoryId: idSchema.nullable(),
  name: z.string().min(1),
  slug: slugSchema,
  icon: z.string().min(1),
  color: hexColorSchema,
  amountCents: amountCentsSchema,
  percentage: z.number().min(0).max(100),
  transactionCount: z.number().int().nonnegative(),
});
export type CategoryBreakdownItem = z.infer<typeof categoryBreakdownItemSchema>;

export const categoryBreakdownResponse = z.object({
  data: z.array(categoryBreakdownItemSchema),
  period: periodSchema,
  type: z.enum(["expense", "income"]),
  totalCents: amountCentsSchema,
});
export type CategoryBreakdownResponse = z.infer<typeof categoryBreakdownResponse>;

/** Ponto de evolução patrimonial. `netWorthCents = assets - liabilities`. */
export const netWorthPointSchema = z.object({
  date: isoDateSchema,
  assetsCents: amountCentsSchema,
  liabilitiesCents: amountCentsSchema,
  netWorthCents: amountCentsSchema,
});
export type NetWorthPoint = z.infer<typeof netWorthPointSchema>;

export const netWorthResponse = z.object({
  data: z.array(netWorthPointSchema),
  period: periodSchema,
});
export type NetWorthResponse = z.infer<typeof netWorthResponse>;

/** Resumo mensal receitas x despesas (`month` = `YYYY-MM`). */
export const monthlySummarySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "mês deve ser YYYY-MM"),
  incomeCents: amountCentsSchema,
  expenseCents: amountCentsSchema,
  netCents: amountCentsSchema,
});
export type MonthlySummary = z.infer<typeof monthlySummarySchema>;

export const monthlyResponse = z.object({
  data: z.array(monthlySummarySchema),
});
export type MonthlyResponse = z.infer<typeof monthlyResponse>;

/* -------------------------------------------------------------------------- */
/* Listas                                                                    */
/* -------------------------------------------------------------------------- */

export const accountsResponse = z.object({
  data: z.array(accountSchema),
});
export type AccountsResponse = z.infer<typeof accountsResponse>;

export const transactionsResponse = paginatedSchema(transactionSchema);
export type TransactionsResponse = z.infer<typeof transactionsResponse>;

/** Contagem de lançamentos por categoria (agregado do filtro inteiro). */
export const transactionsSummaryCategorySchema = z.object({
  /** `null` = sem categoria. */
  categoryId: idSchema.nullable(),
  count: z.number().int().nonnegative(),
});
export type TransactionsSummaryCategory = z.infer<typeof transactionsSummaryCategorySchema>;

/**
 * `GET /api/transactions/summary?<mesmos filtros da lista>`.
 *
 * Agrega **todo** o filtro em SQL (não só a página carregada): receitas,
 * despesas e resultado, o total de lançamentos (`totalCount`, base do rodapé
 * "50 de N") e a contagem por categoria usada na coluna lateral.
 *
 * `expensesCents` é positivo (como em `/api/overview`) e `resultCents` =
 * `incomeCents - expensesCents`. Receitas/despesas seguem a regra das
 * agregações (só `income`/`expense` e `status = 'posted'`), então o mesmo
 * período devolve os mesmos números de `/api/overview`. `totalCount` e as
 * contagens por categoria contam **tudo** que a lista mostra (pendentes e
 * transferências incluídos), porque fecham com as linhas e com o rodapé.
 */
export const transactionsSummaryResponse = z.object({
  period: periodSchema,
  totalCount: z.number().int().nonnegative(),
  incomeCents: amountCentsSchema,
  expensesCents: amountCentsSchema,
  resultCents: amountCentsSchema,
  categories: z.array(transactionsSummaryCategorySchema),
});
export type TransactionsSummaryResponse = z.infer<typeof transactionsSummaryResponse>;

/**
 * `GET /api/transactions/uncategorized-count`.
 * Contador global (sem período) das transações sem categoria do usuário.
 */
export const uncategorizedCountResponse = z.object({
  count: z.number().int().nonnegative(),
});
export type UncategorizedCountResponse = z.infer<typeof uncategorizedCountResponse>;

export const categoriesResponse = z.object({
  data: z.array(categorySchema),
});
export type CategoriesResponse = z.infer<typeof categoriesResponse>;

export const creditCardsResponse = z.object({
  data: z.array(creditCardSchema),
});
export type CreditCardsResponse = z.infer<typeof creditCardsResponse>;

export const billsResponse = z.object({
  data: z.array(billSchema),
});
export type BillsResponse = z.infer<typeof billsResponse>;

export const upcomingBillsResponse = z.object({
  data: z.array(upcomingBillSchema),
});
export type UpcomingBillsResponse = z.infer<typeof upcomingBillsResponse>;

export const investmentsResponse = z.object({
  data: z.array(investmentSchema),
});
export type InvestmentsResponse = z.infer<typeof investmentsResponse>;

export const connectionsResponse = z.object({
  data: z.array(connectionSchema),
});
export type ConnectionsResponse = z.infer<typeof connectionsResponse>;

export const syncRunsResponse = z.object({
  data: z.array(syncRunSchema),
});
export type SyncRunsResponse = z.infer<typeof syncRunsResponse>;

/** `POST /api/connections/:id/sync` -> execução criada. */
export const syncRunResponse = z.object({
  data: syncRunSchema,
});
export type SyncRunResponse = z.infer<typeof syncRunResponse>;

export const settingsResponse = z.object({
  data: settingsSchema,
});
export type SettingsResponse = z.infer<typeof settingsResponse>;

/** `GET /api/providers`: providers habilitados e configurados no ambiente. */
export const providerInfoSchema = z.object({
  id: providerIdSchema,
  name: z.string().min(1),
  /** `false` quando faltam secrets/configuração (ver `wrangler.jsonc`). */
  configured: z.boolean(),
  description: z.string().nullable(),
  /** `true` quando o provider usa o widget Pluggy Connect. */
  supportsConnectWidget: z.boolean(),
});
export type ProviderInfo = z.infer<typeof providerInfoSchema>;

export const providersResponse = z.object({
  data: z.array(providerInfoSchema),
});
export type ProvidersResponse = z.infer<typeof providersResponse>;

/** `POST /api/providers/pluggy/connect-token` -> token do widget (TTL 30 min). */
export const connectTokenResponse = z.object({
  accessToken: z.string().min(1),
  /**
   * Id do conector MeuPluggy resolvido via `GET /connectors` (nunca um segredo).
   * A UI usa em `connectorIds` para restringir o widget a esse conector.
   * `null` quando o backend não conseguiu resolver (o widget abre sem filtro).
   */
  connectorId: z.number().int().positive().nullable(),
});
export type ConnectTokenResponse = z.infer<typeof connectTokenResponse>;

/** `GET/PUT /api/budget` e `PUT /api/budget/categories/:categoryId`. */
export const budgetResponse = z.object({
  data: budgetSchema,
});
export type BudgetResponse = z.infer<typeof budgetResponse>;

/** `GET /api/budget/progress`. */
export const budgetProgressResponse = z.object({
  data: budgetProgressSchema,
});
export type BudgetProgressResponse = z.infer<typeof budgetProgressResponse>;

/** `GET /api/card-reserves`. */
export const cardReservesResponse = z.object({
  data: cardReservesSchema,
});
export type CardReservesResponse = z.infer<typeof cardReservesResponse>;

/** `PUT /api/credit-cards/:id/payment-plan`. */
export const cardPaymentPlanResponse = z.object({
  data: cardPaymentPlanSchema,
});
export type CardPaymentPlanResponse = z.infer<typeof cardPaymentPlanResponse>;
