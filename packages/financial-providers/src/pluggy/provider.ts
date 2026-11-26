import { isProviderError } from "../errors";
import type {
  AmountSignConvention,
  FinancialProvider,
  ProviderAccount,
  ProviderBalance,
  ProviderBill,
  ProviderCapabilities,
  ProviderConnection,
  ProviderCreditCard,
  ProviderInvestment,
  ProviderRefreshResult,
  ProviderRequestOptions,
  ProviderTransaction,
  ProviderTransactionsOptions,
  ProviderTransactionsPage,
} from "../types";
import { PluggyClient, type PluggyClientOptions } from "./client";
import { holderTokenSets } from "./internal-transfers";
import {
  detectCreditCardSignConvention,
  mapPluggyAccount,
  mapPluggyAccountType,
  mapPluggyBill,
  mapPluggyCreditCard,
  mapPluggyInvestment,
  mapPluggyItemToConnection,
  mapPluggyTransaction,
  resolveMeuPluggyInstitutionNames,
  toSaoPauloDate,
} from "./mappers";
import type {
  PluggyAccount,
  PluggyConnectTokenOptions,
  PluggyConnector,
  PluggyConnectorQuery,
  PluggyItem,
  PluggyPage,
  PluggyTransaction,
} from "./types";

const PLUGGY_CAPABILITIES: ProviderCapabilities = {
  supportsManualRefresh: true,
  supportsWebhooks: true,
  supportsCreditCards: true,
  supportsInvestments: true,
};

export { PLUGGY_CAPABILITIES };

/** ID documentado do conector MeuPluggy (proxy somente leitura). */
export const MEU_PLUGGY_CONNECTOR_ID = 200;

/** Default de páginas por operação (protege o limite de subrequests). */
export const DEFAULT_MAX_PAGES = 10;
/** Default de subrequests por chamada de transações (limite Workers Free: 50). */
export const DEFAULT_REQUEST_BUDGET = 45;

export interface PluggyProviderOptions extends Omit<
  PluggyClientOptions,
  "clientId" | "clientSecret"
> {
  clientId?: string;
  clientSecret?: string;
  /** Cliente já configurado (testes / composição). */
  client?: PluggyClient;
  defaultMaxPages?: number;
  defaultRequestBudget?: number;
}

/**
 * Adapter Pluggy → contrato normalizado.
 *
 * - `getTransactionsPage` pagina `/v2/transactions` com cursor `after` e para
 *   por `maxPages`/`requestBudget`, devolvendo `nextCursor` + `partial`.
 * - `getTransactions` é o atalho sem continuação.
 * - MeuPluggy (conector 200) não aceita `PATCH /items`: `refreshConnection`
 *   apenas relê os dados e devolve `refreshed: false`.
 */
export class PluggyProvider implements FinancialProvider {
  readonly id = "pluggy" as const;
  readonly capabilities = PLUGGY_CAPABILITIES;

  private readonly client: PluggyClient;
  private readonly defaultMaxPages: number;
  private readonly defaultRequestBudget: number;
  private readonly now: () => number;
  /**
   * Cache curto das páginas de `/accounts` por item. O `SyncService` chama
   * `getAccounts`, `getCreditCards` e `getBalances` no mesmo sync; sem cache
   * seriam 3 varreduras completas do mesmo recurso (até 30 subrequests).
   * A instância do provider vive por request, então o cache não vaza entre
   * usuários/execuções.
   */
  private readonly accountsCache = new Map<
    string,
    { fetchedAt: number; accounts: PluggyAccount[] }
  >();
  private static readonly ACCOUNTS_CACHE_TTL_MS = 60_000;
  /** Item cache: evita 1 subrequest por conta/cartão no mesmo sync. */
  private readonly itemCache = new Map<string, { fetchedAt: number; item: PluggyItem }>();
  /** `undefined` = ainda não resolvido; `null` = não encontrado. */
  private meuPluggyConnector: PluggyConnector | null | undefined = undefined;

  constructor(options: PluggyProviderOptions) {
    this.client =
      options.client ??
      new PluggyClient({
        clientId: options.clientId ?? "",
        clientSecret: options.clientSecret ?? "",
        ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
        ...(options.fetch ? { fetch: options.fetch } : {}),
        ...(options.cache ? { cache: options.cache } : {}),
        ...(options.now ? { now: options.now } : {}),
        ...(options.sleep ? { sleep: options.sleep } : {}),
        ...(options.random ? { random: options.random } : {}),
        ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
        ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
        ...(options.retryBaseDelayMs !== undefined
          ? { retryBaseDelayMs: options.retryBaseDelayMs }
          : {}),
        ...(options.retryMaxDelayMs !== undefined
          ? { retryMaxDelayMs: options.retryMaxDelayMs }
          : {}),
        ...(options.apiKeyTtlMs !== undefined ? { apiKeyTtlMs: options.apiKeyTtlMs } : {}),
        ...(options.apiKeySafetyMarginMs !== undefined
          ? { apiKeySafetyMarginMs: options.apiKeySafetyMarginMs }
          : {}),
      });
    this.defaultMaxPages = Math.max(1, Math.floor(options.defaultMaxPages ?? DEFAULT_MAX_PAGES));
    this.defaultRequestBudget = Math.max(
      1,
      Math.floor(options.defaultRequestBudget ?? DEFAULT_REQUEST_BUDGET),
    );
    this.now = options.now ?? Date.now;
  }

  async getConnection(
    externalId: string,
    opts: ProviderRequestOptions = {},
  ): Promise<ProviderConnection> {
    const item = await this.fetchItem(externalId, opts);
    return mapPluggyItemToConnection(item);
  }

  async getAccounts(
    connectionExternalId: string,
    opts: ProviderRequestOptions = {},
  ): Promise<ProviderAccount[]> {
    const accounts = await this.fetchAccountPages(connectionExternalId, opts);

    // A instituição por conta vem dos dados da própria conta (COMPE no
    // `bankData.transferNumber` ou nome do cartão). Em itens MeuPluggy o
    // conector é sempre "MeuPluggy", então isso é o que distingue os bancos.
    // Contas sem banco (cartão GOLD/platinum) herdam a instituição do item
    // quando as demais apontam para um único banco.
    const institutionNames = resolveMeuPluggyInstitutionNames(accounts);
    return accounts.map((account, index) =>
      mapPluggyAccount(account, {
        institutionName: institutionNames[index] ?? null,
      }),
    );
  }

  async getTransactions(
    accountExternalId: string,
    opts: ProviderTransactionsOptions,
  ): Promise<ProviderTransaction[]> {
    const page = await this.getTransactionsPage(accountExternalId, opts);
    return page.transactions;
  }

  async getTransactionsPage(
    accountExternalId: string,
    opts: ProviderTransactionsOptions,
  ): Promise<ProviderTransactionsPage> {
    const maxPages = Math.max(1, Math.floor(opts.maxPages ?? this.defaultMaxPages));
    const requestBudget = Math.max(1, Math.floor(opts.requestBudget ?? this.defaultRequestBudget));
    const accountType = accountTypeToPluggy(opts.accountType);

    const rawTransactions: PluggyTransaction[] = [];
    let cursor: string | null = opts.cursor ?? null;
    let nextCursor: string | null = null;
    let partial = false;
    let requestCount = 0;
    let pages = 0;

    while (true) {
      if (pages >= maxPages || requestCount >= requestBudget) {
        partial = cursor !== null;
        nextCursor = cursor;
        break;
      }

      const response = await this.client.getTransactions(accountExternalId, {
        from: opts.from,
        to: opts.to,
        after: cursor,
        signal: opts.signal,
      });
      requestCount += 1;
      pages += 1;
      rawTransactions.push(...response.results);

      const next = extractAfterCursor(response.next);
      if (!next) {
        break;
      }
      cursor = next;
    }

    let convention: AmountSignConvention | null = opts.amountSignConvention ?? null;
    let detectedSignConvention: AmountSignConvention | null = null;
    let signConventionSampleSize = 0;
    if (opts.accountType === "credit_card") {
      const detection = detectCreditCardSignConvention(rawTransactions, convention);
      if (detection) {
        convention = detection.convention;
        signConventionSampleSize = detection.sampleSize;
        if (detection.persist) detectedSignConvention = detection.convention;
      }
    }

    const holderTokenSetsValue = holderTokenSets(opts.holderNames);
    const transactions = rawTransactions.map((raw) =>
      mapPluggyTransaction(raw, {
        accountExternalId,
        ...(accountType ? { accountType } : {}),
        amountSignConvention: convention,
        holderTokenSets: holderTokenSetsValue,
      }),
    );

    return {
      transactions,
      nextCursor,
      partial,
      requestCount,
      detectedSignConvention,
      signConventionSampleSize,
    };
  }

  async getCreditCards(
    connectionExternalId: string,
    opts: ProviderRequestOptions = {},
  ): Promise<ProviderCreditCard[]> {
    const accounts = await this.fetchAccountPages(connectionExternalId, opts);
    return accounts
      .filter((account) => mapPluggyAccountType(account.type, account.subtype) === "credit_card")
      .map((account) => mapPluggyCreditCard(account));
  }

  async getBills(
    accountExternalId: string,
    opts: ProviderRequestOptions = {},
  ): Promise<ProviderBill[]> {
    const today = this.today();
    const rawBills = await this.collectPages(
      async (page) =>
        this.client.getBills(accountExternalId, { page, pageSize: 500, signal: opts.signal }),
      500,
      opts.maxPages,
    );
    return rawBills.map((bill) => mapPluggyBill(bill, { accountExternalId, today }));
  }

  async getBalances(
    connectionExternalId: string,
    opts: ProviderRequestOptions = {},
  ): Promise<ProviderBalance[]> {
    const accounts = await this.fetchAccountPages(connectionExternalId, opts);
    const updatedAt = new Date(this.now()).toISOString();
    return accounts.map((account) => {
      const mapped = mapPluggyAccount(account);
      return {
        accountExternalId: mapped.externalId,
        balanceCents: mapped.balanceCents,
        availableCents: mapped.availableCents ?? null,
        currency: mapped.currency,
        updatedAt: mapped.updatedAt ?? updatedAt,
      };
    });
  }

  async getInvestments(
    connectionExternalId: string,
    opts: ProviderRequestOptions = {},
  ): Promise<ProviderInvestment[]> {
    const updatedAt = new Date(this.now()).toISOString();
    const rawInvestments = await this.collectPages(
      async (page) =>
        this.client.getInvestments(connectionExternalId, {
          page,
          pageSize: 500,
          signal: opts.signal,
        }),
      500,
      opts.maxPages,
    );
    return rawInvestments.map((investment) =>
      mapPluggyInvestment(investment, { connectionExternalId, updatedAt }),
    );
  }

  async refreshConnection(
    externalId: string,
    opts: ProviderRequestOptions = {},
  ): Promise<ProviderRefreshResult> {
    const item = await this.fetchItem(externalId, opts);
    if (isMeuPluggy(item.connector ?? undefined)) {
      return { refreshed: false, detail: "meu_pluggy_reads_only" };
    }
    await this.client.updateItem(externalId, { signal: opts.signal });
    return { refreshed: true };
  }

  /**
   * Revoga o item no Pluggy (`DELETE /items/:id`). `not_found` é sucesso: o item
   * já não existe, então a remoção local pode seguir.
   */
  async deleteConnection(externalId: string, opts: ProviderRequestOptions = {}): Promise<void> {
    try {
      await this.client.deleteItem(externalId, { signal: opts.signal });
    } catch (error) {
      if (isProviderError(error) && error.code === "not_found") return;
      throw error;
    }
  }

  /**
   * Resolve o conector MeuPluggy por id documentado (200) ou, como fallback,
   * pelo nome devolvido por `GET /connectors`. Retorna `null` sem quebrar o
   * fluxo quando o conector não está habilitado para a aplicação.
   */
  async resolveMeuPluggyConnector(
    opts: ProviderRequestOptions = {},
  ): Promise<PluggyConnector | null> {
    if (this.meuPluggyConnector !== undefined) return this.meuPluggyConnector;

    const connectors = await this.client.getConnectors({
      countries: "BR",
      signal: opts.signal,
    });
    const found =
      connectors.find((connector) => connector.id === MEU_PLUGGY_CONNECTOR_ID) ??
      connectors.find((connector) => isMeuPluggy(connector)) ??
      null;
    this.meuPluggyConnector = found;
    return found;
  }

  /** Token do widget Pluggy Connect (nunca expõe clientSecret). */
  async createConnectToken(
    options: PluggyConnectTokenOptions = {},
    opts: ProviderRequestOptions = {},
  ): Promise<string> {
    const response = await this.client.createConnectToken(options, { signal: opts.signal });
    return response.accessToken;
  }

  /** Resolve conectores (inclusive sandbox) sem fixar IDs no código. */
  async getConnectors(params: PluggyConnectorQuery = {}): Promise<PluggyConnector[]> {
    return this.client.getConnectors(params);
  }

  private async fetchItem(itemId: string, opts: ProviderRequestOptions = {}): Promise<PluggyItem> {
    const cached = this.itemCache.get(itemId);
    if (cached && this.now() - cached.fetchedAt < PluggyProvider.ACCOUNTS_CACHE_TTL_MS) {
      return cached.item;
    }
    const item = await this.client.getItem(itemId, { signal: opts.signal });
    this.itemCache.set(itemId, { fetchedAt: this.now(), item });
    return item;
  }

  private async fetchAccountPages(
    itemId: string,
    opts: ProviderRequestOptions = {},
  ): Promise<PluggyAccount[]> {
    const cached = this.accountsCache.get(itemId);
    if (cached && this.now() - cached.fetchedAt < PluggyProvider.ACCOUNTS_CACHE_TTL_MS) {
      return cached.accounts;
    }

    const accounts = await this.collectPages(
      async (page) => this.client.getAccounts(itemId, { page, pageSize: 500, signal: opts.signal }),
      500,
      opts.maxPages,
    );
    this.accountsCache.set(itemId, { fetchedAt: this.now(), accounts });
    return accounts;
  }

  private async collectPages<T>(
    fetchPage: (page: number) => Promise<PluggyPage<T>>,
    pageSize: number,
    maxPages: number | undefined = undefined,
  ): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    const limit = Math.max(1, Math.floor(maxPages ?? this.defaultMaxPages));

    for (let fetched = 0; fetched < limit; fetched += 1) {
      const response = await fetchPage(page);
      results.push(...response.results);

      if (response.totalPages !== undefined) {
        if (page >= response.totalPages || response.results.length === 0) break;
      } else if (response.results.length < pageSize) {
        break;
      }
      page += 1;
    }

    return results;
  }

  private today(): string {
    return toSaoPauloDate(new Date(this.now()).toISOString());
  }
}

function accountTypeToPluggy(
  accountType: ProviderTransactionsOptions["accountType"],
): "BANK" | "CREDIT" | undefined {
  if (accountType === "credit_card") return "CREDIT";
  if (accountType === "bank") return "BANK";
  return undefined;
}

/**
 * O `next` do Pluggy é uma query string pronta (`?after=<cursor>`). O provider
 * expõe somente o valor de `after` para não vazar formato do fornecedor e para
 * nunca passar a string `next` inteira no parâmetro `after` (INVALID_CURSOR).
 */
export function extractAfterCursor(next: string | null | undefined): string | null {
  if (!next) return null;
  const query = next.startsWith("?") ? next.slice(1) : next;
  const after = new URLSearchParams(query).get("after");
  return after && after.length > 0 ? after : null;
}

function isMeuPluggy(connector: PluggyConnector | undefined): boolean {
  if (!connector) return false;
  if (connector.id === MEU_PLUGGY_CONNECTOR_ID) return true;
  const name = connector.name?.trim().toLowerCase().replace(/\s+/g, "");
  return name === "meupluggy";
}
