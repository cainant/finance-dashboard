import {
  accountsResponse,
  apiErrorSchema,
  apiRoutes,
  authProvidersResponse,
  billsResponse,
  budgetProgressResponse,
  budgetResponse,
  cardPaymentPlanResponse,
  cardReservesResponse,
  cashflowResponse,
  categoriesResponse,
  categoryBreakdownResponse,
  connectTokenResponse,
  connectionsResponse,
  creditCardsResponse,
  investmentsResponse,
  monthlyResponse,
  netWorthResponse,
  okResponse,
  overviewResponse,
  providersResponse,
  sessionResponse,
  settingsResponse,
  syncRunResponse,
  syncRunsResponse,
  transactionSchema,
  transactionsResponse,
  transactionsSummaryResponse,
  uncategorizedCountResponse,
  upcomingBillsResponse,
  type BudgetProgressQuery,
  type CashflowQuery,
  type CategoryBreakdownQuery,
  type CreateConnectionBody,
  type LoginBody,
  type MonthlyQuery,
  type Period,
  type SetupBody,
  type SyncRunsQuery,
  type TransactionsQuery,
  type UpdateBudgetBody,
  type UpdateBudgetCategoryBody,
  type UpdateCardPaymentPlanBody,
  type UpdateSettingsBody,
  type UpdateTransactionBody,
  type UpcomingBillsQuery,
} from "@fd/contracts";
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Erros                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Erro tipado da API. `code` vem do envelope `{ error: { code, message } }`
 * definido em `docs/architecture.md`; `status` é o HTTP (0 = falha de rede).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  static from(error: unknown): ApiError {
    if (error instanceof ApiError) {
      return error;
    }

    if (error instanceof Error) {
      return new ApiError(0, "network_error", error.message);
    }

    return new ApiError(0, "unknown_error", "Erro inesperado ao falar com a API.");
  }
}

/** Mensagem legível para qualquer erro (usada em toasts e estados de erro). */
export function errorMessage(error: unknown): string {
  return ApiError.from(error).message;
}

/* -------------------------------------------------------------------------- */
/* Sessão                                                                     */
/* -------------------------------------------------------------------------- */

let redirectingToLogin = false;

/**
 * Redireciona para /login preservando a rota atual em `?redirect=`.
 * Chamado quando uma resposta autenticada retorna 401 (sessão expirada).
 */
export function redirectToLogin(): void {
  if (typeof window === "undefined" || redirectingToLogin) {
    return;
  }

  const { pathname, search, hash } = window.location;
  if (pathname === "/login" || pathname === "/setup") {
    return;
  }

  redirectingToLogin = true;
  const redirect = `${pathname}${search}${hash}`;
  window.location.assign(`/login?redirect=${encodeURIComponent(redirect)}`);
}

/* -------------------------------------------------------------------------- */
/* Cliente HTTP                                                               */
/* -------------------------------------------------------------------------- */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequestOptions<T> {
  method?: HttpMethod;
  body?: unknown;
  /** Schema Zod de `@fd/contracts` usado para validar a resposta (em dev). */
  schema?: z.ZodType<T>;
  signal?: AbortSignal;
  /**
   * Não redirecionar em 401. Usado pela própria checagem de sessão, que trata
   * o caso como "visitante" em vez de "sessão expirada".
   */
  skipAuthRedirect?: boolean;
}

const JSON_HEADERS = {
  accept: "application/json",
  "X-Requested-With": "fetch",
} as const;

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json");
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return undefined;
  }

  const text = await response.text();
  if (!text) {
    return undefined;
  }

  if (!isJsonResponse(response)) {
    return text;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function toApiError(status: number, body: unknown): ApiError {
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    return new ApiError(
      status,
      parsed.data.error.code,
      parsed.data.error.message,
      parsed.data.error.details,
    );
  }

  const fallback =
    status === 401
      ? "Sua sessão expirou. Entre novamente."
      : status === 403
        ? "Você não tem permissão para esta ação."
        : status === 404
          ? "Recurso não encontrado."
          : status >= 500
            ? "A API encontrou um erro. Tente novamente em instantes."
            : `A requisição falhou (HTTP ${status}).`;

  return new ApiError(status, `http_${status}`, fallback);
}

/**
 * Requisição JSON para a API na mesma origem.
 * - `credentials: "same-origin"` para enviar o cookie `fd_session`;
 * - `X-Requested-With: fetch` como defesa simples contra CSRF de formulários;
 * - valida a resposta com o schema de `@fd/contracts` (erro em dev, aviso em prod).
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions<T> = {}): Promise<T> {
  const { method = "GET", body, schema, signal, skipAuthRedirect = false } = options;

  const headers: Record<string, string> = { ...JSON_HEADERS };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new ApiError(
      0,
      "network_error",
      "Não foi possível falar com a API. Verifique sua conexão e tente novamente.",
    );
  }

  const payload = await readBody(response);

  if (!response.ok) {
    if (response.status === 401 && !skipAuthRedirect) {
      redirectToLogin();
    }

    throw toApiError(response.status, payload);
  }

  if (!schema) {
    return payload as T;
  }

  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }

  if (import.meta.env.DEV) {
    throw new ApiError(
      response.status,
      "invalid_response",
      `Resposta de ${path} não corresponde ao contrato: ${z.prettifyError(parsed.error)}`,
      parsed.error.issues,
    );
  }

  console.warn(`[api] resposta fora do contrato em ${path}`, parsed.error.issues);
  return payload as T;
}

/* -------------------------------------------------------------------------- */
/* Helpers de query string                                                    */
/* -------------------------------------------------------------------------- */

type QueryValue = string | number | boolean | null | undefined;

function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                  */
/* -------------------------------------------------------------------------- */

export interface HealthResponse {
  status: "ok";
  env: string;
}

/** `GET /api/health` (usado em smoke tests e diagnóstico). */
export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiRequest<HealthResponse>(apiRoutes.health, { signal, skipAuthRedirect: true });
}

export interface TransactionsParams {
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
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}

/** Filtros de `GET /api/transactions/summary` (os da lista, sem paginação). */
export type TransactionsSummaryParams = Omit<TransactionsParams, "cursor" | "limit" | "sort">;

/** Resposta de `GET /api/bills/:id/transactions` (contrato aceita lista simples). */
const billTransactionsResponse = z.object({ data: z.array(transactionSchema) });

/** Resposta de mutações que devolvem o registro criado (ex.: conexão demo). */
const createdResourceResponse = z.object({ data: z.object({ id: z.string() }) });

export const api = {
  auth: {
    /** `GET /api/auth/providers` — métodos habilitados no ambiente. */
    providers(signal?: AbortSignal) {
      return apiRequest(apiRoutes.auth.providers, {
        schema: authProvidersResponse,
        signal,
        skipAuthRedirect: true,
      });
    },

    /** `GET /api/auth/me` — usuário da sessão. 401 quando não autenticado. */
    me(signal?: AbortSignal) {
      return apiRequest(apiRoutes.auth.me, {
        schema: sessionResponse,
        signal,
        skipAuthRedirect: true,
      });
    },

    login(body: LoginBody) {
      return apiRequest(apiRoutes.auth.login, {
        method: "POST",
        body,
        schema: sessionResponse,
        skipAuthRedirect: true,
      });
    },

    setup(body: SetupBody) {
      return apiRequest(apiRoutes.auth.setup, {
        method: "POST",
        body,
        schema: sessionResponse,
        skipAuthRedirect: true,
      });
    },

    logout() {
      return apiRequest(apiRoutes.auth.logout, {
        method: "POST",
        schema: okResponse,
        skipAuthRedirect: true,
      });
    },
  },

  overview(period: Period, signal?: AbortSignal) {
    return apiRequest(`${apiRoutes.overview}${buildQuery(period)}`, {
      schema: overviewResponse,
      signal,
    });
  },

  cashflow(query: CashflowQuery, signal?: AbortSignal) {
    return apiRequest(`${apiRoutes.analytics.cashflow}${buildQuery(query)}`, {
      schema: cashflowResponse,
      signal,
    });
  },

  categoryBreakdown(query: CategoryBreakdownQuery, signal?: AbortSignal) {
    return apiRequest(`${apiRoutes.analytics.categories}${buildQuery(query)}`, {
      schema: categoryBreakdownResponse,
      signal,
    });
  },

  netWorth(period: Period, signal?: AbortSignal) {
    return apiRequest(`${apiRoutes.analytics.netWorth}${buildQuery(period)}`, {
      schema: netWorthResponse,
      signal,
    });
  },

  monthly(query: MonthlyQuery = { months: 12 }, signal?: AbortSignal) {
    return apiRequest(`${apiRoutes.analytics.monthly}${buildQuery(query)}`, {
      schema: monthlyResponse,
      signal,
    });
  },

  accounts(signal?: AbortSignal) {
    return apiRequest(apiRoutes.accounts, { schema: accountsResponse, signal });
  },

  transactions(params: TransactionsParams, signal?: AbortSignal) {
    const { signal: abortSignal, uncategorized, pending, ...query } = params;
    return apiRequest(
      `${apiRoutes.transactions}${buildQuery({
        ...query,
        // Só envia o filtro quando ligado; `false`/ausente não filtra nada.
        ...(uncategorized ? { uncategorized: true } : {}),
        ...(pending ? { pending: true } : {}),
      })}`,
      {
        schema: transactionsResponse,
        signal: abortSignal ?? signal,
      },
    );
  },

  /**
   * `GET /api/transactions/summary` — totais e contagem por categoria de todo o
   * filtro (sem paginação). Aceita os mesmos filtros da lista menos
   * `cursor`/`limit`/`sort`.
   */
  transactionsSummary(params: TransactionsSummaryParams, signal?: AbortSignal) {
    const { signal: abortSignal, uncategorized, pending, ...query } = params;
    return apiRequest(
      `${apiRoutes.transactionsSummary}${buildQuery({
        ...query,
        ...(uncategorized ? { uncategorized: true } : {}),
        ...(pending ? { pending: true } : {}),
      })}`,
      {
        schema: transactionsSummaryResponse,
        signal: abortSignal ?? signal,
      },
    );
  },

  /** `GET /api/transactions/uncategorized-count` — contador global sem categoria. */
  transactionsUncategorizedCount(signal?: AbortSignal) {
    return apiRequest(apiRoutes.transactionsUncategorizedCount, {
      schema: uncategorizedCountResponse,
      signal,
    });
  },

  updateTransaction(id: string, body: UpdateTransactionBody) {
    return apiRequest(apiRoutes.transaction(id), {
      method: "PATCH",
      body,
      schema: z.object({ data: transactionSchema }),
    });
  },

  categories(signal?: AbortSignal) {
    return apiRequest(apiRoutes.categories, { schema: categoriesResponse, signal });
  },

  creditCards(signal?: AbortSignal) {
    return apiRequest(apiRoutes.creditCards, { schema: creditCardsResponse, signal });
  },

  creditCardBills(id: string, signal?: AbortSignal) {
    return apiRequest(apiRoutes.creditCardBills(id), { schema: billsResponse, signal });
  },

  updateCardPaymentPlan(id: string, body: UpdateCardPaymentPlanBody) {
    return apiRequest(apiRoutes.creditCardPaymentPlan(id), {
      method: "PUT",
      body,
      schema: cardPaymentPlanResponse,
    });
  },

  cardReserves(signal?: AbortSignal) {
    return apiRequest(apiRoutes.cardReserves, { schema: cardReservesResponse, signal });
  },

  billTransactions(id: string, signal?: AbortSignal) {
    return apiRequest(apiRoutes.billTransactions(id), {
      schema: billTransactionsResponse,
      signal,
    });
  },

  upcomingBills(query: UpcomingBillsQuery, signal?: AbortSignal) {
    return apiRequest(`${apiRoutes.upcomingBills}${buildQuery(query)}`, {
      schema: upcomingBillsResponse,
      signal,
    });
  },

  investments(signal?: AbortSignal) {
    return apiRequest(apiRoutes.investments, { schema: investmentsResponse, signal });
  },

  connections(signal?: AbortSignal) {
    return apiRequest(apiRoutes.connections, { schema: connectionsResponse, signal });
  },

  createConnection(body: CreateConnectionBody) {
    return apiRequest(apiRoutes.connections, {
      method: "POST",
      body,
      schema: createdResourceResponse,
    });
  },

  deleteConnection(id: string) {
    return apiRequest(apiRoutes.connection(id), { method: "DELETE", schema: okResponse });
  },

  syncConnection(id: string, options: { refresh?: boolean } = {}) {
    const suffix = options.refresh ? "?refresh=true" : "";
    return apiRequest(`${apiRoutes.connectionSync(id)}${suffix}`, {
      method: "POST",
      schema: syncRunResponse,
    });
  },

  syncRuns(id: string, query: SyncRunsQuery = { limit: 20 }, signal?: AbortSignal) {
    return apiRequest(`${apiRoutes.connectionSyncRuns(id)}${buildQuery(query)}`, {
      schema: syncRunsResponse,
      signal,
    });
  },

  providers(signal?: AbortSignal) {
    return apiRequest(apiRoutes.providers, { schema: providersResponse, signal });
  },

  pluggyConnectToken(itemId?: string) {
    return apiRequest(apiRoutes.pluggyConnectToken, {
      method: "POST",
      body: itemId ? { itemId } : {},
      schema: connectTokenResponse,
    });
  },

  settings(signal?: AbortSignal) {
    return apiRequest(apiRoutes.settings, { schema: settingsResponse, signal });
  },

  updateSettings(body: UpdateSettingsBody) {
    return apiRequest(apiRoutes.settings, {
      method: "PUT",
      body,
      schema: settingsResponse,
    });
  },

  budget(signal?: AbortSignal) {
    return apiRequest(apiRoutes.budget, { schema: budgetResponse, signal });
  },

  budgetProgress(query: BudgetProgressQuery, signal?: AbortSignal) {
    return apiRequest(`${apiRoutes.budgetProgress}${buildQuery(query)}`, {
      schema: budgetProgressResponse,
      signal,
    });
  },

  updateBudget(body: UpdateBudgetBody) {
    return apiRequest(apiRoutes.budget, { method: "PUT", body, schema: budgetResponse });
  },

  updateBudgetCategory(categoryId: string, body: UpdateBudgetCategoryBody) {
    return apiRequest(apiRoutes.budgetCategory(categoryId), {
      method: "PUT",
      body,
      schema: budgetResponse,
    });
  },
} as const;

export type ApiClient = typeof api;
