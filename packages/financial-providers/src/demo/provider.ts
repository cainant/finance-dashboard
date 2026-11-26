import { ProviderError } from "../errors";
import type {
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
import { buildDemoDataset, type DemoDataset } from "./generate";

const DEMO_CAPABILITIES: ProviderCapabilities = {
  supportsManualRefresh: false,
  supportsWebhooks: false,
  supportsCreditCards: true,
  supportsInvestments: true,
};

export { DEMO_CAPABILITIES };

/**
 * Transações por página do demo. O sync inicial de 12 meses (~760 transações)
 * é fatiado: cada request grava no máximo esta página por conta e persiste o
 * cursor para o próximo request/cron. Sem isso, um único request montava ~87
 * batches e centenas de objetos, estourando o CPU de 10 ms do Workers Free.
 */
export const DEMO_TRANSACTIONS_PAGE_SIZE = 60;

export interface DemoProviderOptions {
  /**
   * Instante de referência. Injetável para testes determinísticos.
   * Default: relógio do runtime.
   */
  now?: Date | (() => Date);
}

/**
 * Provider 100% offline e determinístico (seed fixa), para demo e testes.
 *
 * - 3 instituições fictícias, 5 contas correntes/poupança e 2 cartões;
 * - ~12 meses de transações em BRL com saldos coerentes;
 * - faturas: últimas 6 fechadas + a aberta;
 * - investimentos (CDB, Tesouro Selic, fundo).
 *
 * Todos os dados devem ser apresentados na UI com o selo "Demonstração".
 */
/**
 * Cache do dataset demo por data civil. O `DemoProvider` é recriado a cada
 * request (`createProvidersFromEnv`), então um cache de instância não ajudava:
 * cada sync reconstruía ~12 meses de transações. O dataset é determinístico
 * para a mesma data, então compartilhar entre requests/instâncias é seguro.
 */
const DATASET_CACHE = new Map<string, DemoDataset>();
const DATASET_CACHE_MAX_ENTRIES = 4;

export class DemoProvider implements FinancialProvider {
  readonly id = "demo" as const;
  readonly capabilities = DEMO_CAPABILITIES;

  private readonly now: () => Date;

  constructor(options: DemoProviderOptions = {}) {
    if (typeof options.now === "function") {
      this.now = options.now;
    } else if (options.now instanceof Date) {
      const fixed = new Date(options.now.getTime());
      this.now = () => new Date(fixed.getTime());
    } else {
      this.now = () => new Date();
    }
  }

  async getConnection(
    externalId: string,
    _opts?: ProviderRequestOptions,
  ): Promise<ProviderConnection> {
    const dataset = this.dataset();
    const connection = dataset.connections.find((item) => item.externalId === externalId);
    if (!connection) throw notFound("Conexão demo não encontrada.");
    return {
      ...connection,
      institution: { ...connection.institution },
    };
  }

  async getAccounts(
    connectionExternalId: string,
    _opts?: ProviderRequestOptions,
  ): Promise<ProviderAccount[]> {
    const dataset = this.dataset();
    this.requireConnection(dataset, connectionExternalId);
    return dataset.accounts
      .filter((account) => account.connectionExternalId === connectionExternalId)
      .map((account) => ({ ...account }));
  }

  async getTransactions(
    accountExternalId: string,
    opts: ProviderTransactionsOptions,
  ): Promise<ProviderTransaction[]> {
    const transactions: ProviderTransaction[] = [];
    let cursor = opts.cursor ?? null;
    // Conveniência: segue as páginas do demo (o SyncService usa
    // getTransactionsPage para fatiar entre execuções).
    for (let page = 0; page < 100; page += 1) {
      const result = await this.getTransactionsPage(accountExternalId, { ...opts, cursor });
      transactions.push(...result.transactions);
      if (!result.partial || !result.nextCursor) break;
      cursor = result.nextCursor;
    }
    return transactions;
  }

  async getTransactionsPage(
    accountExternalId: string,
    opts: ProviderTransactionsOptions,
  ): Promise<ProviderTransactionsPage> {
    const dataset = this.dataset();
    this.requireAccount(dataset, accountExternalId);
    if (!isIsoDate(opts.from) || !isIsoDate(opts.to)) {
      throw new ProviderError("invalid_response", "Período de transações inválido.", {
        retryable: false,
      });
    }
    if (opts.from > opts.to) {
      throw new ProviderError("invalid_response", "Período de transações invertido.", {
        retryable: false,
      });
    }

    const matching = dataset.transactions.filter(
      (transaction) =>
        transaction.accountExternalId === accountExternalId &&
        transaction.date >= opts.from &&
        transaction.date <= opts.to,
    );
    const offset = parseOffset(opts.cursor);
    const slice = matching.slice(offset, offset + DEMO_TRANSACTIONS_PAGE_SIZE);
    const nextOffset = offset + slice.length;
    const nextCursor = nextOffset < matching.length ? String(nextOffset) : null;

    return {
      transactions: slice.map((transaction) => ({ ...transaction })),
      nextCursor,
      partial: nextCursor !== null,
      // Demo é in-memory: não consome subrequest HTTP.
      requestCount: 0,
    };
  }

  async getCreditCards(
    connectionExternalId: string,
    _opts?: ProviderRequestOptions,
  ): Promise<ProviderCreditCard[]> {
    const dataset = this.dataset();
    this.requireConnection(dataset, connectionExternalId);
    return dataset.creditCards
      .filter((card) =>
        dataset.accounts.some(
          (account) =>
            account.externalId === card.accountExternalId &&
            account.connectionExternalId === connectionExternalId,
        ),
      )
      .map((card) => ({ ...card }));
  }

  async getBills(
    accountExternalId: string,
    _opts?: ProviderRequestOptions,
  ): Promise<ProviderBill[]> {
    const dataset = this.dataset();
    this.requireAccount(dataset, accountExternalId);
    return dataset.bills
      .filter((bill) => bill.accountExternalId === accountExternalId)
      .map((bill) => ({ ...bill }));
  }

  async getBalances(
    connectionExternalId: string,
    _opts?: ProviderRequestOptions,
  ): Promise<ProviderBalance[]> {
    const dataset = this.dataset();
    this.requireConnection(dataset, connectionExternalId);
    const accountIds = new Set(
      dataset.accounts
        .filter((account) => account.connectionExternalId === connectionExternalId)
        .map((account) => account.externalId),
    );
    return dataset.balances
      .filter((balance) => accountIds.has(balance.accountExternalId))
      .map((balance) => ({ ...balance }));
  }

  async getInvestments(
    connectionExternalId: string,
    _opts?: ProviderRequestOptions,
  ): Promise<ProviderInvestment[]> {
    const dataset = this.dataset();
    this.requireConnection(dataset, connectionExternalId);
    return dataset.investments
      .filter((investment) => investment.connectionExternalId === connectionExternalId)
      .map((investment) => ({ ...investment }));
  }

  async refreshConnection(
    externalId: string,
    _opts?: ProviderRequestOptions,
  ): Promise<ProviderRefreshResult> {
    this.requireConnection(this.dataset(), externalId);
    return { refreshed: false, detail: "demo_provider_read_only" };
  }

  private dataset(): DemoDataset {
    const now = this.now();
    const key = now.toISOString().slice(0, 10);
    const cached = DATASET_CACHE.get(key);
    if (cached) return cached;

    const dataset = buildDemoDataset({ now });
    if (DATASET_CACHE.size >= DATASET_CACHE_MAX_ENTRIES) {
      const oldest = DATASET_CACHE.keys().next().value;
      if (oldest !== undefined) DATASET_CACHE.delete(oldest);
    }
    DATASET_CACHE.set(key, dataset);
    return dataset;
  }

  private requireConnection(dataset: DemoDataset, externalId: string): void {
    if (!dataset.connections.some((connection) => connection.externalId === externalId)) {
      throw notFound("Conexão demo não encontrada.");
    }
  }

  private requireAccount(dataset: DemoDataset, externalId: string): void {
    if (!dataset.accounts.some((account) => account.externalId === externalId)) {
      throw notFound("Conta demo não encontrada.");
    }
  }
}

function notFound(message: string): ProviderError {
  return new ProviderError("not_found", message, { retryable: false });
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

/** Cursor do demo é o offset numérico da próxima página; inválido vira 0. */
function parseOffset(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const value = Number(cursor);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

/**
 * Aquece o dataset no **startup** do isolate. Tempo de startup não conta no
 * limite de 10 ms de CPU por request; sem isso, o primeiro sync do dia pagava
 * a geração de ~12 meses (~20 ms medidos) dentro do request.
 *
 * O cache é por data UTC. Se o isolate atravessar a meia-noite, o primeiro
 * request do dia seguinte reconstrói o dataset (caso raro).
 */
export function prewarmDemoDataset(now: Date = new Date()): void {
  const key = now.toISOString().slice(0, 10);
  if (DATASET_CACHE.has(key)) return;
  if (DATASET_CACHE.size >= DATASET_CACHE_MAX_ENTRIES) {
    const oldest = DATASET_CACHE.keys().next().value;
    if (oldest !== undefined) DATASET_CACHE.delete(oldest);
  }
  DATASET_CACHE.set(key, buildDemoDataset({ now }));
}

// Executa na avaliação do módulo (startup), antes de qualquer request.
prewarmDemoDataset();
