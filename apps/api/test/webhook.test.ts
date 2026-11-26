import { env, SELF } from "cloudflare:test";
import { apiErrorSchema } from "@fd/contracts";
import { connections, syncRuns, transactions } from "@fd/database/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import { createAccount, createTransaction } from "./fixtures";
import { BASE_URL, db, resetDatabase } from "./helpers";

const SECRET = "test-webhook-secret";

function pluggyFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url === "https://api.pluggy.ai/auth") {
      return Response.json({ apiKey: "pluggy-api-key" });
    }
    if (url === "https://api.pluggy.ai/items/item-1") {
      return Response.json({
        id: "item-1",
        connector: {
          id: 200,
          name: "MeuPluggy",
          primaryColor: "ef294b",
          type: "PERSONAL_BANK",
        },
        status: "UPDATED",
        executionStatus: "SUCCESS",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        lastUpdatedAt: "2026-01-02T00:00:00.000Z",
      });
    }
    if (url === "https://api.pluggy.ai/items/item-deleted") {
      return new Response(JSON.stringify({ message: "Item not found", code: 404 }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith("https://api.pluggy.ai/accounts")) {
      return Response.json({ total: 0, totalPages: 0, page: 1, results: [] });
    }
    if (url.startsWith("https://api.pluggy.ai/investments")) {
      return Response.json({ total: 0, totalPages: 0, page: 1, results: [] });
    }

    throw new Error(`fetch inesperado: ${url}`);
  });
}

function pluggyEnv(): Env {
  return {
    ...env,
    PLUGGY_CLIENT_ID: "test-pluggy-client",
    PLUGGY_CLIENT_SECRET: "test-pluggy-secret",
    PLUGGY_WEBHOOK_SECRET: SECRET,
  } as unknown as Env;
}

async function insertPluggyConnection(externalId = "item-1"): Promise<string> {
  const userId = crypto.randomUUID();
  const connectionId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO users (id, email, name, password_hash, github_login, avatar_url, created_at) VALUES (?, ?, ?, NULL, NULL, NULL, ?)",
  )
    .bind(userId, `${userId}@example.com`, "Webhook", now)
    .run();
  await env.DB.prepare(
    "INSERT INTO connections (id, user_id, provider, external_id, institution_id, status, status_detail, last_synced_at, created_at, updated_at) VALUES (?, ?, 'pluggy', ?, NULL, 'active', NULL, NULL, ?, ?)",
  )
    .bind(connectionId, userId, externalId, now, now)
    .run();

  return connectionId;
}

function webhookRequest(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return SELF.fetch(`${BASE_URL}/api/webhooks/pluggy`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/webhooks/pluggy", () => {
  it("exige o header secreto", async () => {
    const missing = await webhookRequest({ event: "item/updated", itemId: "item-1" });
    expect(missing.status).toBe(401);

    const wrong = await webhookRequest(
      { event: "item/updated", itemId: "item-1" },
      { "x-webhook-secret": "errado" },
    );
    expect(wrong.status).toBe(401);
    expect(apiErrorSchema.parse(await wrong.json()).error.code).toBe("unauthorized");
  });

  it("aceita POST sem CSRF (webhook usa segredo próprio)", async () => {
    const response = await webhookRequest(
      { event: "transactions/created", itemId: "desconhecido", clientId: "test-pluggy-client" },
      { "x-webhook-secret": SECRET },
    );

    // item desconhecido: 2xx rápido, sem criar sincronização.
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    expect(await db.select().from(syncRuns)).toHaveLength(0);
  });

  it("marca a conexão como disconnected em item/deleted só após o provider confirmar 404", async () => {
    const connectionId = await insertPluggyConnection("item-deleted");
    vi.stubGlobal("fetch", pluggyFetch());

    const response = await createApp().request(
      `${BASE_URL}/api/webhooks/pluggy`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
        body: JSON.stringify({
          event: "item/deleted",
          itemId: "item-deleted",
          clientId: "test-pluggy-client",
        }),
      },
      pluggyEnv(),
    );
    expect(response.status).toBe(202);

    const [row] = await db.select().from(connections).where(eq(connections.id, connectionId));
    expect(row?.status).toBe("disconnected");
    expect(row?.statusDetail).toBe("ITEM_DELETED");
  });

  it("não desconecta se o item ainda existe (payload não é confiável)", async () => {
    const connectionId = await insertPluggyConnection("item-1");
    vi.stubGlobal("fetch", pluggyFetch());

    const response = await createApp().request(
      `${BASE_URL}/api/webhooks/pluggy`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
        body: JSON.stringify({
          event: "item/deleted",
          itemId: "item-1",
          clientId: "test-pluggy-client",
        }),
      },
      pluggyEnv(),
    );
    expect(response.status).toBe(202);

    const [row] = await db.select().from(connections).where(eq(connections.id, connectionId));
    expect(row?.status).toBe("active");
    expect(await db.select().from(syncRuns)).toHaveLength(0);
  });

  it("rejeita clientId diferente do configurado", async () => {
    const app = createApp();
    const response = await app.request(
      `${BASE_URL}/api/webhooks/pluggy`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
        body: JSON.stringify({
          event: "item/updated",
          itemId: "item-1",
          clientId: "outro-cliente",
        }),
      },
      pluggyEnv(),
    );

    expect(response.status).toBe(403);
  });

  it("re-busca o item no provider e sincroniza em background", async () => {
    const connectionId = await insertPluggyConnection("item-1");
    const fetchMock = pluggyFetch();
    vi.stubGlobal("fetch", fetchMock);

    const app = createApp();
    // Sem SELF/executionCtx: o fallback aguarda o sync, deixando o teste determinístico.
    const response = await app.request(
      `${BASE_URL}/api/webhooks/pluggy`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
        body: JSON.stringify({
          event: "item/updated",
          itemId: "item-1",
          clientId: "test-pluggy-client",
        }),
      },
      pluggyEnv(),
    );

    expect(response.status).toBe(202);

    // O sync roda em background (`waitUntil`); aguarda o run aparecer.
    await vi.waitFor(
      async () => {
        const runs = await db
          .select()
          .from(syncRuns)
          .where(eq(syncRuns.connectionId, connectionId));
        expect(runs).toHaveLength(1);
        expect(runs[0]?.status).toBe("success");
        expect(runs[0]?.finishedAt).not.toBeNull();
      },
      { timeout: 5_000, interval: 50 },
    );

    expect(fetchMock).toHaveBeenCalled();

    const calls = fetchMock.mock.calls.map(([input]) =>
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
    );
    expect(calls).toContain("https://api.pluggy.ai/items/item-1");

    const [connection] = await db
      .select()
      .from(connections)
      .where(eq(connections.id, connectionId));
    expect(connection?.institutionId).not.toBeNull();
    expect(connection?.lastSyncedAt).not.toBeNull();
  });

  it.each(["item/login_succeeded", "item/error", "transactions/created", "transactions/updated"])(
    "sincroniza ao receber %s",
    async (event) => {
      const connectionId = await insertPluggyConnection("item-1");
      vi.stubGlobal("fetch", pluggyFetch());

      const response = await createApp().request(
        `${BASE_URL}/api/webhooks/pluggy`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
          body: JSON.stringify({ event, itemId: "item-1", clientId: "test-pluggy-client" }),
        },
        pluggyEnv(),
      );
      expect(response.status).toBe(202);

      await vi.waitFor(
        async () => {
          const runs = await db
            .select()
            .from(syncRuns)
            .where(eq(syncRuns.connectionId, connectionId));
          expect(runs).toHaveLength(1);
        },
        { timeout: 5_000, interval: 50 },
      );
    },
  );

  it("apaga transações de transactions/deleted de forma idempotente", async () => {
    const connectionId = await insertPluggyConnection("item-1");
    const [connection] = await db
      .select()
      .from(connections)
      .where(eq(connections.id, connectionId));
    const userId = connection!.userId;
    const account = await createAccount({
      userId,
      connectionId,
      externalId: "acc-1",
      balanceCents: 0,
    });
    await createTransaction({
      userId,
      accountId: account.id,
      connectionId,
      externalId: "tx-del",
      date: "2026-11-01",
      description: "Some",
      amountCents: -100,
    });
    await createTransaction({
      userId,
      accountId: account.id,
      connectionId,
      externalId: "tx-keep",
      date: "2026-11-02",
      description: "Fica",
      amountCents: -200,
    });

    const response = await createApp().request(
      `${BASE_URL}/api/webhooks/pluggy`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
        body: JSON.stringify({
          event: "transactions/deleted",
          itemId: "item-1",
          accountId: "acc-1",
          transactionIds: ["tx-del", "tx-inexistente"],
          clientId: "test-pluggy-client",
        }),
      },
      pluggyEnv(),
    );
    expect(response.status).toBe(202);

    await vi.waitFor(
      async () => {
        const rows = await db
          .select()
          .from(transactions)
          .where(eq(transactions.connectionId, connectionId));
        expect(rows.map((row) => row.externalId)).toEqual(["tx-keep"]);
      },
      { timeout: 5_000, interval: 50 },
    );

    // Idempotente: repetir o evento não quebra nem apaga a transação restante.
    await createApp().request(
      `${BASE_URL}/api/webhooks/pluggy`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
        body: JSON.stringify({
          event: "transactions/deleted",
          itemId: "item-1",
          transactionIds: ["tx-del"],
          clientId: "test-pluggy-client",
        }),
      },
      pluggyEnv(),
    );

    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.connectionId, connectionId));
    expect(rows.map((row) => row.externalId)).toEqual(["tx-keep"]);
  });
});
