import { describe, expect, it, vi } from "vitest";

import { PluggyClient, ProviderError, type KeyValueCache } from "../src";
import authFixture from "./fixtures/pluggy/auth.json";
import connectTokenFixture from "./fixtures/pluggy/connect-token.json";
import connectorsFixture from "./fixtures/pluggy/connectors-sandbox.json";
import error404 from "./fixtures/pluggy/error-404.json";
import itemSuccess from "./fixtures/pluggy/item-success.json";
import page1 from "./fixtures/pluggy/transactions-page-1.json";

const NOW = 1_000_000;

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function makeClient(
  fetchImpl: typeof fetch,
  overrides: Partial<ConstructorParameters<typeof PluggyClient>[0]> = {},
): PluggyClient {
  return new PluggyClient({
    clientId: "client-id",
    clientSecret: "client-secret",
    fetch: fetchImpl,
    now: () => NOW,
    sleep: async () => {},
    random: () => 0,
    ...overrides,
  });
}

function headerValue(
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
  callIndex: number,
  name: string,
): string | undefined {
  const init = fetchMock.mock.calls[callIndex]?.[1];
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.[name];
}

function urlOf(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, callIndex: number): URL {
  return new URL(String(fetchMock.mock.calls[callIndex]?.[0]));
}

describe("PluggyClient — fetch do runtime", () => {
  it("chama o fetch sem receiver (no Workers, `this` errado lança Illegal invocation)", async () => {
    const receivers: unknown[] = [];
    // `function` (não arrow) para capturar o `this` da chamada, como o workerd valida.
    const strictFetch = vi.fn(function (this: unknown, input: RequestInfo | URL) {
      receivers.push(this);
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation: function called with incorrect `this` reference.");
      }
      return Promise.resolve(
        jsonResponse(String(input).endsWith("/auth") ? authFixture : itemSuccess),
      );
    });

    // Sem `fetch` explícito: usa o global, como em produção.
    vi.stubGlobal("fetch", strictFetch);
    try {
      const client = new PluggyClient({
        clientId: "client-id",
        clientSecret: "client-secret",
        now: () => NOW,
        sleep: async () => {},
        random: () => 0,
      });
      await expect(client.getItem("item-1")).resolves.toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }

    expect(receivers.length).toBe(2);
    for (const receiver of receivers) expect([undefined, globalThis]).toContain(receiver);
  });
});

describe("PluggyClient — autenticação", () => {
  it("faz POST /auth, cacheia a apiKey em memória e envia X-API-KEY", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(authFixture))
      .mockResolvedValueOnce(jsonResponse(itemSuccess))
      .mockResolvedValueOnce(jsonResponse(itemSuccess));

    const client = makeClient(fetchMock);
    await client.getItem("item-1");
    await client.getItem("item-1");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(urlOf(fetchMock, 0).pathname).toBe("/auth");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    expect(urlOf(fetchMock, 1).pathname).toBe("/items/item-1");
    expect(headerValue(fetchMock, 1, "x-api-key")).toBe("fake-api-key-for-tests");
    expect(headerValue(fetchMock, 2, "x-api-key")).toBe("fake-api-key-for-tests");
  });

  it("respeita o TTL da apiKey em memória", async () => {
    let now = 0;
    let authCalls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/auth")) {
        authCalls += 1;
        return jsonResponse({ apiKey: `fake-key-${authCalls}-0123456789` });
      }
      return jsonResponse(itemSuccess);
    });
    const client = new PluggyClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetch: fetchMock,
      now: () => now,
      apiKeyTtlMs: 1_000,
      apiKeySafetyMarginMs: 0,
    });

    expect(await client.authenticate()).toBe("fake-key-1-0123456789");
    now = 500;
    expect(await client.authenticate()).toBe("fake-key-1-0123456789");
    now = 1_001;
    expect(await client.authenticate()).toBe("fake-key-2-0123456789");
    expect(authCalls).toBe(2);
  });

  it("usa o KeyValueCache com TTL e evita reautenticar entre isolates", async () => {
    const store = new Map<string, string>();
    const puts: { key: string; value: string; ttlSeconds: number }[] = [];
    const cache: KeyValueCache = {
      get: async (key) => store.get(key) ?? null,
      put: async (key, value, ttlSeconds) => {
        puts.push({ key, value, ttlSeconds });
        store.set(key, value);
      },
      delete: async (key) => {
        store.delete(key);
      },
    };

    let authCalls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/auth")) {
        authCalls += 1;
        return jsonResponse(authFixture);
      }
      return jsonResponse(itemSuccess);
    });

    const first = makeClient(fetchMock, { cache });
    await first.getItem("item-1");
    expect(authCalls).toBe(1);
    expect(puts).toHaveLength(1);
    expect(puts[0]?.key).toContain("pluggy:api-key:");
    expect(puts[0]?.ttlSeconds).toBe(6_900); // 2h - 5min
    expect(JSON.parse(puts[0]?.value ?? "{}")).toMatchObject({
      apiKey: "fake-api-key-for-tests",
    });

    const second = makeClient(fetchMock, { cache });
    await second.getItem("item-1");
    expect(authCalls).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3); // auth + item + item
  });

  it("ignora falhas do cache (KV é best-effort)", async () => {
    const failingCache: KeyValueCache = {
      get: async () => {
        throw new Error("KV offline");
      },
      put: async () => {
        throw new Error("KV offline");
      },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/auth")) return jsonResponse(authFixture);
      return jsonResponse(itemSuccess);
    });

    const client = makeClient(fetchMock, { cache: failingCache });
    await expect(client.getItem("item-1")).resolves.toMatchObject({ id: "item-sandbox-001" });
  });

  it("reautentica uma única vez após 401 e usa a nova chave", async () => {
    let authCalls = 0;
    let itemCalls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/auth")) {
        authCalls += 1;
        return jsonResponse({ apiKey: `fake-key-${authCalls}-0123456789` });
      }
      itemCalls += 1;
      if (itemCalls === 1) return jsonResponse(error404, { status: 401 });
      return jsonResponse(itemSuccess);
    });

    const client = makeClient(fetchMock, { maxRetries: 0 });
    await expect(client.getItem("item-1")).resolves.toMatchObject({ id: "item-sandbox-001" });
    expect(authCalls).toBe(2);
    expect(itemCalls).toBe(2);
    expect(headerValue(fetchMock, 3, "x-api-key")).toBe("fake-key-2-0123456789");
  });

  it("falha com auth_failed se o 401 persistir", async () => {
    let authCalls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/auth")) {
        authCalls += 1;
        return jsonResponse({ apiKey: `fake-key-${authCalls}-0123456789` });
      }
      return jsonResponse(error404, { status: 401 });
    });

    const client = makeClient(fetchMock, { maxRetries: 0 });
    await expect(client.getItem("item-1")).rejects.toMatchObject({
      code: "auth_failed",
      retryable: false,
      status: 401,
    });
    expect(authCalls).toBe(2);
  });

  it("reautentica mesmo sem delete no cache (não reusa apiKey rejeitada)", async () => {
    const store = new Map<string, string>();
    const cache: KeyValueCache = {
      get: async (key) => store.get(key) ?? null,
      put: async (key, value) => {
        store.set(key, value);
      },
    };
    let authCalls = 0;
    let itemCalls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/auth")) {
        authCalls += 1;
        return jsonResponse({ apiKey: `fake-key-${authCalls}-0123456789` });
      }
      itemCalls += 1;
      if (itemCalls === 1) return jsonResponse(error404, { status: 401 });
      return jsonResponse(itemSuccess);
    });

    const client = makeClient(fetchMock, { cache, maxRetries: 0 });
    await expect(client.getItem("item-1")).resolves.toMatchObject({ id: "item-sandbox-001" });
    expect(authCalls).toBe(2);
    expect(headerValue(fetchMock, 3, "x-api-key")).toBe("fake-key-2-0123456789");
    expect(store.values().next().value).toContain("fake-key-2-0123456789");
  });

  it("rejeita resposta de /auth sem apiKey", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({}));
    const client = makeClient(fetchMock);

    await expect(client.getItem("item-1")).rejects.toMatchObject({
      code: "auth_failed",
      retryable: false,
    });
  });
});

describe("PluggyClient — retry/backoff", () => {
  it("respeita Retry-After em 429", async () => {
    const sleeps: number[] = [];
    let itemCalls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/auth")) return jsonResponse(authFixture);
      itemCalls += 1;
      if (itemCalls === 1) {
        return jsonResponse(
          { code: 429, message: "Too many requests" },
          { status: 429, headers: { "retry-after": "1" } },
        );
      }
      return jsonResponse(itemSuccess);
    });

    const client = makeClient(fetchMock, {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await expect(client.getItem("item-1")).resolves.toMatchObject({ id: "item-sandbox-001" });
    expect(itemCalls).toBe(2);
    expect(sleeps).toEqual([1_000]);
  });

  it("usa RateLimit-Reset quando Retry-After não vem", async () => {
    const sleeps: number[] = [];
    let itemCalls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/auth")) return jsonResponse(authFixture);
      itemCalls += 1;
      if (itemCalls === 1) {
        return jsonResponse(
          { code: 429, message: "Too many requests" },
          { status: 429, headers: { "ratelimit-reset": "2" } },
        );
      }
      return jsonResponse(itemSuccess);
    });

    const client = makeClient(fetchMock, {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await client.getItem("item-1");
    expect(sleeps).toEqual([2_000]);
  });

  it("faz backoff exponencial com jitter para 5xx", async () => {
    const sleeps: number[] = [];
    let itemCalls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/auth")) return jsonResponse(authFixture);
      itemCalls += 1;
      if (itemCalls <= 2) return jsonResponse({ code: 503 }, { status: 503 });
      return jsonResponse(itemSuccess);
    });

    const client = makeClient(fetchMock, {
      maxRetries: 2,
      retryBaseDelayMs: 100,
      retryMaxDelayMs: 10_000,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await client.getItem("item-1");
    expect(itemCalls).toBe(3);
    expect(sleeps).toEqual([50, 100]);
  });

  it("usa o sleep padrão (setTimeout) no backoff, com fake timers", async () => {
    vi.useFakeTimers();
    try {
      let itemCalls = 0;
      const fetchMock = vi.fn<typeof fetch>(async (input) => {
        if (String(input).endsWith("/auth")) return jsonResponse(authFixture);
        itemCalls += 1;
        if (itemCalls === 1) return jsonResponse({ code: 503 }, { status: 503 });
        return jsonResponse(itemSuccess);
      });
      const client = new PluggyClient({
        clientId: "client-id",
        clientSecret: "client-secret",
        fetch: fetchMock,
        now: () => NOW,
        random: () => 0,
        retryBaseDelayMs: 1_000,
        maxRetries: 1,
      });

      const promise = client.getItem("item-1");
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(500);
      await expect(promise).resolves.toMatchObject({ id: "item-sandbox-001" });
      expect(itemCalls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("não repete 400/404", async () => {
    for (const [status, code] of [
      [400, "invalid_response"],
      [404, "not_found"],
    ] as const) {
      const sleeps: number[] = [];
      let itemCalls = 0;
      const fetchMock = vi.fn<typeof fetch>(async (input) => {
        if (String(input).endsWith("/auth")) return jsonResponse(authFixture);
        itemCalls += 1;
        return jsonResponse({ code: status }, { status });
      });

      const client = makeClient(fetchMock, {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });
      await expect(client.getItem("item-1")).rejects.toMatchObject({ code });
      expect(itemCalls).toBe(1);
      expect(sleeps).toEqual([]);
    }
  });

  it("desiste de 429 após maxRetries", async () => {
    const sleeps: number[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/auth")) return jsonResponse(authFixture);
      return jsonResponse(
        { code: 429, message: "Too many requests" },
        { status: 429, headers: { "retry-after": "0" } },
      );
    });

    const client = makeClient(fetchMock, {
      maxRetries: 1,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await expect(client.getItem("item-1")).rejects.toMatchObject({
      code: "rate_limited",
      retryable: true,
      status: 429,
    });
    expect(sleeps).toEqual([0]);
  });

  it("mapeia erro HTTP com codeDescription sem vazar corpo", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/auth")) return jsonResponse(authFixture);
      return jsonResponse(error404, { status: 404 });
    });
    const client = makeClient(fetchMock);

    await expect(client.getItem("item-1")).rejects.toMatchObject({
      code: "not_found",
      status: 404,
      retryable: false,
      details: { codeDescription: "ITEM_NOT_FOUND" },
    });
  });

  it("mapeia 5xx com corpo não-JSON", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/auth")) return jsonResponse(authFixture);
      return new Response("upstream error", { status: 500 });
    });
    const client = makeClient(fetchMock, { maxRetries: 0 });

    await expect(client.getItem("item-1")).rejects.toMatchObject({
      code: "unavailable",
      status: 500,
      retryable: true,
    });
  });
});

describe("PluggyClient — timeout/abort", () => {
  it("aborta por timeout e devolve unavailable retryable", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).endsWith("/auth")) return jsonResponse(authFixture);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    const client = makeClient(fetchMock, { timeoutMs: 20, maxRetries: 0 });

    await expect(client.getItem("item-1")).rejects.toMatchObject({
      code: "unavailable",
      retryable: true,
    });
  });

  it("aborto do chamador não é retryable", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).endsWith("/auth")) return jsonResponse(authFixture);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    const client = makeClient(fetchMock, { timeoutMs: 5_000 });

    const promise = client.getItem("item-1", { signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toMatchObject({
      code: "unavailable",
      retryable: false,
    });
  });
});

describe("PluggyClient — endpoints", () => {
  it("pagina /v2/transactions com dateFrom/dateTo e cursor after", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(authFixture))
      .mockResolvedValueOnce(jsonResponse(page1));

    const client = makeClient(fetchMock);
    const page = await client.getTransactions("account-1", {
      from: "2026-11-01",
      to: "2026-11-10",
      after: "cursor+after",
    });

    const url = urlOf(fetchMock, 1);
    expect(url.pathname).toBe("/v2/transactions");
    expect(url.searchParams.get("accountId")).toBe("account-1");
    expect(url.searchParams.get("dateFrom")).toBe("2026-11-01");
    expect(url.searchParams.get("dateTo")).toBe("2026-11-10");
    expect(url.searchParams.get("after")).toBe("cursor+after");
    expect(page.results).toHaveLength(4);
    expect(page.next).toBe("?after=MjAyNi0xMS0wNVQwMDowMDowMC4wMDBafGE4NTM0Yzg1");
  });

  it("busca conectores sandbox sem fixar ID", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(authFixture))
      .mockResolvedValueOnce(jsonResponse(connectorsFixture));

    const client = makeClient(fetchMock);
    const connectors = await client.getConnectors({ sandbox: true });

    expect(urlOf(fetchMock, 1).searchParams.get("sandbox")).toBe("true");
    expect(connectors).toHaveLength(1);
    expect(connectors[0]).toMatchObject({ name: "Pluggy Bank", isSandbox: true });
  });

  it("cria connect token com campos dentro de options", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(authFixture))
      .mockResolvedValueOnce(jsonResponse(connectTokenFixture));

    const client = makeClient(fetchMock);
    const token = await client.createConnectToken({
      itemId: "item-1",
      clientUserId: "user-1",
      webhookUrl: "https://app.example.test/api/webhooks/pluggy",
      oauthRedirectUri: "https://app.example.test/connections",
      avoidDuplicates: true,
      products: ["ACCOUNTS", "TRANSACTIONS"],
    });

    expect(token.accessToken).toBe("fake-connect-token-for-tests");
    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as Record<string, unknown>;
    expect(body["itemId"]).toBe("item-1");
    expect(body["clientUserId"]).toBeUndefined();
    expect(body["webhookUrl"]).toBeUndefined();
    expect(body["options"]).toEqual({
      clientUserId: "user-1",
      webhookUrl: "https://app.example.test/api/webhooks/pluggy",
      oauthRedirectUri: "https://app.example.test/connections",
      avoidDuplicates: true,
      products: ["ACCOUNTS", "TRANSACTIONS"],
    });
  });

  it("faz PATCH /items/:id para refresh", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(authFixture))
      .mockResolvedValueOnce(jsonResponse(itemSuccess));

    const client = makeClient(fetchMock);
    await client.updateItem("item-1");

    expect(urlOf(fetchMock, 1).pathname).toBe("/items/item-1");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PATCH");
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe("{}");
  });

  it("mapeia JSON inválido para invalid_response", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/auth")) return jsonResponse(authFixture);
      return new Response("não é json", { status: 200 });
    });
    const client = makeClient(fetchMock);

    await expect(client.getItem("item-1")).rejects.toMatchObject({
      code: "invalid_response",
      retryable: false,
    });
  });

  it("valida configuração no construtor", () => {
    expect(
      () => new PluggyClient({ clientId: "", clientSecret: "x", fetch: vi.fn() }),
    ).toThrowError(ProviderError);
    expect(
      () =>
        new PluggyClient({
          clientId: "x",
          clientSecret: "y",
          baseUrl: "ftp://api.example.test",
          fetch: vi.fn(),
        }),
    ).toThrowError(expect.objectContaining({ code: "invalid_response" }));
  });
});
