import { describe, expect, it, vi, afterEach } from "vitest";
import { z } from "zod";

import { ApiError, api, apiRequest, errorMessage } from "./api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const okSchema = z.object({ ok: z.literal(true) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("envia cookie de sessão, header anti-CSRF e valida a resposta", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ ok: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const data = await apiRequest("/api/settings", { schema: okSchema });

    expect(data).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/settings");
    expect(init).toMatchObject({
      method: "GET",
      credentials: "same-origin",
      headers: expect.objectContaining({
        accept: "application/json",
        "X-Requested-With": "fetch",
      }),
    });
  });

  it("serializa o corpo como JSON em mutações", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ ok: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/connections", {
      method: "POST",
      body: { provider: "demo" },
      schema: okSchema,
    });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ provider: "demo" }),
      headers: expect.objectContaining({ "content-type": "application/json" }),
    });
  });

  it("converte o envelope de erro em ApiError tipado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(
          {
            error: {
              code: "validation_error",
              message: "período inválido",
              details: { from: "x" },
            },
          },
          422,
        ),
      ),
    );

    await expect(apiRequest("/api/overview")).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      code: "validation_error",
      message: "período inválido",
      details: { from: "x" },
    });
  });

  it("usa mensagem padrão quando o erro não segue o envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response("gateway timeout", { status: 504 }),
      ),
    );

    await expect(apiRequest("/api/health")).rejects.toMatchObject({
      status: 504,
      code: "http_504",
    });
  });

  it("rejeita resposta fora do contrato em desenvolvimento", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ ok: false })),
    );

    await expect(apiRequest("/api/settings", { schema: okSchema })).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("trata falha de rede como ApiError 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(apiRequest("/api/health")).rejects.toMatchObject({
      status: 0,
      code: "network_error",
    });
  });
});

describe("api", () => {
  it("monta a query string de transações sem campos vazios", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ data: [], page: { cursor: null, nextCursor: null } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.transactions({
      from: "2026-01-01",
      to: "2026-01-31",
      q: "mercado",
      type: "expense",
      sort: "date_desc",
      limit: 50,
    });

    const [url] = fetchMock.mock.calls[0]!;
    const parsed = new URL(String(url), "http://localhost");
    expect(parsed.pathname).toBe("/api/transactions");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
      q: "mercado",
      type: "expense",
      sort: "date_desc",
      limit: "50",
    });
  });

  it("envia uncategorized=true só quando o filtro está ligado", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ data: [], page: { cursor: null, nextCursor: null } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.transactions({ from: "2026-01-01", to: "2026-01-31", uncategorized: true });
    const [withFilter] = fetchMock.mock.calls[0]!;
    expect(new URL(String(withFilter), "http://localhost").searchParams.get("uncategorized")).toBe(
      "true",
    );

    await api.transactions({ from: "2026-01-01", to: "2026-01-31", uncategorized: false });
    const [withoutFilter] = fetchMock.mock.calls[1]!;
    expect(
      new URL(String(withoutFilter), "http://localhost").searchParams.has("uncategorized"),
    ).toBe(false);
  });

  it("busca o contador global de transações sem categoria", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ count: 12 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.transactionsUncategorizedCount()).resolves.toEqual({ count: 12 });

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/transactions/uncategorized-count");
  });

  it("expõe status e mensagem legível em errorMessage", () => {
    const error = new ApiError(403, "forbidden", "Sem permissão");
    expect(error.isUnauthorized).toBe(false);
    expect(ApiError.from(error)).toBe(error);
    expect(errorMessage(error)).toBe("Sem permissão");
    expect(errorMessage(new Error("falhou"))).toBe("falhou");
  });
});
