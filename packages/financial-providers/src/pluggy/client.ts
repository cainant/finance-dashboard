import type { KeyValueCache } from "../cache";
import {
  asProviderError,
  isProviderError,
  ProviderError,
  providerErrorFromStatus,
  sanitizeProviderMessage,
} from "../errors";
import type {
  PluggyAccount,
  PluggyAccountBalance,
  PluggyAuthResponse,
  PluggyBill,
  PluggyConnectTokenOptions,
  PluggyConnectTokenResponse,
  PluggyConnector,
  PluggyConnectorQuery,
  PluggyErrorBody,
  PluggyInvestment,
  PluggyItem,
  PluggyPage,
  PluggyTransactionsPage,
} from "./types";

export const PLUGGY_DEFAULT_BASE_URL = "https://api.pluggy.ai";

/** TTL documentado da apiKey (`POST /auth`): 2 horas. */
export const PLUGGY_API_KEY_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_SAFETY_MARGIN_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_RETRY_MAX_DELAY_MS = 8_000;

export interface PluggyClientOptions {
  clientId: string;
  clientSecret: string;
  /** Default `https://api.pluggy.ai`; usa somente a origem (sem path). */
  baseUrl?: string;
  /** Injetável em testes; default `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Cache opcional (KV) para a apiKey; falhas viram cache miss. */
  cache?: KeyValueCache;
  /** Relógio em ms; default `Date.now`. */
  now?: () => number;
  /** Default: `setTimeout`. Injetável para testes. */
  sleep?: (ms: number) => Promise<void>;
  /** Fonte de jitter [0,1); default `Math.random`. */
  random?: () => number;
  /** Timeout por tentativa; `0` desliga. */
  timeoutMs?: number;
  /** Tentativas extras para 429/5xx/rede; default 2 (3 tentativas no total). */
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  /** TTL da apiKey em memória/cache; default 2h. */
  apiKeyTtlMs?: number;
  /** Renova antes de expirar; default 5 min. */
  apiKeySafetyMarginMs?: number;
}

interface RequestSpec {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  authenticated?: boolean;
}

interface PageParams {
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

interface RequestContext extends RequestSpec {
  apiKey?: string | null;
}

/**
 * Cliente HTTP puro do Pluggy (fetch + Web APIs, compatível com Workers).
 *
 * Responsabilidades:
 * - autenticação `POST /auth` com cache em memória e cache opcional (KV) por TTL;
 * - `X-API-KEY` em todas as chamadas autenticadas;
 * - retry exponencial com jitter somente para 429/5xx/rede, respeitando
 *   `Retry-After` / `RateLimit-Reset`;
 * - timeout por tentativa via `AbortSignal`;
 * - mapeamento de HTTP para `ProviderError`.
 *
 * O cliente devolve páginas cruas; a paginação com orçamento fica no
 * `PluggyProvider`.
 */
export class PluggyClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cache?: KeyValueCache;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly apiKeyTtlMs: number;
  private readonly apiKeySafetyMarginMs: number;
  private readonly cacheKey: string;

  private apiKey: { value: string; expiresAt: number } | null = null;
  private authPromise: Promise<string> | null = null;
  private skipCacheOnce = false;

  constructor(options: PluggyClientOptions) {
    if (!options.clientId?.trim() || !options.clientSecret?.trim()) {
      throw new ProviderError("auth_failed", "Credenciais do Pluggy não configuradas.", {
        retryable: false,
      });
    }

    const baseUrl = new URL(options.baseUrl ?? PLUGGY_DEFAULT_BASE_URL);
    if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") {
      throw new ProviderError("invalid_response", "Base URL do Pluggy inválida.", {
        retryable: false,
      });
    }

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new ProviderError("unavailable", "fetch indisponível neste runtime.", {
        retryable: false,
      });
    }

    this.clientId = options.clientId.trim();
    this.clientSecret = options.clientSecret.trim();
    this.baseUrl = baseUrl.origin;
    // No Workers, `fetch` precisa ser chamado sem receiver: guardar a referência e
    // chamá-la como método (`this.fetchImpl(...)`) lança "Illegal invocation".
    this.fetchImpl = (input, init) => fetchImpl(input, init);
    this.cache = options.cache;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = options.random ?? Math.random;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES);
    this.retryBaseDelayMs = Math.max(0, options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS);
    this.retryMaxDelayMs = Math.max(0, options.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS);
    this.apiKeyTtlMs = Math.max(0, options.apiKeyTtlMs ?? PLUGGY_API_KEY_TTL_MS);
    this.apiKeySafetyMarginMs = Math.max(
      0,
      options.apiKeySafetyMarginMs ?? DEFAULT_SAFETY_MARGIN_MS,
    );
    this.cacheKey = `pluggy:api-key:${this.clientId}`;
  }

  /** Autentica (ou reutiliza cache) e devolve a apiKey. */
  async authenticate(opts: { signal?: AbortSignal } = {}): Promise<string> {
    if (this.apiKey && this.apiKey.expiresAt > this.now()) return this.apiKey.value;
    if (this.authPromise) return this.authPromise;

    this.authPromise = this.loadOrFetchApiKey(opts.signal).finally(() => {
      this.authPromise = null;
    });
    return this.authPromise;
  }

  async getItem(itemId: string, opts: { signal?: AbortSignal } = {}): Promise<PluggyItem> {
    return this.request<PluggyItem>(`/items/${encodeURIComponent(itemId)}`, {
      signal: opts.signal,
    });
  }

  /** `PATCH /items/:id` dispara uma atualização. MeuPluggy rejeita/não suporta. */
  async updateItem(
    itemId: string,
    opts: { signal?: AbortSignal } = {},
  ): Promise<PluggyItem | undefined> {
    return this.request<PluggyItem | undefined>(`/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body: {},
      signal: opts.signal,
    });
  }

  /** `DELETE /items/:id` revoga o item no Pluggy. 404 quando já não existe. */
  async deleteItem(itemId: string, opts: { signal?: AbortSignal } = {}): Promise<void> {
    await this.request<void>(`/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
      signal: opts.signal,
    });
  }

  async getAccount(accountId: string, opts: { signal?: AbortSignal } = {}): Promise<PluggyAccount> {
    return this.request<PluggyAccount>(`/accounts/${encodeURIComponent(accountId)}`, {
      signal: opts.signal,
    });
  }

  /** Saldo em tempo real (somente API key; connect token recebe 403). */
  async getAccountBalance(
    accountId: string,
    opts: { signal?: AbortSignal } = {},
  ): Promise<PluggyAccountBalance> {
    return this.request<PluggyAccountBalance>(
      `/accounts/${encodeURIComponent(accountId)}/balance`,
      { signal: opts.signal },
    );
  }

  async getAccounts(
    itemId: string,
    params: PageParams & { type?: "BANK" | "CREDIT" } = {},
  ): Promise<PluggyPage<PluggyAccount>> {
    const raw = await this.request<PluggyPage<PluggyAccount>>("/accounts", {
      query: {
        itemId,
        type: params.type,
        page: params.page,
        pageSize: params.pageSize,
      },
      signal: params.signal,
    });
    return requireResults(raw, "accounts") as PluggyPage<PluggyAccount>;
  }

  /** `/v2/transactions` (o `/transactions` v1 está deprecated). */
  async getTransactions(
    accountId: string,
    params: {
      from: string;
      to: string;
      /** Cursor `after` já decodificado (nunca a string `next` inteira). */
      after?: string | null;
      signal?: AbortSignal;
    },
  ): Promise<PluggyTransactionsPage> {
    const raw = await this.request<PluggyTransactionsPage>("/v2/transactions", {
      query: {
        accountId,
        dateFrom: params.from,
        dateTo: params.to,
        after: params.after ?? undefined,
      },
      signal: params.signal,
    });
    if (!raw || !Array.isArray(raw.results)) {
      throw invalidResponse("Resposta de transações inválida.");
    }
    return { results: raw.results, next: raw.next ?? null };
  }

  async getBills(accountId: string, params: PageParams = {}): Promise<PluggyPage<PluggyBill>> {
    const raw = await this.request<PluggyPage<PluggyBill>>("/bills", {
      query: {
        accountId,
        page: params.page,
        pageSize: params.pageSize,
      },
      signal: params.signal,
    });
    return requireResults(raw, "bills") as PluggyPage<PluggyBill>;
  }

  async getInvestments(
    itemId: string,
    params: PageParams = {},
  ): Promise<PluggyPage<PluggyInvestment>> {
    const raw = await this.request<PluggyPage<PluggyInvestment>>("/investments", {
      query: {
        itemId,
        page: params.page,
        pageSize: params.pageSize,
      },
      signal: params.signal,
    });
    return requireResults(raw, "investments") as PluggyPage<PluggyInvestment>;
  }

  /**
   * Cria o token do widget. Campos de `options` vão SEMPRE dentro de
   * `options` (no root o Pluggy descarta silenciosamente).
   */
  async createConnectToken(
    options: PluggyConnectTokenOptions = {},
    opts: { signal?: AbortSignal } = {},
  ): Promise<PluggyConnectTokenResponse> {
    const raw = await this.request<PluggyConnectTokenResponse>("/connect_token", {
      method: "POST",
      body: {
        ...(options.itemId ? { itemId: options.itemId } : {}),
        options: {
          ...(options.clientUserId ? { clientUserId: options.clientUserId } : {}),
          ...(options.webhookUrl ? { webhookUrl: options.webhookUrl } : {}),
          ...(options.oauthRedirectUri ? { oauthRedirectUri: options.oauthRedirectUri } : {}),
          ...(options.avoidDuplicates !== undefined
            ? { avoidDuplicates: options.avoidDuplicates }
            : {}),
          ...(options.products ? { products: options.products } : {}),
        },
      },
      signal: opts.signal,
    });
    if (!raw || typeof raw.accessToken !== "string" || raw.accessToken.length === 0) {
      throw invalidResponse("Connect token inválido.");
    }
    return raw;
  }

  /** `GET /connectors` (ex.: `?sandbox=true&countries=BR`); nunca fixar IDs. */
  async getConnectors(params: PluggyConnectorQuery = {}): Promise<PluggyConnector[]> {
    const raw = await this.request<PluggyPage<PluggyConnector> | PluggyConnector[]>("/connectors", {
      query: { sandbox: params.sandbox, countries: params.countries },
      signal: params.signal,
    });
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.results)) return raw.results;
    throw invalidResponse("Lista de conectores inválida.");
  }

  private async loadOrFetchApiKey(signal?: AbortSignal): Promise<string> {
    if (!this.skipCacheOnce) {
      const fromCache = await this.readApiKeyFromCache();
      if (fromCache) return fromCache;
    }
    this.skipCacheOnce = false;

    const response = await this.requestWithRetries<PluggyAuthResponse>("/auth", {
      method: "POST",
      body: { clientId: this.clientId, clientSecret: this.clientSecret },
      authenticated: false,
      apiKey: null,
      signal,
    });
    if (!response || typeof response.apiKey !== "string" || response.apiKey.length < 8) {
      throw new ProviderError("auth_failed", "Resposta de autenticação do Pluggy sem apiKey.", {
        retryable: false,
      });
    }

    const ttl = Math.max(0, this.apiKeyTtlMs - this.apiKeySafetyMarginMs);
    const expiresAt = this.now() + ttl;
    this.apiKey = { value: response.apiKey, expiresAt };
    await this.writeApiKeyToCache(response.apiKey, expiresAt);
    return response.apiKey;
  }

  private async readApiKeyFromCache(): Promise<string | null> {
    if (!this.cache) return null;
    try {
      const raw = await this.cache.get(this.cacheKey);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("apiKey" in parsed) ||
        !("expiresAt" in parsed)
      ) {
        return null;
      }
      const { apiKey, expiresAt } = parsed as { apiKey?: unknown; expiresAt?: unknown };
      if (
        typeof apiKey !== "string" ||
        apiKey.length === 0 ||
        typeof expiresAt !== "number" ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= this.now()
      ) {
        return null;
      }
      this.apiKey = { value: apiKey, expiresAt };
      return apiKey;
    } catch {
      return null;
    }
  }

  private async writeApiKeyToCache(apiKey: string, expiresAt: number): Promise<void> {
    if (!this.cache) return;
    const ttlSeconds = Math.floor((expiresAt - this.now()) / 1000);
    if (ttlSeconds < 60) return;
    try {
      await this.cache.put(this.cacheKey, JSON.stringify({ apiKey, expiresAt }), ttlSeconds);
    } catch {
      // KV é cache: falha não pode quebrar o request.
    }
  }

  private async invalidateApiKey(): Promise<void> {
    this.apiKey = null;
    this.skipCacheOnce = true;
    if (!this.cache?.delete) return;
    try {
      await this.cache.delete(this.cacheKey);
    } catch {
      // best-effort
    }
  }

  private async request<T>(path: string, spec: RequestSpec): Promise<T> {
    const authenticated = spec.authenticated !== false;
    let reauthenticated = false;

    while (true) {
      const apiKey = authenticated ? await this.authenticate({ signal: spec.signal }) : null;
      try {
        return await this.requestWithRetries<T>(path, { ...spec, apiKey });
      } catch (error) {
        const providerError = asProviderError(error);
        if (authenticated && !reauthenticated && apiKey !== null && providerError.status === 401) {
          reauthenticated = true;
          await this.invalidateApiKey();
          continue;
        }
        throw providerError;
      }
    }
  }

  private async requestWithRetries<T>(path: string, context: RequestContext): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.requestOnce<T>(path, context);
      } catch (error) {
        const providerError = asProviderError(error);
        if (!providerError.retryable || attempt >= this.maxRetries) throw providerError;
        const delay = providerError.retryAfterMs ?? this.backoffDelay(attempt);
        await this.sleep(Math.max(0, delay));
      }
    }
  }

  private async requestOnce<T>(path: string, context: RequestContext): Promise<T> {
    const url = this.buildUrl(path, context.query);
    const headers: Record<string, string> = { accept: "application/json" };
    if (context.body !== undefined) headers["content-type"] = "application/json";
    if (context.apiKey) headers["x-api-key"] = context.apiKey;

    const controller = new AbortController();
    let timedOut = false;
    const timer =
      this.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            controller.abort(new Error("pluggy-request-timeout"));
          }, this.timeoutMs)
        : null;

    const externalSignal = context.signal;
    const onExternalAbort = () => controller.abort(externalSignal?.reason);
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort(externalSignal.reason);
      else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }

    try {
      const response = await this.fetchImpl(url, {
        method: context.method ?? "GET",
        headers,
        ...(context.body !== undefined ? { body: JSON.stringify(context.body) } : {}),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await readErrorBody(response);
        throw httpError(response.status, body, response.headers, this.now());
      }

      if (response.status === 204) return undefined as T;
      const text = await response.text();
      if (text.trim().length === 0) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw invalidResponse("Resposta do Pluggy não é JSON válido.");
      }
    } catch (error) {
      if (isProviderError(error)) throw error;
      if (externalSignal?.aborted) {
        throw new ProviderError("unavailable", "Requisição cancelada.", {
          retryable: false,
          cause: error,
        });
      }
      if (timedOut || controller.signal.aborted) {
        throw new ProviderError("unavailable", "Tempo limite esgotado no Pluggy.", {
          retryable: true,
          cause: error,
        });
      }
      throw new ProviderError("unavailable", "Falha de rede ao acessar o Pluggy.", {
        retryable: true,
        cause: error,
      });
    } finally {
      if (timer !== null) clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }
  }

  private buildUrl(
    path: string,
    query: Record<string, string | number | boolean | undefined> | undefined,
  ): string {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  /** Backoff exponencial com equal jitter (metade fixa + metade aleatória). */
  private backoffDelay(attempt: number): number {
    const exponential = Math.min(this.retryMaxDelayMs, this.retryBaseDelayMs * 2 ** attempt);
    return Math.round(exponential / 2 + this.random() * (exponential / 2));
  }
}

function requireResults<T>(raw: PluggyPage<T> | undefined, resource: string): PluggyPage<T> {
  if (!raw || !Array.isArray(raw.results)) {
    throw invalidResponse(`Resposta de ${resource} inválida.`);
  }
  return raw;
}

function invalidResponse(message: string): ProviderError {
  return new ProviderError("invalid_response", message, { retryable: false });
}

async function readErrorBody(response: Response): Promise<PluggyErrorBody | null> {
  try {
    const text = await response.text();
    if (text.trim().length === 0) return null;
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as PluggyErrorBody;
  } catch {
    return null;
  }
}

function httpError(
  status: number,
  body: PluggyErrorBody | null,
  headers: Headers,
  now: number,
): ProviderError {
  const template = providerErrorFromStatus(status);
  const codeDescription =
    typeof body?.codeDescription === "string"
      ? sanitizeProviderMessage(body.codeDescription, "")
      : "";
  const message = codeDescription
    ? `Pluggy respondeu ${status} (${codeDescription}).`
    : `Pluggy respondeu ${status}.`;
  const retryAfterMs = parseRetryAfter(headers, now);
  return new ProviderError(template.code, message, {
    status,
    retryable: template.retryable,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    ...(codeDescription ? { details: { codeDescription } } : {}),
  });
}

function parseRetryAfter(headers: Headers, now: number): number | undefined {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, date - now);
  }
  const reset = headers.get("ratelimit-reset");
  if (reset) {
    const seconds = Number(reset);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  }
  return undefined;
}
