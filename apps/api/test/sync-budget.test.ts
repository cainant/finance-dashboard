/**
 * Orçamento de subrequests do sync (Workers Free: 50/request).
 *
 * O provider fake conta cada chamada e pagina as transações para forçar
 * cursor pendente. O teste prova que:
 * - o orçamento é compartilhado entre contas e conexões;
 * - uma conexão que não cabe é adiada em vez de estourar o limite;
 * - o cursor pendente é persistido e retomado no sync seguinte;
 * - o histórico demo não é reconstruído com dados parciais.
 */
import { env } from "cloudflare:test";
import { addDays, todayIsoDate, type ProviderId } from "@fd/contracts";
import { accounts, balanceSnapshots } from "@fd/database/schema";
import type {
  FinancialProvider,
  ProviderAccount,
  ProviderConnection,
  ProviderRegistry,
  ProviderTransaction,
  ProviderTransactionsPage,
} from "@fd/financial-providers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { RequestBudget, SyncService } from "../src/sync/service";
import { createConnection } from "./fixtures";
import { createTestUser, db, resetDatabase } from "./helpers";

const NOW = new Date("2026-11-10T12:00:00.000Z");
const TODAY = todayIsoDate(NOW);
const CHECKING = "acc-checking";
const CARD = "acc-card";

interface FakeCalls {
  network: number;
  cursors: string[];
}

function providerAccount(externalId: string, type: "checking" | "credit_card"): ProviderAccount {
  return {
    externalId,
    connectionExternalId: "conn-1",
    type,
    subtype: type === "credit_card" ? "CREDIT_CARD" : "CHECKING_ACCOUNT",
    name: externalId,
    numberMasked: null,
    currency: "BRL",
    balanceCents: type === "credit_card" ? 50_000 : 100_000,
    availableCents: null,
    updatedAt: NOW.toISOString(),
  };
}

function transaction(accountExternalId: string, date: string): ProviderTransaction {
  return {
    externalId: `${accountExternalId}-${date}`,
    accountExternalId,
    date,
    description: "LANCAMENTO",
    amountCents: -1_000,
    currency: "BRL",
    type: "expense",
    status: "posted",
    categoryHint: "outros",
  };
}

function fakeProvider(calls: FakeCalls): FinancialProvider {
  return {
    id: "demo" as ProviderId,
    capabilities: {
      supportsManualRefresh: false,
      supportsWebhooks: false,
      supportsCreditCards: true,
      supportsInvestments: true,
    },
    async getConnection(externalId: string): Promise<ProviderConnection> {
      calls.network += 1;
      return {
        externalId,
        provider: "demo",
        status: "active",
        institution: { externalId: "inst-demo", name: "Banco Demo", type: "bank" },
      };
    },
    async getAccounts(): Promise<ProviderAccount[]> {
      calls.network += 1;
      return [providerAccount(CHECKING, "checking"), providerAccount(CARD, "credit_card")];
    },
    async getTransactions(): Promise<ProviderTransaction[]> {
      return [];
    },
    async getTransactionsPage(accountExternalId: string, opts): Promise<ProviderTransactionsPage> {
      calls.network += 1;
      if (opts.cursor) {
        calls.cursors.push(opts.cursor);
        return {
          transactions: [transaction(accountExternalId, TODAY)],
          nextCursor: null,
          partial: false,
          requestCount: 1,
        };
      }
      return {
        transactions: [transaction(accountExternalId, addDays(TODAY, -10))],
        nextCursor: `cursor-${accountExternalId}`,
        partial: true,
        requestCount: 1,
      };
    },
    async getCreditCards() {
      calls.network += 1;
      return [];
    },
    async getBills() {
      calls.network += 1;
      return [];
    },
    async getBalances() {
      calls.network += 1;
      return [
        {
          accountExternalId: CHECKING,
          balanceCents: 100_000,
          currency: "BRL",
          updatedAt: NOW.toISOString(),
        },
        {
          accountExternalId: CARD,
          balanceCents: 50_000,
          currency: "BRL",
          updatedAt: NOW.toISOString(),
        },
      ];
    },
    async getInvestments() {
      calls.network += 1;
      return [];
    },
  };
}

function registry(provider: FinancialProvider): ProviderRegistry {
  return {
    get: () => provider,
    require: () => provider,
    list: () => [],
  } as unknown as ProviderRegistry;
}

async function seedConnection(userId: string, externalId: string) {
  return createConnection({ userId, provider: "demo", externalId });
}

beforeEach(async () => {
  await resetDatabase();
});

describe("orçamento de subrequests do sync", () => {
  it("respeita o orçamento, persiste cursor e retoma no próximo sync", async () => {
    const user = await createTestUser();
    const connection = await seedConnection(user.id, "conn-1");
    const calls: FakeCalls = { network: 0, cursors: [] };
    const provider = fakeProvider(calls);
    const service = new SyncService({
      db,
      providers: registry(provider),
      now: () => NOW,
    });

    const first = await service.syncConnection(connection, {
      budget: new RequestBudget(10),
    });

    expect(calls.network).toBeLessThanOrEqual(10);
    expect(first.status).toBe("success");
    const stats = JSON.parse(first.statsJson ?? "{}") as {
      _pending?: Record<string, unknown>;
      balanceSnapshots: number;
    };
    expect(Object.keys(stats._pending ?? {}).sort()).toEqual([CARD, CHECKING].sort());
    // Sync parcial: só o snapshot de hoje (histórico não é reconstruído).
    expect(stats.balanceSnapshots).toBe(2);
    const snapshotRange = await env.DB.prepare(
      "SELECT MIN(date) AS minDate, MAX(date) AS maxDate FROM balance_snapshots",
    ).first<{ minDate: string | null; maxDate: string | null }>();
    expect(snapshotRange?.minDate).toBe(TODAY);
    expect(snapshotRange?.maxDate).toBe(TODAY);

    const second = await service.syncConnection(connection, {
      budget: new RequestBudget(10),
    });

    expect(second.status).toBe("success");
    expect(second.statsJson).not.toContain("_pending");
    expect(calls.cursors).toEqual(expect.arrayContaining([`cursor-${CHECKING}`, `cursor-${CARD}`]));
    // Janela completa: histórico diário desde a primeira transação.
    const [checkingRow] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.externalId, CHECKING))
      .limit(1);
    const snapshots = await db
      .select()
      .from(balanceSnapshots)
      .where(eq(balanceSnapshots.accountId, checkingRow!.id));
    expect(snapshots.length).toBeGreaterThan(2);
  });

  it("compartilha o orçamento entre conexões e adia a que não cabe", async () => {
    const user = await createTestUser();
    await seedConnection(user.id, "conn-1");
    await seedConnection(user.id, "conn-2");
    const calls: FakeCalls = { network: 0, cursors: [] };
    const service = new SyncService({
      db,
      providers: registry(fakeProvider(calls)),
      now: () => NOW,
    });

    const runs = await service.syncDueConnections(2, 10);

    // A primeira conexão consome o orçamento; a segunda fica para o próximo cron.
    expect(runs).toHaveLength(1);
    expect(calls.network).toBeLessThanOrEqual(10);
  }, 30_000);

  it("prioriza no cron a conexão com histórico fatiado (PARTIAL_SYNC)", async () => {
    const user = await createTestUser();
    const older = await createConnection({
      userId: user.id,
      provider: "demo",
      externalId: "conn-older",
      lastSyncedAt: "2026-01-01T00:00:00.000Z",
    });
    const partial = await createConnection({
      userId: user.id,
      provider: "demo",
      externalId: "conn-partial",
      statusDetail: "PARTIAL_SYNC",
      lastSyncedAt: "2026-11-10T11:00:00.000Z",
    });
    const calls: FakeCalls = { network: 0, cursors: [] };
    const service = new SyncService({
      db,
      providers: registry(fakeProvider(calls)),
      now: () => NOW,
    });

    const runs = await service.syncDueConnections(1, 30);

    expect(runs).toHaveLength(1);
    expect(runs[0]?.connectionId).toBe(partial.id);
    expect(runs[0]?.connectionId).not.toBe(older.id);
  }, 30_000);
});
