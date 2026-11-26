import { API_PREFIX } from "./common";

/** Concatena o prefixo `/api` a um caminho. */
function route(path: string): string {
  return `${API_PREFIX}${path}`;
}

function withId(path: string, id: string, ...segments: string[]): string {
  return route([path, encodeURIComponent(id), ...segments].join("/"));
}

/**
 * Mapa tipado das rotas da API (fonte única para api e web).
 * Rotas com `:id` são funções para forçar o encoding do identificador.
 */
export const apiRoutes = {
  health: route("/health"),

  webhooks: {
    pluggy: route("/webhooks/pluggy"),
  },

  auth: {
    login: route("/auth/login"),
    logout: route("/auth/logout"),
    me: route("/auth/me"),
    setup: route("/auth/setup"),
    providers: route("/auth/providers"),
    github: route("/auth/github"),
    githubCallback: route("/auth/github/callback"),
  },

  overview: route("/overview"),

  analytics: {
    cashflow: route("/analytics/cashflow"),
    categories: route("/analytics/categories"),
    netWorth: route("/analytics/net-worth"),
    monthly: route("/analytics/monthly"),
  },

  accounts: route("/accounts"),
  account: (id: string) => withId("/accounts", id),

  transactions: route("/transactions"),
  transactionsSummary: route("/transactions/summary"),
  transactionsUncategorizedCount: route("/transactions/uncategorized-count"),
  transaction: (id: string) => withId("/transactions", id),

  categories: route("/categories"),

  creditCards: route("/credit-cards"),
  creditCardBills: (id: string) => withId("/credit-cards", id, "bills"),
  creditCardPaymentPlan: (id: string) => withId("/credit-cards", id, "payment-plan"),
  cardReserves: route("/card-reserves"),

  upcomingBills: route("/bills/upcoming"),
  billTransactions: (id: string) => withId("/bills", id, "transactions"),

  investments: route("/investments"),

  connections: route("/connections"),
  connection: (id: string) => withId("/connections", id),
  connectionSync: (id: string) => withId("/connections", id, "sync"),
  connectionSyncRuns: (id: string) => withId("/connections", id, "sync-runs"),

  providers: route("/providers"),
  pluggyConnectToken: route("/providers/pluggy/connect-token"),

  settings: route("/settings"),

  budget: route("/budget"),
  budgetProgress: route("/budget/progress"),
  budgetCategory: (categoryId: string) => withId("/budget/categories", categoryId),
} as const;

export type ApiRoutes = typeof apiRoutes;
