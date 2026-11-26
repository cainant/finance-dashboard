/**
 * SyncService — sincronização idempotente de uma conexão com o provider.
 *
 * Regras (docs/architecture.md):
 * - upsert por `(connection/account, external_id)`, sem duplicar;
 * - `categoryHint` → categoria de sistema por slug; nunca sobrescreve
 *   `category_source = 'user'`;
 * - snapshot diário de saldo (demo gera histórico retroativo coerente);
 * - `sync_runs` com stats e erro sanitizado; falha não apaga dados;
 * - incremental desde `last_synced_at − 7 dias`, com orçamento de requests e
 *   cursor pendente persistido em `stats_json` para continuar no próximo cron.
 */
import type {
  Account as AccountRow,
  Connection as ConnectionRow,
  Database,
  SyncRun as SyncRunRow,
} from "@fd/database";
import {
  accounts,
  balanceSnapshots,
  bills,
  categories,
  connections,
  creditCards,
  investments,
  syncRuns,
  transactions,
  users,
} from "@fd/database/schema";
import { addDays, toIsoDate, type SyncRunStats } from "@fd/contracts";
import {
  holderTokenSets,
  isProviderError,
  matchesInternalMovement,
  ProviderError,
  type AmountSignConvention,
  type HolderTokenSet,
  type ProviderAccount,
  type ProviderBalance,
  type ProviderBill,
  type ProviderConnectionStatus,
  type ProviderCreditCard,
  type ProviderId,
  type ProviderInvestment,
  type ProviderRegistry,
  type ProviderTransaction,
} from "@fd/financial-providers";
import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { upsertInstitution } from "../domain/institutions";

const INITIAL_WINDOW_DAYS = 365;
const INCREMENTAL_OVERLAP_DAYS = 7;
/** Teto de páginas de transações por conta (proteção de CPU/subrequests). */
const MAX_PAGES_PER_ACCOUNT = 6;
/** Teto de subrequests por conexão para transações. */
const TRANSACTION_REQUEST_BUDGET = 24;
/** Subrequests reservados para item/contas/faturas/investimentos por conexão. */
const MIN_CONNECTION_BUDGET = 6;
const DAILY_SNAPSHOT_DAYS = 90;
const SNAPSHOT_MAX_HISTORY_DAYS = 365;
/** Dias recentes cujo snapshot é sempre reescrito (transações podem mudar). */
const SNAPSHOT_REWRITE_RECENT_DAYS = 7;
/** D1 Free limita 100 variáveis por statement; contas têm 13 colunas. */
const UPSERT_CHUNK_SIZE = 7;
/**
 * D1 Free limita 100 variáveis por statement; transações têm 21 colunas
 * (4 × 21 = 84).
 */
const TRANSACTION_CHUNK_SIZE = 4;
const SNAPSHOT_CHUNK_SIZE = 30;
/** `db.batch()` conta como UMA query no D1 Free; agrupa para limitar payload. */
const BATCH_STATEMENTS_PER_CALL = 50;

/**
 * Orçamento de subrequests compartilhado por uma invocação. O Workers Free
 * permite 50 subrequests/request; D1 consome 1 por query (batch = 1) e cada
 * chamada HTTP do provider consome 1. O cron usa 45 para deixar margem.
 */
export class RequestBudget {
  private used = 0;

  constructor(readonly limit: number) {}

  get remaining(): number {
    return Math.max(0, this.limit - this.used);
  }

  /** Reserva `count` subrequests; devolve `false` sem reservar se não couber. */
  take(count = 1): boolean {
    if (this.remaining < count) return false;
    this.used += count;
    return true;
  }

  /** Ajusta a reserva para o custo real (ex.: páginas efetivamente buscadas). */
  settle(reserved: number, actual: number): void {
    this.used = Math.max(0, this.used - Math.max(0, reserved - actual));
  }
}

type BatchItem = Parameters<Database["batch"]>[0][number];

async function runBatches(
  db: Database,
  statements: BatchItem[],
  size: number = BATCH_STATEMENTS_PER_CALL,
): Promise<void> {
  for (const group of chunk(statements, size)) {
    await db.batch(group as [BatchItem, ...BatchItem[]]);
  }
}

/** Aliases entre os hints do provider e os slugs do seed do app. */
const CATEGORY_SLUG_ALIASES: Readonly<Record<string, string>> = {
  "contas-servicos": "contas-e-servicos",
  "impostos-taxas": "impostos-e-taxas",
};

interface PendingCursor {
  from: string;
  to: string;
  cursor: string | null;
}

/**
 * Progresso da reclassificação do histórico (movimentação interna), persistido
 * em `sync_runs.stats_json` junto do cursor de páginas. `identity` é o nome do
 * titular normalizado: se `users.name` mudar, a varredura recomeça.
 */
interface BackfillState {
  /** Versão da regra; subir quando a classificação mudar de critério. */
  version: number;
  identity: string;
  /** Último id já processado (keyset de `transactions.id`). */
  cursor: string | null;
  done: boolean;
}

/** Versão da regra de movimentação interna (ver internal-transfers.ts). */
const INTERNAL_MOVEMENT_RULE_VERSION = 1;

/**
 * Linhas reclassificadas por sync. O filtro custa ~0,5 ms por 100 linhas
 * aquecido (e o dobro na primeira chamada); 150 cabe com folga no orçamento de
 * 10 ms do Workers Free junto com o resto do sync.
 */
const DEFAULT_RECLASSIFY_CHUNK_SIZE = 150;

/** Separadores de contraparte aceitos pelo mapper (` - ` inclui o NBSP). */
const COUNTERPARTY_SEPARATORS = ["|", " - ", "\u00a0-\u00a0"] as const;

type StoredStats = SyncRunStats & {
  _pending?: Record<string, PendingCursor>;
  _backfill?: BackfillState;
};

/**
 * Identidade da varredura: tokens do titular já normalizados. Vazio quando o
 * nome não distingue ninguém (menos de 2 tokens de 3+ caracteres) — casos em
 * que a regra fica desligada, documentado em docs/architecture.md.
 */
function holderIdentity(holderTokens: HolderTokenSet): string {
  return holderTokens[0]?.join(" ") ?? "";
}

function parsePendingCursors(value: unknown): Record<string, PendingCursor> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, PendingCursor> = {};
  for (const [accountExternalId, cursor] of Object.entries(value)) {
    if (
      cursor &&
      typeof cursor === "object" &&
      typeof cursor.from === "string" &&
      typeof cursor.to === "string" &&
      (cursor.cursor === null || typeof cursor.cursor === "string")
    ) {
      result[accountExternalId] = cursor as PendingCursor;
    }
  }
  return result;
}

function parseBackfillState(value: unknown, fallback: BackfillState): BackfillState {
  if (!value || typeof value !== "object") return fallback;
  const state = value as Partial<BackfillState>;
  if (
    typeof state.version !== "number" ||
    typeof state.identity !== "string" ||
    (state.cursor !== null && typeof state.cursor !== "string") ||
    typeof state.done !== "boolean"
  ) {
    return fallback;
  }
  return {
    version: state.version,
    identity: state.identity,
    cursor: state.cursor ?? null,
    done: state.done,
  };
}

export interface SyncServiceOptions {
  db: Database;
  providers: ProviderRegistry;
  now?: () => Date;
  /** Linhas por execução na reclassificação do histórico (testes usam lotes pequenos). */
  reclassifyChunkSize?: number;
}

export interface SyncConnectionOptions {
  /** Orçamento compartilhado da invocação (cron). Default: 45 novo. */
  budget?: RequestBudget;
  /** Categorias de sistema já carregadas (evita 1 query por conexão). */
  categoryIds?: Map<string, string>;
  /**
   * Pede ao provider uma atualização do item antes de ler (`PATCH /items` no
   * Pluggy). No MeuPluggy o provider devolve `refreshed: false` sem chamada.
   */
  refresh?: boolean;
}

function budgetExhausted(): ProviderError {
  return new ProviderError(
    "rate_limited",
    "Orçamento de sincronização esgotado; a conexão continua no próximo ciclo.",
    { retryable: true },
  );
}

export class SyncService {
  private readonly db: Database;
  private readonly providers: ProviderRegistry;
  private readonly now: () => Date;
  private readonly reclassifyChunkSize: number;
  /** Contexto de mapeamento por usuário (categorias + nome do titular). */
  private readonly mappingContextCache = new Map<
    string,
    { categoryIds: Map<string, string>; holderNames: string[] }
  >();

  constructor(options: SyncServiceOptions) {
    this.db = options.db;
    this.providers = options.providers;
    this.now = options.now ?? (() => new Date());
    this.reclassifyChunkSize = Math.max(
      1,
      Math.floor(options.reclassifyChunkSize ?? DEFAULT_RECLASSIFY_CHUNK_SIZE),
    );
  }

  /** Sincroniza uma conexão e sempre devolve o `sync_run` resultante. */
  async syncConnection(
    connection: ConnectionRow,
    options: SyncConnectionOptions = {},
  ): Promise<SyncRunRow> {
    const budget = options.budget ?? new RequestBudget(45);
    const startedAt = this.now();
    const startedIso = startedAt.toISOString();
    const today = toIsoDate(startedAt);
    const runId = crypto.randomUUID();

    // Duas escritas em um único batch (1 query D1).
    await runBatches(this.db, [
      this.db
        .update(connections)
        .set({ status: "syncing", updatedAt: startedIso })
        .where(eq(connections.id, connection.id)),
      this.db.insert(syncRuns).values({
        id: runId,
        connectionId: connection.id,
        startedAt: startedIso,
        finishedAt: null,
        status: "running",
        errorCode: null,
        errorMessage: null,
        statsJson: null,
      }),
    ]);

    const runState = await this.loadRunState(connection.id);
    const pending = runState.pending;
    const nextPending: Record<string, PendingCursor> = { ...pending };
    let backfill: BackfillState = runState.backfill;
    const stats: SyncRunStats = {
      accounts: 0,
      transactions: 0,
      bills: 0,
      investments: 0,
      balanceSnapshots: 0,
    };
    let deferred = false;

    try {
      const provider = this.providers.require(connection.provider as ProviderId);
      // "Sincronizar agora" pede dados novos ao provider quando ele suporta
      // (MeuPluggy não aceita PATCH: o provider devolve `refreshed: false`).
      // Falha aqui não bloqueia a leitura; o webhook `item/updated` traz o
      // resultado do update quando ele terminar.
      if (options.refresh && provider.refreshConnection && budget.remaining >= 3) {
        budget.take(2);
        try {
          const refresh = await provider.refreshConnection(connection.externalId);
          // MeuPluggy gasta só o GET do item (1); conector comum gasta GET+PATCH.
          budget.settle(2, refresh.refreshed ? 2 : 1);
          console.log(
            JSON.stringify({
              event: "sync_refresh_requested",
              connectionId: connection.id,
              refreshed: refresh.refreshed,
              detail: refresh.detail ?? null,
            }),
          );
        } catch (error) {
          budget.settle(2, 0);
          console.warn(
            JSON.stringify({
              event: "sync_refresh_failed",
              connectionId: connection.id,
              error: error instanceof Error ? error.name : typeof error,
            }),
          );
        }
      }

      if (!budget.take(1)) throw budgetExhausted();
      const providerConnection = await provider.getConnection(connection.externalId);

      const institution = await upsertInstitution(
        this.db,
        provider.id,
        providerConnection.institution,
      );
      // `ProviderConnection.lastSyncedAt` é o frescor do dado no provider
      // (`Item.lastUpdatedAt`), não a hora da leitura. Guardar separado permite
      // ancorar a janela incremental no snapshot anterior.
      const providerUpdatedAt = providerConnection.lastSyncedAt ?? null;
      await this.db
        .update(connections)
        .set({
          institutionId: institution.id,
          statusDetail: providerConnection.statusDetail ?? null,
          consentExpiresAt: providerConnection.consentExpiresAt ?? null,
          ...(providerUpdatedAt ? { providerUpdatedAt } : {}),
        })
        .where(eq(connections.id, connection.id));

      if (
        providerConnection.status === "login_required" ||
        providerConnection.status === "disconnected"
      ) {
        return this.finish({
          connection,
          runId,
          startedAt: startedIso,
          stats,
          pending: nextPending,
          backfill,
          success: false,
          status: providerConnection.status,
          errorCode:
            providerConnection.status === "login_required" ? "login_required" : "disconnected",
          errorMessage: "A conexão precisa ser reautenticada no provider.",
          initialComplete: false,
        });
      }

      // Reserva conservadora para `/accounts` (até 2 páginas de 500). O cache
      // do provider reaproveita essas páginas em getCreditCards/getBalances.
      if (!budget.take(2)) throw budgetExhausted();
      const providerAccounts = await provider.getAccounts(connection.externalId, {
        maxPages: 2,
      });
      stats.accounts = providerAccounts.length;
      const accountRows = await this.upsertAccounts(connection, providerAccounts);
      const accountByExternal = new Map(accountRows.map((row) => [row.externalId, row]));

      const providerCards = await provider.getCreditCards(connection.externalId);
      const cardStatements = this.buildCreditCardStatements(providerCards, accountByExternal);

      const billIds = await this.syncBills(
        connection,
        providerAccounts,
        accountByExternal,
        async (externalId) => {
          if (!budget.take(1)) {
            deferred = true;
            return [];
          }
          // Uma página cobre 500 faturas; o suficiente para o histórico do app.
          return provider.getBills(externalId, { maxPages: 1 });
        },
        stats,
        cardStatements,
      );

      // Contexto do mapeamento em UMA query (`db.batch` = 1 no D1 Free):
      // categorias de sistema (quando o chamador não as passou) e o nome do
      // titular — transferência cuja contraparte é ele mesmo não é
      // receita/despesa.
      const { categoryIds, holderNames } = await this.loadMappingContext(
        connection,
        options.categoryIds,
      );
      // Normalizado uma vez por sync: o backfill não recalcula o nome por linha.
      const holderTokens = holderTokenSets(holderNames);

      // Reserva o teto de transações de uma vez e devolve o que não foi usado,
      // para que o orçamento compartilhado entre contas seja real.
      const transactionAllowance = Math.min(TRANSACTION_REQUEST_BUDGET, budget.remaining);
      if (transactionAllowance > 0) budget.take(transactionAllowance);
      let transactionRequests = 0;
      const transactionStatements: BatchItem[] = [];

      for (const account of providerAccounts) {
        const local = accountByExternal.get(account.externalId);
        if (!local) continue;

        const pendingCursor = pending[account.externalId];
        const window = pendingCursor ?? this.windowFor(local, connection, providerUpdatedAt, today);
        const remainingAllowance = transactionAllowance - transactionRequests;

        if (remainingAllowance <= 0) {
          nextPending[account.externalId] = pendingCursor ?? { ...window, cursor: null };
          deferred = true;
          continue;
        }

        const page = await this.fetchTransactions(
          provider,
          account,
          window,
          Math.min(10, remainingAllowance),
          (local.amountSignConvention as AmountSignConvention | null) ?? null,
          holderNames,
        );
        transactionRequests += page.requestCount;

        transactionStatements.push(
          ...this.buildTransactionStatements({
            connection,
            accountId: local.id,
            transactions: page.transactions,
            categoryIds,
            billIds,
          }),
        );
        stats.transactions = (stats.transactions ?? 0) + page.transactions.length;

        const accountUpdate: Partial<typeof accounts.$inferInsert> = {};
        if (
          page.detectedSignConvention &&
          page.detectedSignConvention !== local.amountSignConvention
        ) {
          accountUpdate.amountSignConvention = page.detectedSignConvention;
          local.amountSignConvention = page.detectedSignConvention;
        }

        if (page.partial && page.nextCursor) {
          nextPending[account.externalId] = {
            from: window.from,
            to: window.to,
            cursor: page.nextCursor,
          };
        } else {
          delete nextPending[account.externalId];
          // Só marca o histórico como completo quando a última página chegou
          // sem cursor pendente. Uma fatia parcial mantém a conta em modo
          // "histórico inicial" no próximo POST/cron.
          if (!local.historySyncedAt) {
            accountUpdate.historySyncedAt = this.now().toISOString();
            local.historySyncedAt = accountUpdate.historySyncedAt;
          }
        }

        if (Object.keys(accountUpdate).length > 0) {
          transactionStatements.push(
            this.db.update(accounts).set(accountUpdate).where(eq(accounts.id, local.id)),
          );
        }
      }
      // Um único batch para todas as contas da conexão.
      await runBatches(this.db, transactionStatements);
      budget.settle(transactionAllowance, transactionRequests);

      // Histórico já gravado antes da regra (type income/expense) é corrigido
      // aqui, em lotes: o sync incremental não revisita linhas antigas e ler o
      // extrato inteiro a cada sync estouraria o CPU do Free.
      backfill = await this.reclassifyInternalMovements(connection.userId, backfill, holderTokens);

      if (provider.capabilities.supportsInvestments) {
        if (budget.take(1)) {
          const providerInvestments = await provider.getInvestments(connection.externalId, {
            maxPages: 1,
          });
          stats.investments = providerInvestments.length;
          await this.upsertInvestments(connection, providerInvestments);
        } else {
          deferred = true;
        }
      }

      // getBalances usa o cache de contas de getAccounts (0 subrequests no Pluggy).
      const balances = await provider.getBalances(connection.externalId);
      const balanceStatements = this.buildBalanceStatements(balances, accountByExternal);
      stats.balanceSnapshots = await this.persistSnapshots({
        connection,
        accountRows,
        balances,
        today,
        // Histórico demo só é reconstruído com a janela completa: com cursor
        // pendente o somatório de transações estaria incompleto.
        partialHistory: Object.keys(nextPending).length > 0,
        extraStatements: balanceStatements,
      });

      const hasPending = Object.keys(nextPending).length > 0;
      const initialComplete = providerAccounts.every((account) => {
        const local = accountByExternal.get(account.externalId);
        return Boolean(local?.historySyncedAt);
      });
      return this.finish({
        connection,
        runId,
        startedAt: startedIso,
        stats,
        pending: nextPending,
        backfill,
        success: true,
        status: providerConnection.status === "outdated" ? "outdated" : "active",
        errorCode: null,
        errorMessage: null,
        statusDetail:
          providerConnection.statusDetail ?? (hasPending || deferred ? "PARTIAL_SYNC" : null),
        initialComplete,
      });
    } catch (error) {
      const providerError = isProviderError(error) ? error : null;
      const status: ProviderConnectionStatus =
        providerError?.code === "login_required" ? "login_required" : "error";

      return this.finish({
        connection,
        runId,
        startedAt: startedIso,
        stats,
        pending: nextPending,
        backfill,
        success: false,
        status,
        errorCode: providerError?.code ?? "internal_error",
        // Mensagens do ProviderError são sanitizadas pelo pacote de providers.
        errorMessage: providerError?.message ?? "Falha inesperada na sincronização.",
        initialComplete: false,
      });
    }
  }

  /**
   * Sincroniza até `limit` conexões ativas, priorizando as que têm histórico
   * fatiado (`PARTIAL_SYNC`) e, depois, as sincronizadas há mais tempo. Assim o
   * cron continua uma importação interrompida em vez de deixá-la para trás.
   * O orçamento de subrequests é compartilhado por toda a invocação.
   */
  async syncDueConnections(limit = 3, budgetLimit = 45): Promise<SyncRunRow[]> {
    const due = await this.db
      .select()
      .from(connections)
      .where(inArray(connections.status, ["active", "syncing", "outdated"]))
      .orderBy(
        sql`CASE WHEN ${connections.statusDetail} = 'PARTIAL_SYNC' THEN 0 ELSE 1 END`,
        sql`${connections.lastSyncedAt} IS NOT NULL`,
        asc(connections.lastSyncedAt),
      )
      .limit(limit);

    return this.syncConnections(due, budgetLimit);
  }

  /**
   * Sincroniza uma lista de conexões com um único orçamento e um único
   * carregamento de categorias. Para no orçamento antes de iniciar a próxima.
   */
  async syncConnections(
    targets: ConnectionRow[],
    budgetLimit = 45,
    options: Pick<SyncConnectionOptions, "refresh"> = {},
  ): Promise<SyncRunRow[]> {
    if (targets.length === 0) return [];
    const budget = new RequestBudget(budgetLimit);
    // Uma leitura de categorias para a invocação inteira (o cron pode sincronizar
    // conexões de donos diferentes).
    const categoryIds = await this.loadSystemCategories();
    const runs: SyncRunRow[] = [];
    for (const connection of targets) {
      // Não inicia conexão que não cabe no orçamento restante; ela fica para o
      // próximo cron em vez de estourar os 50 subrequests e falhar.
      if (budget.remaining < MIN_CONNECTION_BUDGET) break;
      runs.push(
        await this.syncConnection(connection, {
          budget,
          categoryIds,
          ...(options.refresh ? { refresh: true } : {}),
        }),
      );
    }
    return runs;
  }

  /** Marca a conexão como desconectada (ex.: `item/deleted` do webhook). */
  async markDisconnected(connectionId: string, detail = "ITEM_DELETED"): Promise<void> {
    await this.db
      .update(connections)
      .set({ status: "disconnected", statusDetail: detail, updatedAt: this.now().toISOString() })
      .where(eq(connections.id, connectionId));
  }

  /**
   * Apaga transações removidas no provider (`transactions/deleted`). É
   * idempotente: ids inexistentes simplesmente não afetam linhas. O evento não
   * é fonte de verdade, então um sync posterior pode recriar a transação se ela
   * reaparecer no Pluggy.
   */
  async deleteTransactions(connectionId: string, externalIds: readonly string[]): Promise<number> {
    const ids = [...new Set(externalIds.filter((id) => typeof id === "string" && id.length > 0))];
    if (ids.length === 0) return 0;

    // D1 limita 100 variáveis por statement; 50 ids + connectionId é seguro.
    const statements = chunk(ids, 50).map((part) =>
      this.db
        .delete(transactions)
        .where(
          and(eq(transactions.connectionId, connectionId), inArray(transactions.externalId, part)),
        ),
    );
    await runBatches(this.db, statements);
    return ids.length;
  }

  private async finish(input: {
    connection: ConnectionRow;
    runId: string;
    startedAt: string;
    stats: SyncRunStats;
    pending: Record<string, PendingCursor>;
    /** Progresso da reclassificação do histórico (vai em `stats_json`). */
    backfill: BackfillState;
    success: boolean;
    status: ProviderConnectionStatus;
    errorCode: string | null;
    errorMessage: string | null;
    statusDetail?: string | null;
    /** `true` quando todas as contas já importaram o histórico inicial. */
    initialComplete: boolean;
  }): Promise<SyncRunRow> {
    const finishedAt = this.now().toISOString();
    const hasPending = Object.keys(input.pending).length > 0;
    const storedStats: StoredStats = {
      ...input.stats,
      ...(hasPending ? { _pending: input.pending } : {}),
      _backfill: input.backfill,
    };
    const statsJson = JSON.stringify(storedStats);
    const status: SyncRunRow["status"] = input.success ? "success" : "error";
    // Na primeira sync, `last_synced_at` fica NULL enquanto houver histórico
    // inicial pendente; assim a próxima chamada continua a janela completa.
    const lastSyncedAt =
      input.success && input.initialComplete ? finishedAt : input.connection.lastSyncedAt;

    await runBatches(this.db, [
      this.db
        .update(syncRuns)
        .set({
          finishedAt,
          status,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          statsJson,
        })
        .where(eq(syncRuns.id, input.runId)),
      this.db
        .update(connections)
        .set({
          status: input.status,
          statusDetail:
            input.statusDetail ?? (input.success ? null : (input.errorCode ?? "SYNC_ERROR")),
          lastSyncedAt,
          updatedAt: finishedAt,
        })
        .where(eq(connections.id, input.connection.id)),
    ]);

    // Constrói a linha em vez de reler (economiza 1 query D1 por sync).
    return {
      id: input.runId,
      connectionId: input.connection.id,
      startedAt: input.startedAt,
      finishedAt,
      status,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      statsJson,
    };
  }

  /**
   * Estado da execução anterior: cursor de páginas (`_pending`) e progresso da
   * reclassificação do histórico (`_backfill`). Uma query, a mesma que já lia
   * os cursores.
   */
  private async loadRunState(connectionId: string): Promise<{
    pending: Record<string, PendingCursor>;
    backfill: BackfillState;
  }> {
    const fresh: BackfillState = {
      version: INTERNAL_MOVEMENT_RULE_VERSION,
      identity: "",
      cursor: null,
      done: false,
    };

    const [last] = await this.db
      .select({ statsJson: syncRuns.statsJson })
      .from(syncRuns)
      .where(and(eq(syncRuns.connectionId, connectionId), sql`${syncRuns.statsJson} IS NOT NULL`))
      // `startedAt` pode empatar (testes com relógio fixo e syncs no mesmo
      // segundo); `rowid` desempata pela ordem de inserção.
      .orderBy(sql`${syncRuns.startedAt} DESC, rowid DESC`)
      .limit(1);

    if (!last?.statsJson) return { pending: {}, backfill: fresh };
    try {
      const parsed = JSON.parse(last.statsJson) as StoredStats;
      return {
        pending: parsePendingCursors(parsed._pending),
        backfill: parseBackfillState(parsed._backfill, fresh),
      };
    } catch {
      return { pending: {}, backfill: fresh };
    }
  }

  private windowFor(
    account: AccountRow,
    connection: ConnectionRow,
    providerUpdatedAt: string | null,
    today: string,
  ): PendingCursor {
    // Conta nova (ou que ainda não completou o histórico) sempre começa pela
    // janela cheia, mesmo que a conexão já tenha sido sincronizada por outra
    // conta. Só depois de `history_synced_at` o sync vira incremental.
    if (!account.historySyncedAt) {
      return { from: addDays(today, -(INITIAL_WINDOW_DAYS - 1)), to: today, cursor: null };
    }
    // O snapshot do provider manda, não a hora da leitura: se o MeuPluggy ficou
    // dias sem atualizar, a janela começa antes da última atualização conhecida
    // (`provider_updated_at` anterior) e cobre o extrato que chega de uma vez.
    // O menor valor entre as referências só alarga a janela; nunca perde uma
    // transação retroativa.
    const anchor =
      oldestDate([
        connection.lastSyncedAt,
        connection.providerUpdatedAt,
        providerUpdatedAt,
        account.historySyncedAt,
      ]) ?? today;
    const floor = addDays(today, -(INITIAL_WINDOW_DAYS - 1));
    const from = maxDate(addDays(anchor, -INCREMENTAL_OVERLAP_DAYS), floor);
    return { from: from > today ? today : from, to: today, cursor: null };
  }

  private async fetchTransactions(
    provider: ReturnType<ProviderRegistry["require"]>,
    account: ProviderAccount,
    window: PendingCursor,
    requestBudget: number,
    amountSignConvention: AmountSignConvention | null,
    holderNames: readonly string[],
  ): Promise<{
    transactions: ProviderTransaction[];
    nextCursor: string | null;
    partial: boolean;
    requestCount: number;
    detectedSignConvention?: AmountSignConvention | null;
    signConventionSampleSize?: number;
  }> {
    const options = {
      from: window.from,
      to: window.to,
      cursor: window.cursor,
      maxPages: MAX_PAGES_PER_ACCOUNT,
      requestBudget,
      accountType: account.type === "credit_card" ? ("credit_card" as const) : ("bank" as const),
      amountSignConvention,
      ...(holderNames.length > 0 ? { holderNames } : {}),
    };

    if (provider.getTransactionsPage) {
      return provider.getTransactionsPage(account.externalId, options);
    }

    const list = await provider.getTransactions(account.externalId, options);
    return { transactions: list, nextCursor: null, partial: false, requestCount: 0 };
  }

  private async upsertAccounts(
    connection: ConnectionRow,
    providerAccounts: ProviderAccount[],
  ): Promise<AccountRow[]> {
    if (providerAccounts.length === 0) return [];
    const updatedAt = this.now().toISOString();

    const statements = chunk(providerAccounts, UPSERT_CHUNK_SIZE).map((part) =>
      this.db
        .insert(accounts)
        .values(
          part.map((account) => ({
            id: crypto.randomUUID(),
            userId: connection.userId,
            connectionId: connection.id,
            externalId: account.externalId,
            type: account.type,
            subtype: account.subtype ?? null,
            name: account.name,
            numberMasked: account.numberMasked ?? null,
            institutionName: account.institutionName?.trim() || null,
            currency: "BRL",
            balanceCents: Math.round(account.balanceCents),
            availableCents:
              account.availableCents === undefined || account.availableCents === null
                ? null
                : Math.round(account.availableCents),
            updatedAt: account.updatedAt ?? updatedAt,
          })),
        )
        .onConflictDoUpdate({
          target: [accounts.connectionId, accounts.externalId],
          set: {
            type: sql`excluded.type`,
            subtype: sql`excluded.subtype`,
            name: sql`excluded.name`,
            numberMasked: sql`excluded.number_masked`,
            institutionName: sql`excluded.institution_name`,
            currency: sql`excluded.currency`,
            balanceCents: sql`excluded.balance_cents`,
            availableCents: sql`excluded.available_cents`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .returning(),
    );

    const rows: AccountRow[] = [];
    for (const group of chunk(statements, BATCH_STATEMENTS_PER_CALL)) {
      const results = await this.db.batch(group as unknown as [BatchItem, ...BatchItem[]]);
      // Cada statement com RETURNING devolve um array de linhas.
      for (const result of results) rows.push(...(result as unknown as AccountRow[]));
    }
    return rows;
  }

  private buildCreditCardStatements(
    providerCards: ProviderCreditCard[],
    accountByExternal: Map<string, AccountRow>,
  ): BatchItem[] {
    const values = providerCards.flatMap((card) => {
      const account = accountByExternal.get(card.accountExternalId);
      if (!account) return [];
      return [
        {
          accountId: account.id,
          brand: card.brand ?? null,
          level: card.level ?? null,
          limitCents:
            card.limitCents === undefined || card.limitCents === null
              ? null
              : Math.round(card.limitCents),
          availableLimitCents:
            card.availableLimitCents === undefined || card.availableLimitCents === null
              ? null
              : Math.round(card.availableLimitCents),
          closingDay: card.closingDay ?? null,
          dueDay: card.dueDay ?? null,
        },
      ];
    });
    if (values.length === 0) return [];

    return chunk(values, UPSERT_CHUNK_SIZE).map((part) =>
      this.db
        .insert(creditCards)
        .values(part)
        .onConflictDoUpdate({
          target: creditCards.accountId,
          set: {
            brand: sql`excluded.brand`,
            level: sql`excluded.level`,
            limitCents: sql`excluded.limit_cents`,
            availableLimitCents: sql`excluded.available_limit_cents`,
            closingDay: sql`excluded.closing_day`,
            dueDay: sql`excluded.due_day`,
          },
        }),
    );
  }

  /** Upsert de faturas e retorno do mapa `accountExternalId|billExternalId` → id local. */
  private async syncBills(
    connection: ConnectionRow,
    providerAccounts: ProviderAccount[],
    accountByExternal: Map<string, AccountRow>,
    fetchBills: (accountExternalId: string) => Promise<ProviderBill[]>,
    stats: SyncRunStats,
    extraStatements: BatchItem[] = [],
  ): Promise<Map<string, string>> {
    const billIds = new Map<string, string>();
    const statements: BatchItem[] = [...extraStatements];

    for (const account of providerAccounts) {
      if (account.type !== "credit_card") continue;
      const local = accountByExternal.get(account.externalId);
      if (!local) continue;

      const providerBills = await fetchBills(account.externalId);
      stats.bills = (stats.bills ?? 0) + providerBills.length;
      for (const part of chunk(providerBills, UPSERT_CHUNK_SIZE)) {
        statements.push(
          this.db
            .insert(bills)
            .values(
              part.map((bill) => ({
                id: crypto.randomUUID(),
                accountId: local.id,
                externalId: bill.externalId,
                dueDate: bill.dueDate.slice(0, 10),
                closingDate: bill.closingDate?.slice(0, 10) ?? null,
                totalCents: Math.round(bill.totalCents),
                minimumPaymentCents:
                  bill.minimumPaymentCents === undefined || bill.minimumPaymentCents === null
                    ? null
                    : Math.round(bill.minimumPaymentCents),
                status: bill.status,
              })),
            )
            .onConflictDoUpdate({
              target: [bills.accountId, bills.externalId],
              set: {
                dueDate: sql`excluded.due_date`,
                closingDate: sql`excluded.closing_date`,
                totalCents: sql`excluded.total_cents`,
                minimumPaymentCents: sql`excluded.minimum_payment_cents`,
                status: sql`excluded.status`,
              },
            }),
        );
      }
    }

    await runBatches(this.db, statements);

    if (statements.length > 0) {
      // Uma consulta para todas as faturas da conexão (antes era 1 por cartão).
      const rows = await this.db
        .select({
          id: bills.id,
          externalId: bills.externalId,
          accountExternalId: accounts.externalId,
        })
        .from(bills)
        .innerJoin(accounts, eq(accounts.id, bills.accountId))
        .where(eq(accounts.connectionId, connection.id));
      for (const row of rows) {
        billIds.set(`${row.accountExternalId}|${row.externalId}`, row.id);
      }
    }

    return billIds;
  }

  /** Categorias de sistema (uma query por invocação, reaproveitada no cron). */
  private async loadSystemCategories(): Promise<Map<string, string>> {
    const rows = await this.db
      .select({ id: categories.id, slug: categories.slug })
      .from(categories)
      .where(isNull(categories.userId));
    return new Map(rows.map((row) => [row.slug, row.id]));
  }

  /**
   * Contexto do mapeamento em **uma** query (`db.batch` conta como 1 no D1
   * Free): categorias de sistema (quando o chamador não as passou) e
   * `users.name`, usado para reconhecer transferência cuja contraparte é o
   * próprio titular. Cacheado por usuário — o cron pode sincronizar mais de uma
   * conexão do mesmo dono.
   */
  private async loadMappingContext(
    connection: ConnectionRow,
    providedCategoryIds?: Map<string, string>,
  ): Promise<{ categoryIds: Map<string, string>; holderNames: string[] }> {
    const cached = this.mappingContextCache.get(connection.userId);
    if (cached) {
      return providedCategoryIds ? { ...cached, categoryIds: providedCategoryIds } : cached;
    }

    const statements: BatchItem[] = [];
    if (!providedCategoryIds) {
      statements.push(
        this.db
          .select({ id: categories.id, slug: categories.slug })
          .from(categories)
          .where(isNull(categories.userId)),
      );
    }
    statements.push(
      this.db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, connection.userId))
        .limit(1),
    );

    const results = (await this.db.batch(
      statements as unknown as [BatchItem, ...BatchItem[]],
    )) as unknown as unknown[][];
    // Sem categorias fornecidas, elas vêm primeiro no batch.
    const categoriesAt = providedCategoryIds ? null : 0;
    const categoryRows =
      categoriesAt === null ? null : (results[categoriesAt] as Array<{ id: string; slug: string }>);
    const userRows = results[categoriesAt === null ? 0 : 1] as Array<{ name: string }>;

    const holderName = userRows[0]?.name?.trim();
    const context = {
      categoryIds:
        providedCategoryIds ?? new Map((categoryRows ?? []).map((row) => [row.slug, row.id])),
      holderNames: holderName ? [holderName] : [],
    };
    this.mappingContextCache.set(connection.userId, context);
    return context;
  }

  /**
   * Corrige `type` de lançamentos gravados antes da regra de movimentação
   * interna (transferência entre contas do titular não é receita/despesa). O
   * sync incremental só revisita ~7 dias, então sem isso o histórico
   * continuaria inflando os KPIs.
   *
   * Custo controlado: o progresso vive em `stats_json` (`_backfill`) e cada
   * execução processa `RECLASSIFY_CHUNK_SIZE` linhas com keyset em
   * `transactions.id`. Histórico concluído (ou titular/regra inalterados) custa
   * **zero** leitura. Falha aqui não derruba o sync: o cursor não avança e a
   * próxima execução retoma do mesmo ponto.
   */
  private async reclassifyInternalMovements(
    userId: string,
    state: BackfillState,
    holderTokens: HolderTokenSet,
  ): Promise<BackfillState> {
    const identity = holderIdentity(holderTokens);
    if (!identity) {
      // Nome do titular sem 2 tokens significativos (ex.: users.name = login do
      // GitHub): a regra fica desligada e o estado registra isso.
      return { version: INTERNAL_MOVEMENT_RULE_VERSION, identity, cursor: null, done: true };
    }

    const current: BackfillState =
      state.version === INTERNAL_MOVEMENT_RULE_VERSION && state.identity === identity
        ? state
        : { version: INTERNAL_MOVEMENT_RULE_VERSION, identity, cursor: null, done: false };
    if (current.done) return current;

    try {
      const separators = COUNTERPARTY_SEPARATORS.map(
        (separator) => sql`instr(${transactions.description}, ${separator}) > 0`,
      );
      const where = [
        eq(transactions.userId, userId),
        inArray(transactions.type, ["income", "expense"]),
        // O mapper só aplica a regra em conta que não é cartão: o backfill
        // segue o mesmo recorte (pagamento de fatura já entra como transfer).
        sql`EXISTS (SELECT 1 FROM accounts a WHERE a.id = ${transactions.accountId} AND a.type <> 'credit_card')`,
        // Só descrições com separador de contraparte podem casar.
        sql`(${sql.join(separators, sql` OR `)})`,
      ];
      if (current.cursor) where.push(sql`${transactions.id} > ${current.cursor}`);

      const rows = await this.db
        .select({ id: transactions.id, description: transactions.description })
        .from(transactions)
        .where(and(...where))
        .orderBy(transactions.id)
        .limit(this.reclassifyChunkSize);

      const ids = rows
        .filter((row) => matchesInternalMovement(row.description, holderTokens))
        .map((row) => row.id);
      if (ids.length > 0) {
        const updatedAt = this.now().toISOString();
        await runBatches(
          this.db,
          chunk(ids, 50).map((part) =>
            this.db
              .update(transactions)
              .set({ type: "transfer", updatedAt })
              .where(inArray(transactions.id, part)),
          ),
        );
      }

      return {
        ...current,
        cursor: rows[rows.length - 1]?.id ?? current.cursor,
        done: rows.length < this.reclassifyChunkSize,
      };
    } catch (error) {
      // Não fatal: o sync já gravou as transações; o cursor não avança e a
      // reclassificação continua no próximo ciclo. Log sem dados pessoais.
      console.warn(
        JSON.stringify({
          event: "reclassify_failed",
          error: error instanceof Error ? error.name : "unknown",
        }),
      );
      return current;
    }
  }

  private buildTransactionStatements(input: {
    connection: ConnectionRow;
    accountId: string;
    transactions: ProviderTransaction[];
    categoryIds: Map<string, string>;
    billIds: Map<string, string>;
  }): BatchItem[] {
    if (input.transactions.length === 0) return [];
    const now = this.now().toISOString();

    const values = input.transactions.map((transaction) => {
      const categoryId =
        input.categoryIds.get(transaction.categoryHint) ??
        input.categoryIds.get(CATEGORY_SLUG_ALIASES[transaction.categoryHint] ?? "") ??
        input.categoryIds.get("outros") ??
        null;
      const billExternalId = transaction.billExternalId ?? null;
      const billId =
        billExternalId === null
          ? null
          : (input.billIds.get(`${transaction.accountExternalId}|${billExternalId}`) ?? null);

      return {
        id: crypto.randomUUID(),
        userId: input.connection.userId,
        accountId: input.accountId,
        connectionId: input.connection.id,
        externalId: transaction.externalId,
        date: transaction.date,
        description: transaction.description,
        amountCents: Math.round(transaction.amountCents),
        currency: "BRL",
        type: transaction.type,
        categoryId,
        categorySource: "provider" as const,
        status: transaction.status,
        billId,
        merchant: transaction.merchant ?? null,
        notes: null,
        installmentNumber: transaction.installmentNumber ?? null,
        totalInstallments: transaction.totalInstallments ?? null,
        createdAt: transaction.createdAt ?? now,
        updatedAt: now,
      };
    });

    const statements = chunk(values, TRANSACTION_CHUNK_SIZE).map((part) =>
      this.db
        .insert(transactions)
        .values(part)
        .onConflictDoUpdate({
          target: [transactions.accountId, transactions.externalId],
          set: {
            date: sql`excluded.date`,
            description: sql`excluded.description`,
            amountCents: sql`excluded.amount_cents`,
            currency: sql`excluded.currency`,
            type: sql`excluded.type`,
            status: sql`excluded.status`,
            billId: sql`excluded.bill_id`,
            merchant: sql`excluded.merchant`,
            installmentNumber: sql`excluded.installment_number`,
            totalInstallments: sql`excluded.total_installments`,
            updatedAt: sql`excluded.updated_at`,
            // Edição manual do usuário vence o sync.
            categoryId: sql`CASE WHEN category_source = 'user' THEN category_id ELSE excluded.category_id END`,
            categorySource: sql`CASE WHEN category_source = 'user' THEN category_source ELSE 'provider' END`,
          },
        }),
    );
    return statements;
  }

  private async upsertInvestments(
    connection: ConnectionRow,
    providerInvestments: ProviderInvestment[],
  ): Promise<void> {
    if (providerInvestments.length === 0) return;
    const now = this.now().toISOString();

    const statements = chunk(providerInvestments, UPSERT_CHUNK_SIZE).map((part) =>
      this.db
        .insert(investments)
        .values(
          part.map((investment) => ({
            id: crypto.randomUUID(),
            userId: connection.userId,
            connectionId: connection.id,
            externalId: investment.externalId,
            type: investment.type,
            name: investment.name,
            balanceCents: Math.round(investment.balanceCents),
            amountProfitCents:
              investment.amountProfitCents === undefined || investment.amountProfitCents === null
                ? null
                : Math.round(investment.amountProfitCents),
            currency: "BRL",
            updatedAt: investment.updatedAt ?? now,
          })),
        )
        .onConflictDoUpdate({
          target: [investments.connectionId, investments.externalId],
          set: {
            type: sql`excluded.type`,
            name: sql`excluded.name`,
            balanceCents: sql`excluded.balance_cents`,
            amountProfitCents: sql`excluded.amount_profit_cents`,
            currency: sql`excluded.currency`,
            updatedAt: sql`excluded.updated_at`,
          },
        }),
    );
    await runBatches(this.db, statements);
  }

  private buildBalanceStatements(
    balances: ProviderBalance[],
    accountByExternal: Map<string, AccountRow>,
  ): BatchItem[] {
    return balances.flatMap((balance) => {
      const account = accountByExternal.get(balance.accountExternalId);
      if (!account) return [];
      return [
        this.db
          .update(accounts)
          .set({
            balanceCents: Math.round(balance.balanceCents),
            availableCents:
              balance.availableCents === undefined || balance.availableCents === null
                ? null
                : Math.round(balance.availableCents),
            updatedAt: balance.updatedAt,
          })
          .where(eq(accounts.id, account.id)),
      ];
    });
  }

  private async persistSnapshots(input: {
    connection: ConnectionRow;
    accountRows: AccountRow[];
    balances: ProviderBalance[];
    today: string;
    /** Sync incompleto (cursor pendente): não reconstrói o histórico demo. */
    partialHistory: boolean;
    /** Atualizações de saldo para irem no mesmo batch dos snapshots. */
    extraStatements?: BatchItem[];
  }): Promise<number> {
    const balanceByExternal = new Map(
      input.balances.map((balance) => [balance.accountExternalId, balance.balanceCents]),
    );
    const isDemo = input.connection.provider === "demo";
    const rows: Array<{ accountId: string; date: string; balanceCents: number }> = [];
    const rebuildHistory = isDemo && !input.partialHistory;
    const dailyByAccount = new Map<string, Map<string, number>>();
    const totalByAccount = new Map<string, number>();

    if (rebuildHistory && input.accountRows.length > 0) {
      const accountIds = input.accountRows.map((account) => account.id);
      const since = addDays(input.today, -(SNAPSHOT_MAX_HISTORY_DAYS - 1));
      // Agrega no SQL em vez de carregar todas as transações no Worker: além de
      // correto após uma retomada de cursor, cabe no CPU/memória do Free.
      const [dailyRows, totalRows] = await Promise.all([
        this.db
          .select({
            accountId: transactions.accountId,
            date: transactions.date,
            amountCents: sql<number>`SUM(${transactions.amountCents})`,
          })
          .from(transactions)
          .where(
            and(
              inArray(transactions.accountId, accountIds),
              eq(transactions.status, "posted"),
              gte(transactions.date, since),
            ),
          )
          .groupBy(transactions.accountId, transactions.date),
        this.db
          .select({
            accountId: transactions.accountId,
            amountCents: sql<number>`SUM(${transactions.amountCents})`,
          })
          .from(transactions)
          .where(
            and(inArray(transactions.accountId, accountIds), eq(transactions.status, "posted")),
          )
          .groupBy(transactions.accountId),
      ]);

      for (const row of dailyRows) {
        const sums = dailyByAccount.get(row.accountId) ?? new Map<string, number>();
        sums.set(row.date, Number(row.amountCents));
        dailyByAccount.set(row.accountId, sums);
      }
      for (const row of totalRows) {
        totalByAccount.set(row.accountId, Number(row.amountCents));
      }
    }

    // Datas já gravadas (1 query) para não reescrever histórico estável a cada
    // sync. Só os últimos dias são sempre reescritos (transações podem mudar).
    const existingByAccount = new Map<string, Set<string>>();
    if (rebuildHistory && input.accountRows.length > 0) {
      const existing = await this.db
        .select({ accountId: balanceSnapshots.accountId, date: balanceSnapshots.date })
        .from(balanceSnapshots)
        .where(
          and(
            inArray(
              balanceSnapshots.accountId,
              input.accountRows.map((account) => account.id),
            ),
            gte(balanceSnapshots.date, addDays(input.today, -(SNAPSHOT_MAX_HISTORY_DAYS - 1))),
          ),
        );
      for (const row of existing) {
        const dates = existingByAccount.get(row.accountId) ?? new Set<string>();
        dates.add(row.date);
        existingByAccount.set(row.accountId, dates);
      }
    }
    const rewriteRecentFrom = addDays(input.today, -SNAPSHOT_REWRITE_RECENT_DAYS);

    for (const account of input.accountRows) {
      const current = balanceByExternal.get(account.externalId) ?? account.balanceCents;

      if (!rebuildHistory) {
        rows.push({ accountId: account.id, date: input.today, balanceCents: Math.round(current) });
        continue;
      }

      const posted = dailyByAccount.get(account.id) ?? new Map<string, number>();
      const dailySums = posted;
      const total = totalByAccount.get(account.id) ?? 0;
      const earliest = [...dailySums.keys()].sort()[0];
      const start = earliest
        ? maxDate(earliest, addDays(input.today, -(SNAPSHOT_MAX_HISTORY_DAYS - 1)))
        : input.today;

      const dates = snapshotDates(start, input.today);
      const transactionDates = [...dailySums.keys()].sort();
      let transactionIndex = 0;
      let cumulative = 0;
      // Conta corrente: saldo = abertura + Σ transações.
      // Cartão: `balanceCents` é dívida; compra (negativa) AUMENTA a dívida.
      // Usar o mesmo sinal do banco invertia a série histórica dos cartões.
      const direction = account.type === "credit_card" ? -1 : 1;
      const opening = current - direction * total;
      const existingDates = existingByAccount.get(account.id);

      for (const date of dates) {
        while (
          transactionIndex < transactionDates.length &&
          transactionDates[transactionIndex]! <= date
        ) {
          cumulative += dailySums.get(transactionDates[transactionIndex]!) ?? 0;
          transactionIndex += 1;
        }
        const balanceCents = Math.round(opening + direction * cumulative);
        if (existingDates?.has(date) && date < rewriteRecentFrom) continue;
        rows.push({ accountId: account.id, date, balanceCents });
      }
    }

    const statements: BatchItem[] = [...(input.extraStatements ?? [])];
    statements.push(
      ...chunk(rows, SNAPSHOT_CHUNK_SIZE).map((part) =>
        this.db
          .insert(balanceSnapshots)
          .values(part)
          .onConflictDoUpdate({
            target: [balanceSnapshots.accountId, balanceSnapshots.date],
            set: { balanceCents: sql`excluded.balance_cents` },
          }),
      ),
    );
    await runBatches(this.db, statements);

    return rows.length;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * Datas de snapshot: diárias nos últimos 90 dias e semanais (passo de 7 a
 * partir de hoje) no histórico mais antigo. Mantém a evolução patrimonial
 * coerente sem estourar writes/CPU do Free.
 */
function snapshotDates(start: string, today: string): string[] {
  const boundaries = new Set<string>([start, today]);
  const dailyFrom = addDays(today, -(DAILY_SNAPSHOT_DAYS - 1));

  for (let date = dailyFrom; date <= today; date = addDays(date, 1)) {
    boundaries.add(date);
  }
  for (let date = today; date >= start; date = addDays(date, -7)) {
    boundaries.add(date);
  }

  return [...boundaries].filter((date) => date >= start && date <= today).sort();
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

/** Menor data civil (`YYYY-MM-DD`) entre valores ISO; ignora nulos/inválidos. */
function oldestDate(values: ReadonlyArray<string | null | undefined>): string | null {
  let oldest: string | null = null;
  for (const value of values) {
    if (!value) continue;
    const date = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!oldest || date < oldest) oldest = date;
  }
  return oldest;
}
