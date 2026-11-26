import { todayIsoDate } from "@fd/contracts";
import {
  accounts,
  balanceSnapshots,
  bills,
  categories,
  connections,
  investments,
  transactions,
  users,
} from "@fd/database/schema";
import { createProviderRegistry } from "@fd/financial-providers";
import type { FinancialProvider, ProviderRegistry } from "@fd/financial-providers";
import { PLUGGY_CAPABILITIES, ProviderError } from "@fd/financial-providers";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SyncService } from "../src/sync/service";
import { transactionTotals } from "../src/domain/analytics";
import { createAccount, createConnection, createTransaction } from "./fixtures";
import { createTestUser, db, resetDatabase } from "./helpers";

const NOW = new Date("2026-11-10T15:00:00.000Z");
const ITEM_ID = "item-meupluggy-1";

const ITEM = {
  id: ITEM_ID,
  connector: {
    id: 200,
    name: "MeuPluggy",
    type: "PERSONAL_BANK",
    isSandbox: false,
  },
  status: "UPDATED",
  executionStatus: "SUCCESS",
  consentExpiresAt: "2027-11-10T12:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-11-10T12:00:00.000Z",
  lastUpdatedAt: "2026-11-10T12:00:00.000Z",
};

const BANK_ACCOUNT = {
  id: "acc-bank",
  type: "BANK",
  subtype: "CHECKING_ACCOUNT",
  number: "0001/12345-0",
  name: "Conta Corrente",
  balance: 1000,
  itemId: ITEM_ID,
  currencyCode: "BRL",
  bankData: { transferNumber: "341/0001/12345-0" },
  creditData: null,
  updatedAt: "2026-11-10T12:00:00.000Z",
};

const CARD_ACCOUNT = {
  id: "acc-card",
  type: "CREDIT",
  subtype: "CREDIT_CARD",
  number: "1234",
  name: "GOLD",
  balance: 200,
  itemId: ITEM_ID,
  currencyCode: "BRL",
  bankData: null,
  creditData: {
    level: "GOLD",
    brand: "MASTERCARD",
    balanceCloseDate: "2026-11-05",
    balanceDueDate: "2026-11-12",
    availableCreditLimit: 4800,
    creditLimit: 5000,
  },
  updatedAt: "2026-11-10T12:00:00.000Z",
};

function transaction(id: string, accountId: string, overrides: Record<string, unknown>) {
  return {
    id,
    accountId,
    description: "Transação",
    currencyCode: "BRL",
    status: "POSTED",
    ...overrides,
  };
}

function pluggyFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";

    if (url.pathname === "/auth") return Response.json({ apiKey: "pluggy-api-key" });
    if (url.pathname === `/items/${ITEM_ID}`) return Response.json(ITEM);
    if (url.pathname === "/accounts") {
      return Response.json({
        total: 2,
        totalPages: 1,
        page: 1,
        results: [BANK_ACCOUNT, CARD_ACCOUNT],
      });
    }
    if (url.pathname === "/bills") {
      expect(url.searchParams.get("accountId")).toBe("acc-card");
      return Response.json({
        total: 1,
        totalPages: 1,
        page: 1,
        results: [
          {
            id: "bill-1",
            dueDate: "2026-11-12T00:00:00.000Z",
            billClosingDate: "2026-11-05T00:00:00.000Z",
            totalAmount: 200,
            totalAmountCurrencyCode: "BRL",
            minimumPaymentAmount: 50,
            financeCharges: [],
            payments: [],
          },
        ],
      });
    }
    if (url.pathname === "/investments") {
      return Response.json({
        total: 1,
        totalPages: 1,
        page: 1,
        results: [
          {
            id: "inv-1",
            type: "FIXED_INCOME",
            subtype: "CDB",
            name: "CDB Teste",
            balance: 500,
            amountProfit: 25,
            currencyCode: "BRL",
            updatedAt: "2026-11-10T12:00:00.000Z",
          },
        ],
      });
    }
    if (url.pathname === "/v2/transactions") {
      const accountId = url.searchParams.get("accountId");
      const after = url.searchParams.get("after");

      if (accountId === "acc-bank" && !after) {
        return Response.json({
          results: [
            transaction("tx-1", "acc-bank", {
              description: "SUPERMERCADO PAO DE ACUCAR",
              amount: 100,
              date: "2026-11-10T01:00:00.000Z",
              type: "CREDIT",
            }),
            transaction("tx-2", "acc-bank", {
              description: "PADARIA CENTRAL",
              amount: -50,
              date: "2026-11-10T12:00:00.000Z",
              type: "DEBIT",
            }),
          ],
          next: "?after=cursor-1",
        });
      }
      if (accountId === "acc-bank" && after === "cursor-1") {
        return Response.json({
          results: [
            transaction("tx-3", "acc-bank", {
              description: "SALARIO",
              amount: 3000,
              date: "2026-11-05T12:00:00.000Z",
              type: "CREDIT",
            }),
          ],
          next: null,
        });
      }
      if (accountId === "acc-card") {
        return Response.json({
          results: [
            transaction("tx-4", "acc-card", {
              description: "NETFLIX.COM",
              amount: 30,
              date: "2026-11-08T15:00:00.000Z",
              type: "DEBIT",
            }),
          ],
          next: null,
        });
      }
    }

    throw new Error(`fetch inesperado: ${method} ${url.pathname}`);
  });
}

beforeEach(async () => {
  await resetDatabase();
  await db.insert(categories).values([
    {
      id: "cat_mercado",
      userId: null,
      name: "Mercado",
      slug: "mercado",
      icon: "ShoppingCart",
      color: "#22c55e",
      kind: "expense",
      parentId: null,
    },
    {
      id: "cat_outros",
      userId: null,
      name: "Outros",
      slug: "outros",
      icon: "CircleEllipsis",
      color: "#71717a",
      kind: "expense",
      parentId: null,
    },
  ]);
});

describe("SyncService — movimentação interna", () => {
  /**
   * Item MeuPluggy com os dois casos que distorciam receitas/despesas em
   * produção: transferência entre contas do próprio titular (crédito e débito)
   * e pagamento da fatura do cartão. Terceiros e compras reais ficam de fora.
   */
  function internalMovementFetch(includeBankTransactions = true) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === "/auth") return Response.json({ apiKey: "pluggy-api-key" });
      if (url.pathname === `/items/${ITEM_ID}`) return Response.json(ITEM);
      if (url.pathname === "/accounts") {
        return Response.json({
          total: 2,
          totalPages: 1,
          page: 1,
          results: [BANK_ACCOUNT, CARD_ACCOUNT],
        });
      }
      if (url.pathname === "/bills" || url.pathname === "/investments") {
        return Response.json({ total: 0, totalPages: 1, page: 1, results: [] });
      }
      if (url.pathname === "/v2/transactions") {
        const accountId = url.searchParams.get("accountId");
        if (accountId === "acc-bank") {
          return Response.json({
            results: includeBankTransactions
              ? [
                  transaction("self-credit", "acc-bank", {
                    description: "Transferência Recebida|ANA SOUZA E SILVA",
                    amount: 4700.0,
                    date: "2026-11-10T12:00:00.000Z",
                    type: "CREDIT",
                  }),
                  transaction("self-pix-in", "acc-bank", {
                    description: "Pix recebido - ANA SOUZA E SILVA",
                    amount: 2077,
                    date: "2026-11-07T12:00:00.000Z",
                    type: "CREDIT",
                  }),
                  transaction("self-pix-out", "acc-bank", {
                    description: "Pix enviado  - ANA SOUZA E SILVA",
                    amount: -170.0,
                    date: "2026-11-10T13:00:00.000Z",
                    type: "DEBIT",
                  }),
                  transaction("third-party-pix", "acc-bank", {
                    description: "Pix recebido - Beto Souza Lima",
                    amount: 50,
                    date: "2026-11-05T12:00:00.000Z",
                    type: "CREDIT",
                  }),
                  transaction("real-expense", "acc-bank", {
                    description: "Pix enviado  - 99 Food Ltda",
                    amount: -47.37,
                    date: "2026-11-06T12:00:00.000Z",
                    type: "DEBIT",
                  }),
                ]
              : [],
            next: null,
          });
        }
        if (accountId === "acc-card") {
          return Response.json({
            results: [
              transaction("card-payment", "acc-card", {
                description: "Pagamento recebido",
                amount: 4500.0,
                date: "2026-11-10T12:00:00.000Z",
                type: "CREDIT",
              }),
            ],
            next: null,
          });
        }
      }

      throw new Error(`fetch inesperado: ${init?.method ?? "GET"} ${url.pathname}`);
    });
  }

  async function syncWith(
    fetchMock: ReturnType<typeof internalMovementFetch>,
    options: { reclassifyChunkSize?: number } = {},
  ) {
    const registry = createProviderRegistry(
      { PLUGGY_CLIENT_ID: "client-id", PLUGGY_CLIENT_SECRET: "client-secret" },
      { fetch: fetchMock, now: () => NOW },
    );
    return new SyncService({ db, providers: registry, now: () => NOW, ...options });
  }

  it("classifica titular e fatura como transfer e corrige histórico já gravado", async () => {
    const user = await createTestUser({ name: "Ana Souza" });
    const connection = await createConnection({
      userId: user.id,
      provider: "pluggy",
      externalId: ITEM_ID,
    });
    // Conta com o mesmo `externalId` do provider, criada antes do sync: permite
    // gravar o histórico antigo ANTES do primeiro sync (como em produção, onde a
    // regra chega depois dos dados).
    const bank = await createAccount({
      userId: user.id,
      connectionId: connection.id,
      externalId: "acc-bank",
      balanceCents: 0,
    });
    // Histórico anterior à regra: fora da janela do provider (365 dias a partir
    // de 2026-11-10) e ausente da resposta do mock — só a reclassificação lê.
    const legacySelf = await createTransaction({
      userId: user.id,
      accountId: bank.id,
      connectionId: connection.id,
      externalId: "legacy-self",
      date: "2025-06-01",
      description: "Transferência Recebida|ANA SOUZA E SILVA",
      amountCents: 100_000,
      type: "income",
    });
    const legacyThird = await createTransaction({
      userId: user.id,
      accountId: bank.id,
      connectionId: connection.id,
      externalId: "legacy-third",
      date: "2025-06-02",
      description: "Pix recebido - Beto Souza Lima",
      amountCents: 5_000,
      type: "income",
    });

    const fetchMock = internalMovementFetch();
    const service = await syncWith(fetchMock);
    expect((await service.syncConnection(connection)).status).toBe("success");

    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.connectionId, connection.id));
    const byExternal = new Map(rows.map((row) => [row.externalId, row]));

    expect(byExternal.get("self-credit")).toMatchObject({
      amountCents: 470_000,
      type: "transfer",
    });
    expect(byExternal.get("self-pix-in")).toMatchObject({
      amountCents: 207_700,
      type: "transfer",
    });
    expect(byExternal.get("self-pix-out")).toMatchObject({
      amountCents: -17_000,
      type: "transfer",
    });
    expect(byExternal.get("card-payment")).toMatchObject({
      amountCents: 450_000,
      type: "transfer",
    });
    // Terceiro e compra real continuam entrando nos totais.
    expect(byExternal.get("third-party-pix")?.type).toBe("income");
    expect(byExternal.get("real-expense")?.type).toBe("expense");

    // Histórico antigo: só a movimentação interna do titular é reclassificada.
    const [legacyAfter] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, legacySelf.id));
    expect(legacyAfter?.type).toBe("transfer");
    const [thirdAfter] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, legacyThird.id));
    expect(thirdAfter?.type).toBe("income");

    // KPI de receitas/despesas ignora a movimentação interna.
    expect(await transactionTotals(db, user.id, { from: "2026-11-01", to: "2026-11-30" })).toEqual({
      incomeCents: 5_000,
      expensesCents: 4_737,
    });

    // Segunda execução: o estado `_backfill` está concluído e nada é reescrito.
    const secondService = await syncWith(fetchMock);
    const secondRun = await secondService.syncConnection(connection);
    expect(secondRun.status).toBe("success");

    const [legacySecond] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, legacySelf.id));
    expect(legacySecond?.type).toBe("transfer");
    expect(legacySecond?.updatedAt).toBe(legacyAfter?.updatedAt);

    // O run devolvido pelo sync já traz o estado que a próxima execução lê.
    const lastStats = JSON.parse(secondRun.statsJson ?? "{}") as { _backfill?: unknown };
    expect(lastStats._backfill).toMatchObject({
      version: 1,
      identity: "ANA SOUZA",
      done: true,
    });
  });

  it("avança o cursor em lotes, para de ler quando conclui e reinicia se o titular muda", async () => {
    const user = await createTestUser({ name: "Ana Souza" });
    const connection = await createConnection({
      userId: user.id,
      provider: "pluggy",
      externalId: ITEM_ID,
    });
    const bank = await createAccount({
      userId: user.id,
      connectionId: connection.id,
      externalId: "acc-bank",
      balanceCents: 0,
    });
    // Cinco linhas antigas que casam com o titular, todas fora da janela e
    // ausentes do mock (o provider devolve extrato vazio nesta conta).
    for (let index = 0; index < 5; index += 1) {
      await createTransaction({
        userId: user.id,
        accountId: bank.id,
        connectionId: connection.id,
        externalId: `legacy-${index}`,
        date: `2025-05-0${index + 1}`,
        description: "Transferência Recebida|ANA SOUZA E SILVA",
        amountCents: 10_000 + index,
        type: "income",
      });
    }

    const fetchMock = internalMovementFetch(false);
    // Lote de 2: 5 linhas exigem 3 execuções até `done`. Cada sync é um request
    // (instância nova), como em produção.
    const nextService = () => syncWith(fetchMock, { reclassifyChunkSize: 2 });

    const transferred = async (): Promise<number> => {
      const rows = await db
        .select()
        .from(transactions)
        .where(and(eq(transactions.accountId, bank.id), eq(transactions.type, "transfer")));
      return rows.length;
    };
    const backfillOf = (run: { statsJson: string | null }): Record<string, unknown> =>
      (JSON.parse(run.statsJson ?? "{}") as { _backfill?: Record<string, unknown> })._backfill ??
      {};

    const run1 = await (await nextService()).syncConnection(connection);
    expect(await transferred()).toBe(2);
    expect(backfillOf(run1)).toMatchObject({ done: false });

    const run2 = await (await nextService()).syncConnection(connection);
    expect(await transferred()).toBe(4);
    expect(backfillOf(run2)).toMatchObject({ done: false });

    const run3 = await (await nextService()).syncConnection(connection);
    expect(await transferred()).toBe(5);
    expect(backfillOf(run3)).toMatchObject({ done: true });

    // Concluído: uma linha antiga nova que casaria não é mais lida nem tocada.
    const late = await createTransaction({
      userId: user.id,
      accountId: bank.id,
      connectionId: connection.id,
      externalId: "late-legacy",
      date: "2025-04-01",
      description: "Transferência Recebida|ANA SOUZA LIMA",
      amountCents: 42_000,
      type: "income",
    });
    const run4 = await (await nextService()).syncConnection(connection);
    const [lateAfter] = await db.select().from(transactions).where(eq(transactions.id, late.id));
    expect(lateAfter?.type).toBe("income");
    expect(backfillOf(run4)).toMatchObject({ done: true });

    // Mudar o nome do titular reinicia a varredura e a linha entra no ciclo.
    await db.update(users).set({ name: "Ana Souza Lima" }).where(eq(users.id, user.id));
    const run5 = await (await nextService()).syncConnection(connection);
    const [lateRestarted] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, late.id));
    expect(lateRestarted?.type).toBe("transfer");
    expect(backfillOf(run5)).toMatchObject({ identity: "ANA SOUZA LIMA", done: true });
  });
});

describe("SyncService — item MeuPluggy", () => {
  it("persiste contas de bancos diferentes, faturas, investimentos, transações v2 e snapshots", async () => {
    const user = await createTestUser();
    const connection = await createConnection({
      userId: user.id,
      provider: "pluggy",
      externalId: ITEM_ID,
    });
    const fetchMock = pluggyFetch();
    const registry = createProviderRegistry(
      { PLUGGY_CLIENT_ID: "client-id", PLUGGY_CLIENT_SECRET: "client-secret" },
      { fetch: fetchMock, now: () => NOW },
    );
    const service = new SyncService({ db, providers: registry, now: () => NOW });

    // Estado de produção antes do fix: a conta do cartão já existe com
    // `institution_name` nulo; o sync precisa corrigir esta linha (e não só
    // inserir outra) via ON CONFLICT DO UPDATE.
    const existingCardId = "acc-card-existing";
    await db.insert(accounts).values({
      id: existingCardId,
      userId: user.id,
      connectionId: connection.id,
      externalId: "acc-card",
      type: "credit_card",
      subtype: "CREDIT_CARD",
      name: "GOLD",
      institutionName: null,
      currency: "BRL",
      balanceCents: 0,
      updatedAt: NOW.toISOString(),
    });
    const [cardBeforeSync] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, existingCardId));
    expect(cardBeforeSync?.institutionName).toBeNull();

    const run = await service.syncConnection(connection);
    expect(run.status).toBe("success");

    const [connectionRow] = await db
      .select()
      .from(connections)
      .where(eq(connections.id, connection.id));
    expect(connectionRow).toMatchObject({
      status: "active",
      consentExpiresAt: "2027-11-10T12:00:00.000Z",
    });
    expect(connectionRow?.lastSyncedAt).not.toBeNull();

    const accountRows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.connectionId, connection.id));
    expect(accountRows).toHaveLength(2);
    expect(accountRows.find((account) => account.externalId === "acc-bank")).toMatchObject({
      type: "checking",
      institutionName: "Itaú",
      balanceCents: 100_000,
    });
    // O cartão "GOLD" não traz COMPE nem banco no nome: herda o Itaú da conta
    // corrente do mesmo item, e a linha pré-existente (id preservado) é
    // atualizada pelo upsert.
    expect(accountRows.find((account) => account.externalId === "acc-card")).toMatchObject({
      id: existingCardId,
      type: "credit_card",
      institutionName: "Itaú",
      balanceCents: 20_000,
      availableCents: 480_000,
    });

    const allBills = await db.select().from(bills);
    expect(allBills).toHaveLength(1);
    expect(allBills[0]).toMatchObject({
      externalId: "bill-1",
      totalCents: 20_000,
      minimumPaymentCents: 5_000,
      status: "closed",
      closingDate: "2026-11-05",
    });

    const investmentRows = await db.select().from(investments);
    expect(investmentRows).toHaveLength(1);
    expect(investmentRows[0]).toMatchObject({
      externalId: "inv-1",
      type: "fixed_income",
      balanceCents: 50_000,
      amountProfitCents: 2_500,
    });

    const transactionRows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.connectionId, connection.id));
    expect(transactionRows).toHaveLength(4);

    const salary = transactionRows.find((row) => row.externalId === "tx-3");
    expect(salary).toMatchObject({ amountCents: 300_000, type: "income", date: "2026-11-05" });

    // 01:00 UTC = 22:00 do dia anterior em America/Sao_Paulo.
    const supermarket = transactionRows.find((row) => row.externalId === "tx-1");
    expect(supermarket).toMatchObject({
      amountCents: 10_000,
      type: "income",
      date: "2026-11-09",
      categoryId: "cat_mercado",
    });

    // Compra no cartão: type DEBIT manda no sinal, não o amount positivo.
    const netflix = transactionRows.find((row) => row.externalId === "tx-4");
    expect(netflix).toMatchObject({ amountCents: -3_000, type: "expense" });

    const snapshots = await db.select().from(balanceSnapshots);
    expect(snapshots).toHaveLength(2);
    expect(snapshots.every((snapshot) => snapshot.date === todayIsoDate(NOW))).toBe(true);

    // Idempotência: um segundo sync não duplica nada.
    await service.syncConnection(connection);
    expect(await db.select().from(transactions)).toHaveLength(4);
    expect(await db.select().from(accounts)).toHaveLength(2);
    expect(await db.select().from(bills)).toHaveLength(1);
    expect(await db.select().from(investments)).toHaveLength(1);
  });
});

describe("SyncService — frescor do provider", () => {
  it("ancora a janela na atualização anterior do provider e persiste a nova", async () => {
    const user = await createTestUser({ name: "Usuário Teste" });
    const connection = await createConnection({
      userId: user.id,
      provider: "pluggy",
      externalId: ITEM_ID,
      // Leu há 6h, mas o snapshot do provider é de 7 dias atrás: a janela tem
      // de cobrir o extrato que o MeuPluggy vai despejar de uma vez.
      lastSyncedAt: "2026-11-10T09:00:00.000Z",
      providerUpdatedAt: "2026-11-03T12:00:00.000Z",
    });
    await createAccount({
      userId: user.id,
      connectionId: connection.id,
      externalId: "acc-bank",
      balanceCents: 100_000,
      historySyncedAt: "2026-11-05T12:00:00.000Z",
    });

    const dateFrom: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth") return Response.json({ apiKey: "pluggy-api-key" });
      if (url.pathname === `/items/${ITEM_ID}`) return Response.json(ITEM);
      if (url.pathname === "/accounts") {
        return Response.json({
          total: 1,
          totalPages: 1,
          page: 1,
          results: [BANK_ACCOUNT],
        });
      }
      if (url.pathname === "/bills" || url.pathname === "/investments") {
        return Response.json({ total: 0, totalPages: 1, page: 1, results: [] });
      }
      if (url.pathname === "/v2/transactions") {
        dateFrom.push(url.searchParams.get("dateFrom") ?? "");
        return Response.json({ results: [], next: null });
      }
      throw new Error(`fetch inesperado: ${url.pathname}`);
    });
    const registry = createProviderRegistry(
      { PLUGGY_CLIENT_ID: "client-id", PLUGGY_CLIENT_SECRET: "client-secret" },
      { fetch: fetchMock, now: () => NOW },
    );
    const service = new SyncService({ db, providers: registry, now: () => NOW });

    const run = await service.syncConnection(connection);
    expect(run.status).toBe("success");
    // 2026-11-03 (snapshot anterior) − 7 dias, e não 2026-11-10 − 7.
    expect(dateFrom).toEqual(["2026-10-27"]);

    const [stored] = await db
      .select({ providerUpdatedAt: connections.providerUpdatedAt })
      .from(connections)
      .where(eq(connections.id, connection.id));
    expect(stored?.providerUpdatedAt).toBe(ITEM.lastUpdatedAt);
  });

  function fakeRegistry(provider: FinancialProvider): ProviderRegistry {
    const registry: ProviderRegistry = {
      get: (id) => (id === "pluggy" ? provider : undefined),
      require: (id) => {
        if (id !== "pluggy")
          throw new ProviderError("not_found", `Provider ${id} não configurado.`);
        return provider;
      },
      list: () => [],
    };
    return registry;
  }

  function fakeProvider(
    refresh: () => Promise<{ refreshed: boolean; detail?: string }>,
  ): FinancialProvider {
    return {
      id: "pluggy",
      capabilities: PLUGGY_CAPABILITIES,
      getConnection: async () => ({
        externalId: ITEM_ID,
        provider: "pluggy",
        status: "active",
        institution: { externalId: "200", name: "MeuPluggy", type: "other" },
        lastSyncedAt: ITEM.lastUpdatedAt,
      }),
      getAccounts: async () => [],
      getTransactions: async () => [],
      getCreditCards: async () => [],
      getBills: async () => [],
      getBalances: async () => [],
      getInvestments: async () => [],
      refreshConnection: refresh,
    };
  }

  it("pede refresh ao provider só quando a chamada é manual", async () => {
    const user = await createTestUser({ name: "Usuário Teste" });
    const connection = await createConnection({
      userId: user.id,
      provider: "pluggy",
      externalId: ITEM_ID,
    });
    let refreshes = 0;
    const provider = fakeProvider(async () => {
      refreshes += 1;
      return { refreshed: false, detail: "meu_pluggy_reads_only" };
    });
    const service = new SyncService({ db, providers: fakeRegistry(provider), now: () => NOW });

    expect((await service.syncConnection(connection)).status).toBe("success");
    expect(refreshes).toBe(0);

    expect((await service.syncConnection(connection, { refresh: true })).status).toBe("success");
    expect(refreshes).toBe(1);
  });

  it("falha ao pedir refresh não derruba o sync", async () => {
    const user = await createTestUser({ name: "Usuário Teste" });
    const connection = await createConnection({
      userId: user.id,
      provider: "pluggy",
      externalId: ITEM_ID,
    });
    const provider = fakeProvider(async () => {
      throw new ProviderError("rate_limited", "Muitas atualizações.", { retryable: true });
    });
    const service = new SyncService({ db, providers: fakeRegistry(provider), now: () => NOW });

    const run = await service.syncConnection(connection, { refresh: true });
    expect(run.status).toBe("success");
    expect(run.errorCode).toBeNull();
  });
});
