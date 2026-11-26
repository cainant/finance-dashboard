import { accounts, balanceSnapshots, bills, connections, transactions } from "@fd/database/schema";
import { createProviderRegistry } from "@fd/financial-providers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SyncService } from "../src/sync/service";
import { createConnection } from "./fixtures";
import { createTestUser, db, resetDatabase } from "./helpers";
import fixture from "../../../packages/financial-providers/test/fixtures/pluggy/real-sandbox/pluggy-sandbox-real.json";

const NOW = new Date("2026-11-10T15:00:00.000Z");
const ITEM_ID = fixture.item.id;
const BANK_ACCOUNT_ID = fixture.accounts.results[0]!.id;
const CARD_ACCOUNT_ID = fixture.accounts.results[1]!.id;
type TransactionPage = { results: unknown[]; next: string | null };
const TRANSACTIONS = fixture.transactions as unknown as Record<string, TransactionPage>;
const CARD_TRANSACTION_COUNT = TRANSACTIONS[CARD_ACCOUNT_ID]!.results.length;
const BANK_TRANSACTION_COUNT = TRANSACTIONS[BANK_ACCOUNT_ID]!.results.length;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

function pluggyFetch() {
  const calls: URL[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url);

    if (url.pathname === "/auth") return jsonResponse({ apiKey: "pluggy-api-key" });
    if (url.pathname === `/items/${ITEM_ID}`) return jsonResponse(fixture.item);
    if (url.pathname === "/accounts") return jsonResponse(fixture.accounts);
    if (url.pathname === "/v2/transactions") {
      const accountId = url.searchParams.get("accountId") ?? "";
      const page = TRANSACTIONS[accountId];
      if (!page) throw new Error(`conta inesperada: ${accountId}`);
      return jsonResponse(page);
    }
    if (url.pathname === "/bills") {
      const accountId = url.searchParams.get("accountId") ?? "";
      return jsonResponse(fixture.bills[accountId as keyof typeof fixture.bills]);
    }
    if (url.pathname === "/investments") return jsonResponse(fixture.investments);

    throw new Error(`fetch inesperado: ${url.pathname}`);
  });

  return { fetchMock, calls };
}

async function setupConnection() {
  const user = await createTestUser();
  const connection = await createConnection({
    userId: user.id,
    provider: "pluggy",
    externalId: ITEM_ID,
  });
  return { user, connection };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("histórico inicial paginado", () => {
  it("mantém lastSyncedAt nulo até o cursor terminar", async () => {
    const user = await createTestUser();
    const connection = await createConnection({
      userId: user.id,
      provider: "pluggy",
      externalId: "item-paged",
    });
    const item = {
      id: "item-paged",
      connector: { id: 2, name: "Pluggy Bank" },
      status: "UPDATED",
      executionStatus: "SUCCESS",
      updatedAt: "2026-11-10T12:00:00.000Z",
    };
    const account = {
      id: "acc-paged",
      type: "BANK",
      subtype: "CHECKING_ACCOUNT",
      number: "1",
      name: "Conta Corrente",
      balance: 0,
      itemId: "item-paged",
      currencyCode: "BRL",
      bankData: { transferNumber: "001/0001/12345-0" },
      updatedAt: "2026-11-10T12:00:00.000Z",
    };
    const pageFor = (after: string | null) => {
      const index = after ? Number(after.replace("c", "")) : 0;
      return {
        results: [
          {
            id: `tx-${index}`,
            description: `TX ${index}`,
            amount: -10,
            date: "2026-11-01T12:00:00.000Z",
            accountId: "acc-paged",
            type: "DEBIT",
            status: "POSTED",
          },
        ],
        next: index < 6 ? `?after=c${index + 1}` : null,
      };
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth") return jsonResponse({ apiKey: "pluggy-api-key" });
      if (url.pathname === "/items/item-paged") return jsonResponse(item);
      if (url.pathname === "/accounts") {
        return jsonResponse({ total: 1, totalPages: 1, page: 1, results: [account] });
      }
      if (url.pathname === "/v2/transactions") {
        return jsonResponse(pageFor(url.searchParams.get("after")));
      }
      if (url.pathname === "/investments") {
        return jsonResponse({ total: 0, totalPages: 0, page: 1, results: [] });
      }
      throw new Error(`fetch inesperado: ${url.pathname}`);
    });
    const registry = createProviderRegistry(
      { PLUGGY_CLIENT_ID: "client-id", PLUGGY_CLIENT_SECRET: "client-secret" },
      { fetch: fetchMock, now: () => NOW },
    );
    const service = new SyncService({ db, providers: registry, now: () => NOW });

    const first = await service.syncConnection(connection);
    expect(first.status).toBe("success");
    expect(first.statsJson).toContain("_pending");
    let [row] = await db.select().from(connections).where(eq(connections.id, connection.id));
    expect(row?.lastSyncedAt).toBeNull();
    expect(row?.statusDetail).toBe("PARTIAL_SYNC");
    expect(await db.select().from(transactions)).toHaveLength(6);

    const second = await service.syncConnection({ ...connection, ...row });
    expect(second.status).toBe("success");
    [row] = await db.select().from(connections).where(eq(connections.id, connection.id));
    expect(row?.lastSyncedAt).not.toBeNull();
    expect(row?.statusDetail).toBeNull();
    expect(await db.select().from(transactions)).toHaveLength(7);
  });
});

describe("primeiro sync com a fixture real do sandbox", () => {
  it("importa 31 + 18 transações, detecta o cartão e só então grava lastSyncedAt", async () => {
    const { connection } = await setupConnection();
    const { fetchMock, calls } = pluggyFetch();
    const registry = createProviderRegistry(
      { PLUGGY_CLIENT_ID: "client-id", PLUGGY_CLIENT_SECRET: "client-secret" },
      { fetch: fetchMock, now: () => NOW },
    );
    const service = new SyncService({ db, providers: registry, now: () => NOW });

    const run = await service.syncConnection(connection);
    expect(run.status).toBe("success");

    const [connectionRow] = await db
      .select()
      .from(connections)
      .where(eq(connections.id, connection.id));
    expect(connectionRow?.lastSyncedAt).not.toBeNull();

    const accountRows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.connectionId, connection.id));
    const bank = accountRows.find((account) => account.externalId === BANK_ACCOUNT_ID);
    const card = accountRows.find((account) => account.externalId === CARD_ACCOUNT_ID);
    expect(bank).toMatchObject({ type: "checking", amountSignConvention: null });
    expect(card).toMatchObject({
      type: "credit_card",
      amountSignConvention: "purchase_negative",
    });
    expect(bank?.historySyncedAt).not.toBeNull();
    expect(card?.historySyncedAt).not.toBeNull();

    const transactionRows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.connectionId, connection.id));
    expect(transactionRows).toHaveLength(BANK_TRANSACTION_COUNT + CARD_TRANSACTION_COUNT);
    expect(transactionRows).toHaveLength(49);

    const cardTransactions = transactionRows.filter((row) => row.accountId === card!.id);
    expect(cardTransactions).toHaveLength(18);
    expect(cardTransactions.every((row) => row.amountCents < 0)).toBe(true);
    expect(cardTransactions.every((row) => row.type === "expense")).toBe(true);

    const billRows = await db.select().from(bills);
    expect(billRows).toHaveLength(2);
    expect(billRows.every((bill) => bill.status === "closed")).toBe(true);

    expect(await db.select().from(balanceSnapshots)).toHaveLength(2);

    // O primeiro sync não pode ter virado incremental: a janela pedida é de 12
    // meses, não `last_synced_at − 7 dias`.
    const transactionCalls = calls.filter((url) => url.pathname === "/v2/transactions");
    expect(transactionCalls).toHaveLength(2);
    for (const call of transactionCalls) {
      expect(call.searchParams.get("dateFrom")).toBe("2025-11-11");
      expect(call.searchParams.get("dateTo")).toBe("2026-11-10");
    }
  });

  it("um segundo sync não duplica transações e mantém a convenção", async () => {
    const { connection } = await setupConnection();
    const { fetchMock } = pluggyFetch();
    const registry = createProviderRegistry(
      { PLUGGY_CLIENT_ID: "client-id", PLUGGY_CLIENT_SECRET: "client-secret" },
      { fetch: fetchMock, now: () => NOW },
    );
    const service = new SyncService({ db, providers: registry, now: () => NOW });

    await service.syncConnection(connection);
    await service.syncConnection(connection);

    const transactionRows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.connectionId, connection.id));
    expect(transactionRows).toHaveLength(49);
    const [card] = await db.select().from(accounts).where(eq(accounts.externalId, CARD_ACCOUNT_ID));
    expect(card?.amountSignConvention).toBe("purchase_negative");
    expect(
      transactionRows.filter((row) => row.accountId === card!.id && row.type === "income"),
    ).toHaveLength(0);
  });
});
