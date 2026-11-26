import { env } from "cloudflare:test";
import { apiErrorSchema, connectTokenResponse, connectionSchema, okResponse } from "@fd/contracts";
import { connections } from "@fd/database/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import { createConnection } from "./fixtures";
import {
  BASE_URL,
  createSessionCookie,
  createTestUser,
  CSRF_HEADERS,
  db,
  resetDatabase,
} from "./helpers";

const CLIENT_ID = "test-pluggy-client";

function pluggyEnv(): Env {
  return {
    ...env,
    PLUGGY_CLIENT_ID: CLIENT_ID,
    PLUGGY_CLIENT_SECRET: "test-pluggy-secret",
  } as unknown as Env;
}

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

function mockPluggy(options: { deleteStatus?: number; connectors?: unknown[] } = {}): {
  fetchMock: ReturnType<typeof vi.fn>;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });

    if (url === "https://api.pluggy.ai/auth") {
      return Response.json({ apiKey: "pluggy-api-key" });
    }
    if (url.startsWith("https://api.pluggy.ai/connectors")) {
      return Response.json({
        total: 1,
        totalPages: 1,
        page: 1,
        results: options.connectors ?? [
          {
            id: 200,
            name: "MeuPluggy",
            type: "PERSONAL_BANK",
            isSandbox: false,
            oauth: true,
          },
        ],
      });
    }
    if (url === "https://api.pluggy.ai/connect_token" && method === "POST") {
      return Response.json({ accessToken: "connect-token-123" });
    }
    if (url.startsWith("https://api.pluggy.ai/items/") && method === "DELETE") {
      const status = options.deleteStatus ?? 204;
      return status === 204
        ? new Response(null, { status: 204 })
        : Response.json(
            { code: status, message: status === 404 ? "Item not found" : "Internal error" },
            { status },
          );
    }
    if (url === "https://api.pluggy.ai/items/item-1") {
      return Response.json({
        id: "item-1",
        connector: { id: 200, name: "MeuPluggy", type: "PERSONAL_BANK" },
        status: "UPDATED",
        executionStatus: "SUCCESS",
        consentExpiresAt: "2027-11-10T12:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-11-10T12:00:00.000Z",
        lastUpdatedAt: "2026-11-10T12:00:00.000Z",
      });
    }
    if (url.startsWith("https://api.pluggy.ai/items/") && method === "DELETE") {
      const status = options.deleteStatus ?? 204;
      return status === 204
        ? new Response(null, { status: 204 })
        : Response.json(
            { code: status, message: status === 404 ? "Item not found" : "Internal error" },
            { status },
          );
    }

    throw new Error(`fetch inesperado: ${method} ${url}`);
  });

  return { fetchMock, calls };
}

async function setup() {
  const user = await createTestUser();
  const { cookie } = await createSessionCookie(user.id);
  return { user, cookie };
}

function postToken(cookie: string, body: unknown) {
  return createApp().request(
    `${BASE_URL}/api/providers/pluggy/connect-token`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie, ...CSRF_HEADERS },
      body: JSON.stringify(body),
    },
    pluggyEnv(),
  );
}

function deleteConnection(cookie: string, id: string) {
  return createApp().request(
    `${BASE_URL}/api/connections/${id}`,
    { method: "DELETE", headers: { cookie, ...CSRF_HEADERS } },
    pluggyEnv(),
  );
}

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/providers/pluggy/connect-token", () => {
  it("resolve o conector MeuPluggy e não envia webhookUrl por item", async () => {
    const { user, cookie } = await setup();
    await createConnection({ userId: user.id, provider: "pluggy", externalId: "item-1" });
    const { fetchMock, calls } = mockPluggy();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postToken(cookie, { itemId: "item-1" });
    expect(response.status).toBe(200);

    const body = connectTokenResponse.parse(await response.json());
    expect(body).toEqual({ accessToken: "connect-token-123", connectorId: 200 });
    expect(JSON.stringify(body)).not.toContain("test-pluggy-secret");

    const tokenCall = calls.find((call) => call.url.endsWith("/connect_token"));
    expect(tokenCall?.body).toMatchObject({
      itemId: "item-1",
      options: { clientUserId: user.id },
    });
    expect(tokenCall?.body).not.toHaveProperty("options.webhookUrl");
    expect(JSON.stringify(tokenCall?.body)).not.toContain("webhooks/pluggy");
  });

  it("emite token sem itemId para uma conexão nova", async () => {
    const { user, cookie } = await setup();
    const { fetchMock, calls } = mockPluggy();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postToken(cookie, {});
    expect(response.status).toBe(200);

    const tokenCall = calls.find((call) => call.url.endsWith("/connect_token"));
    expect(tokenCall?.body).toEqual({ options: { clientUserId: user.id } });
  });

  it("aceita requisição sem body (token sem itemId)", async () => {
    const { cookie } = await setup();
    const { fetchMock } = mockPluggy();
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().request(
      `${BASE_URL}/api/providers/pluggy/connect-token`,
      { method: "POST", headers: { cookie, ...CSRF_HEADERS } },
      pluggyEnv(),
    );

    expect(response.status).toBe(200);
    expect(connectTokenResponse.parse(await response.json()).connectorId).toBe(200);
  });

  it("falha fechado quando o conector MeuPluggy não está disponível", async () => {
    const { cookie } = await setup();
    const { fetchMock, calls } = mockPluggy({ connectors: [] });
    vi.stubGlobal("fetch", fetchMock);

    const response = await postToken(cookie, {});
    expect(response.status).toBe(502);
    expect(apiErrorSchema.parse(await response.json()).error.message).toContain("MeuPluggy");
    expect(calls.some((call) => call.url.endsWith("/connect_token"))).toBe(false);
  });

  it("recusa reconectar item que não pertence ao usuário (IDOR)", async () => {
    const owner = await setup();
    await createConnection({ userId: owner.user.id, provider: "pluggy", externalId: "item-1" });

    const attacker = await setup();
    const { fetchMock } = mockPluggy();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postToken(attacker.cookie, { itemId: "item-1" });
    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("not_found");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/connections (Pluggy)", () => {
  it("não herda lastSyncedAt do item: o primeiro sync começa pela janela cheia", async () => {
    const { user, cookie } = await setup();
    const { fetchMock } = mockPluggy();
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().request(
      `${BASE_URL}/api/connections`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie, ...CSRF_HEADERS },
        body: JSON.stringify({ provider: "pluggy", itemId: "item-1" }),
      },
      pluggyEnv(),
    );
    expect(response.status).toBe(201);

    const body = connectionSchema.parse(((await response.json()) as { data: unknown }).data);
    expect(body.lastSyncedAt).toBeNull();
    expect(body.consentExpiresAt).toBe("2027-11-10T12:00:00.000Z");

    const [row] = await db.select().from(connections).where(eq(connections.userId, user.id));
    expect(row?.lastSyncedAt).toBeNull();
  });
});

describe("DELETE /api/connections/:id (Pluggy)", () => {
  it("revoga o item no Pluggy antes de apagar o histórico local", async () => {
    const { user, cookie } = await setup();
    const connection = await createConnection({
      userId: user.id,
      provider: "pluggy",
      externalId: "item-del",
    });
    const { fetchMock, calls } = mockPluggy();
    vi.stubGlobal("fetch", fetchMock);

    const response = await deleteConnection(cookie, connection.id);
    expect(response.status).toBe(200);
    expect(okResponse.parse(await response.json())).toEqual({ ok: true });

    expect(
      calls.some((call) => call.method === "DELETE" && call.url.endsWith("/items/item-del")),
    ).toBe(true);
    expect(
      await db.select().from(connections).where(eq(connections.id, connection.id)),
    ).toHaveLength(0);
  });

  it("tolera 404 quando o item já foi removido no Pluggy", async () => {
    const { user, cookie } = await setup();
    const connection = await createConnection({
      userId: user.id,
      provider: "pluggy",
      externalId: "item-gone",
    });
    const { fetchMock } = mockPluggy({ deleteStatus: 404 });
    vi.stubGlobal("fetch", fetchMock);

    const response = await deleteConnection(cookie, connection.id);
    expect(response.status).toBe(200);
    expect(
      await db.select().from(connections).where(eq(connections.id, connection.id)),
    ).toHaveLength(0);
  });

  it("mantém a conexão local quando o Pluggy recusa a remoção", async () => {
    const { user, cookie } = await setup();
    const connection = await createConnection({
      userId: user.id,
      provider: "pluggy",
      externalId: "item-1",
    });
    const { fetchMock } = mockPluggy({ deleteStatus: 500 });
    vi.stubGlobal("fetch", fetchMock);

    const response = await deleteConnection(cookie, connection.id);
    expect(response.status).toBe(502);
    expect(
      await db.select().from(connections).where(eq(connections.id, connection.id)),
    ).toHaveLength(1);
  });
});
