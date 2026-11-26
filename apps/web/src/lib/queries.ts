import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import type {
  CashflowQuery,
  CategoryBreakdownQuery,
  Period,
  SyncRunsQuery,
  TransactionsQuery,
  UpcomingBillsQuery,
} from "@fd/contracts";

import { ApiError, api } from "./api";

/* -------------------------------------------------------------------------- */
/* Política de retry                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Só vale a pena repetir falha de rede/5xx. 4xx é determinístico (sessão,
 * validação, permissão) e repetir apenas atrasa o estado de erro.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const apiError = ApiError.from(error);
  if (apiError.status >= 400 && apiError.status < 500) {
    return false;
  }

  return failureCount < 1;
}

/* -------------------------------------------------------------------------- */
/* Query keys                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Todas as chaves de cache ficam aqui para que invalidações sejam previsíveis.
 * O período e os filtros entram na chave: nunca reaproveite dados de outro
 * recorte.
 */
export const queryKeys = {
  auth: {
    providers: ["auth", "providers"] as const,
    me: ["auth", "me"] as const,
  },
  overview: (period: Period) => ["overview", period.from, period.to] as const,
  cashflow: (period: Period, granularity: CashflowQuery["granularity"]) =>
    ["analytics", "cashflow", period.from, period.to, granularity] as const,
  categoryBreakdown: (period: Period, type: CategoryBreakdownQuery["type"]) =>
    ["analytics", "categories", period.from, period.to, type] as const,
  netWorth: (period: Period) => ["analytics", "net-worth", period.from, period.to] as const,
  monthly: (months: number) => ["analytics", "monthly", months] as const,
  accounts: ["accounts"] as const,
  transactions: (filters: TransactionsFilters) =>
    [
      "transactions",
      filters.from,
      filters.to,
      filters.accountId ?? null,
      filters.categoryId ?? null,
      filters.type ?? null,
      filters.uncategorized ?? false,
      filters.pending ?? false,
      filters.q ?? null,
      filters.sort ?? "date_desc",
    ] as const,
  /**
   * Resumo do filtro (filtro inteiro, sem paginação): a mesma lista de filtros
   * da chave `transactions`, sem `sort`, porque carregar mais páginas não o
   * altera.
   */
  transactionsSummary: (filters: TransactionsFilters) =>
    [
      "transactions",
      "summary",
      filters.from,
      filters.to,
      filters.accountId ?? null,
      filters.categoryId ?? null,
      filters.type ?? null,
      filters.uncategorized ?? false,
      filters.pending ?? false,
      filters.q ?? null,
    ] as const,
  /** Contador global de transações sem categoria (badge da sidebar/alerta). */
  uncategorizedCount: ["transactions", "uncategorized-count"] as const,
  categories: ["categories"] as const,
  creditCards: ["credit-cards"] as const,
  cardReserves: ["card-reserves"] as const,
  creditCardBills: (id: string) => ["credit-cards", id, "bills"] as const,
  billTransactions: (id: string) => ["bills", id, "transactions"] as const,
  upcomingBills: (days: number, limit: number) => ["bills", "upcoming", days, limit] as const,
  investments: ["investments"] as const,
  connections: ["connections"] as const,
  syncRuns: (id: string) => ["connections", id, "sync-runs"] as const,
  providers: ["providers"] as const,
  settings: ["settings"] as const,
  budget: ["budget"] as const,
  /** Prefixo de todos os meses do realizado (invalidação). */
  budgetProgressAll: ["budget-progress"] as const,
  budgetProgress: (month: string) => ["budget-progress", month] as const,
} as const;

/* -------------------------------------------------------------------------- */
/* Query options                                                              */
/* -------------------------------------------------------------------------- */

export const authProvidersQueryOptions = queryOptions({
  queryKey: queryKeys.auth.providers,
  queryFn: ({ signal }) => api.auth.providers(signal),
  staleTime: 60_000,
  retry: false,
});

export const meQueryOptions = queryOptions({
  queryKey: queryKeys.auth.me,
  queryFn: ({ signal }) => api.auth.me(signal),
  staleTime: 5 * 60_000,
  retry: false,
});

export function overviewQueryOptions(period: Period) {
  return queryOptions({
    queryKey: queryKeys.overview(period),
    queryFn: ({ signal }) => api.overview(period, signal),
    staleTime: 60_000,
  });
}

export function cashflowQueryOptions(period: Period, granularity: CashflowQuery["granularity"]) {
  return queryOptions({
    queryKey: queryKeys.cashflow(period, granularity),
    queryFn: ({ signal }) => api.cashflow({ ...period, granularity }, signal),
  });
}

export function categoryBreakdownQueryOptions(
  period: Period,
  type: CategoryBreakdownQuery["type"],
) {
  return queryOptions({
    queryKey: queryKeys.categoryBreakdown(period, type),
    queryFn: ({ signal }) => api.categoryBreakdown({ ...period, type }, signal),
  });
}

export function netWorthQueryOptions(period: Period) {
  return queryOptions({
    queryKey: queryKeys.netWorth(period),
    queryFn: ({ signal }) => api.netWorth(period, signal),
  });
}

export function monthlyQueryOptions(months = 12) {
  return queryOptions({
    queryKey: queryKeys.monthly(months),
    queryFn: ({ signal }) => api.monthly({ months }, signal),
    staleTime: 5 * 60_000,
  });
}

export const accountsQueryOptions = queryOptions({
  queryKey: queryKeys.accounts,
  queryFn: ({ signal }) => api.accounts(signal),
});

/** Filtros do endpoint de transações (sem paginação). */
export type TransactionsFilters = {
  from: string;
  to: string;
  q?: string;
  accountId?: string;
  categoryId?: string;
  type?: TransactionsQuery["type"];
  /** `true` = só transações sem categoria (mesma regra da contagem global). */
  uncategorized?: boolean;
  /** `true` = só transações pendentes. */
  pending?: boolean;
  sort?: TransactionsQuery["sort"];
};

/**
 * Contador global (sem período) de transações sem categoria, usado pelo badge
 * da sidebar e pelo alerta da Visão geral. A regra é a mesma de
 * `transactionsInfiniteQueryOptions({ ..., uncategorized: true })`.
 */
export const uncategorizedCountQueryOptions = queryOptions({
  queryKey: queryKeys.uncategorizedCount,
  queryFn: ({ signal }) => api.transactionsUncategorizedCount(signal),
  staleTime: 60_000,
});

/**
 * Primeira página pequena (pintura rápida) e as seguintes no máximo aceito
 * pela API: a lista baixa o restante em segundo plano, então lotes maiores
 * gastam menos requests.
 */
const FIRST_PAGE_LIMIT = 50;
const NEXT_PAGE_LIMIT = 200;

export function transactionsInfiniteQueryOptions(filters: TransactionsFilters) {
  return infiniteQueryOptions({
    queryKey: queryKeys.transactions(filters),
    queryFn: ({ pageParam, signal }) =>
      api.transactions(
        {
          ...filters,
          cursor: pageParam ?? undefined,
          limit: pageParam ? NEXT_PAGE_LIMIT : FIRST_PAGE_LIMIT,
        },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.page.nextCursor ?? null,
    // Trocar de busca/filtro não derruba a lista atual: as páginas anteriores
    // ficam na tela (isPlaceholderData) até a resposta nova chegar. Sem isso a
    // tabela e o painel voltam ao esqueleto a cada mudança e o layout desloca.
    placeholderData: keepPreviousData,
  });
}

/**
 * Resumo de todo o filtro (receitas, despesas, resultado, total de lançamentos
 * e contagem por categoria). Agregado na API em SQL: o valor não muda quando a
 * lista carrega mais páginas, então não depende de `hasNextPage`.
 */
/**
 * Resumo de todo o filtro (receitas, despesas, resultado, total de lançamentos
 * e contagem por categoria). Agregado na API em SQL: o valor não muda quando a
 * lista carrega mais páginas, então não depende de `hasNextPage`.
 *
 * `keepPreviousData` mantém o resumo anterior na tela enquanto o novo filtro
 * carrega (mesma janela que a lista com `keepPreviousData`): sem isso o card
 * voltaria a skeleton a cada busca, embora a lista continuasse mostrando
 * linhas. O card e o rodapé leem **este** snapshot (nunca `transactions.length`
 * como total) e marcam `aria-busy` enquanto ele é o anterior.
 */
export function transactionsSummaryQueryOptions(filters: TransactionsFilters) {
  return queryOptions({
    queryKey: queryKeys.transactionsSummary(filters),
    queryFn: ({ signal }) =>
      api.transactionsSummary(
        {
          from: filters.from,
          to: filters.to,
          q: filters.q,
          accountId: filters.accountId,
          categoryId: filters.categoryId,
          type: filters.type,
          uncategorized: filters.uncategorized,
          pending: filters.pending,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
}

export const categoriesQueryOptions = queryOptions({
  queryKey: queryKeys.categories,
  queryFn: ({ signal }) => api.categories(signal),
  staleTime: 5 * 60_000,
});

export const creditCardsQueryOptions = queryOptions({
  queryKey: queryKeys.creditCards,
  queryFn: ({ signal }) => api.creditCards(signal),
});

export const cardReservesQueryOptions = queryOptions({
  queryKey: queryKeys.cardReserves,
  queryFn: ({ signal }) => api.cardReserves(signal),
});

export function creditCardBillsQueryOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.creditCardBills(id),
    queryFn: ({ signal }) => api.creditCardBills(id, signal),
  });
}

export function billTransactionsQueryOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.billTransactions(id),
    queryFn: ({ signal }) => api.billTransactions(id, signal),
  });
}

export function upcomingBillsQueryOptions(query: UpcomingBillsQuery) {
  return queryOptions({
    queryKey: queryKeys.upcomingBills(query.days ?? 30, query.limit ?? 5),
    queryFn: ({ signal }) => api.upcomingBills(query, signal),
  });
}

export const investmentsQueryOptions = queryOptions({
  queryKey: queryKeys.investments,
  queryFn: ({ signal }) => api.investments(signal),
});

export const connectionsQueryOptions = queryOptions({
  queryKey: queryKeys.connections,
  queryFn: ({ signal }) => api.connections(signal),
});

export function syncRunsQueryOptions(id: string, query: SyncRunsQuery = { limit: 20 }) {
  return queryOptions({
    queryKey: queryKeys.syncRuns(id),
    queryFn: ({ signal }) => api.syncRuns(id, query, signal),
    staleTime: 15_000,
  });
}

export const providersQueryOptions = queryOptions({
  queryKey: queryKeys.providers,
  queryFn: ({ signal }) => api.providers(signal),
  staleTime: 5 * 60_000,
});

export const settingsQueryOptions = queryOptions({
  queryKey: queryKeys.settings,
  queryFn: ({ signal }) => api.settings(signal),
  staleTime: 5 * 60_000,
});

export const budgetQueryOptions = queryOptions({
  queryKey: queryKeys.budget,
  queryFn: ({ signal }) => api.budget(signal),
  staleTime: 5 * 60_000,
});

export function budgetProgressQueryOptions(month: string) {
  return queryOptions({
    queryKey: queryKeys.budgetProgress(month),
    queryFn: ({ signal }) => api.budgetProgress({ month }, signal),
    placeholderData: keepPreviousData,
  });
}

/** Ordenação aceita pelo endpoint de transações. */
export type TransactionSort = NonNullable<TransactionsQuery["sort"]>;

/** Últimas transações do período (visão geral e resumos). */
export function recentTransactionsQueryOptions(period: Period, limit = 6) {
  return queryOptions({
    queryKey: [...queryKeys.transactions({ ...period, sort: "date_desc" }), "recent", limit],
    queryFn: ({ signal }) => api.transactions({ ...period, sort: "date_desc", limit }, signal),
  });
}

/** Transações de uma conta específica (detalhe da conta). */
export function accountTransactionsQueryOptions(accountId: string, period: Period, limit = 100) {
  return queryOptions({
    queryKey: ["transactions", "account", accountId, period.from, period.to, limit] as const,
    queryFn: ({ signal }) =>
      api.transactions({ ...period, accountId, sort: "date_desc", limit }, signal),
  });
}
