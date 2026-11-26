import { describe, expect, it, vi } from "vitest";

import { PluggyProvider, extractAfterCursor } from "../src";
import accountsFixture from "./fixtures/pluggy/accounts.json";
import interGoldFixture from "./fixtures/pluggy/accounts-meupluggy-inter-gold.json";
import nubankPlatinumFixture from "./fixtures/pluggy/accounts-meupluggy-nubank-platinum.json";
import authFixture from "./fixtures/pluggy/auth.json";
import billsFixture from "./fixtures/pluggy/bills.json";
import connectTokenFixture from "./fixtures/pluggy/connect-token.json";
import connectorsFixture from "./fixtures/pluggy/connectors-sandbox.json";
import error404 from "./fixtures/pluggy/error-404.json";
import investmentsFixture from "./fixtures/pluggy/investments.json";
import itemSuccess from "./fixtures/pluggy/item-success.json";
import page1 from "./fixtures/pluggy/transactions-page-1.json";
import page2 from "./fixtures/pluggy/transactions-page-2.json";

const NOW = Date.parse("2026-11-10T15:00:00.000Z");
const CURSOR = "MjAyNi0xMS0wNVQwMDowMDowMC4wMDBafGE4NTM0Yzg1";

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

interface RouterContext {
  url: URL;
  init: RequestInit;
}

function makeRouter(handler: (context: RouterContext) => Response | Promise<Response>) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth") return jsonResponse(authFixture);
    return handler({ url, init: init ?? {} });
  });
}

function makeProvider(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  return new PluggyProvider({
    clientId: "client-id",
    clientSecret: "client-secret",
    fetch: fetchImpl,
    now: () => NOW,
    sleep: async () => {},
    random: () => 0,
    maxRetries: 0,
    ...overrides,
  });
}

describe("PluggyProvider — conexão/contas", () => {
  it("mapeia o item para ProviderConnection", async () => {
    const fetchMock = makeRouter(() => jsonResponse(itemSuccess));
    const provider = makeProvider(fetchMock);

    await expect(provider.getConnection("item-1")).resolves.toMatchObject({
      externalId: "item-sandbox-001",
      provider: "pluggy",
      status: "active",
      institution: { name: "Pluggy Bank", type: "bank" },
    });
  });

  it("pagina /accounts e mapeia contas + cartões", async () => {
    const bank = accountsFixture.results[0]!;
    const card = accountsFixture.results[1]!;
    const pages = new Map<number, unknown>([
      [1, { total: 2, totalPages: 2, page: 1, results: [bank] }],
      [2, { total: 2, totalPages: 2, page: 2, results: [card] }],
    ]);
    const seenPages: number[] = [];
    const fetchMock = makeRouter(({ url }) => {
      expect(url.pathname).toBe("/accounts");
      expect(url.searchParams.get("itemId")).toBe("item-1");
      const page = Number(url.searchParams.get("page") ?? "1");
      seenPages.push(page);
      return jsonResponse(pages.get(page));
    });
    const provider = makeProvider(fetchMock);

    const accounts = await provider.getAccounts("item-1");
    expect(seenPages).toEqual([1, 2]);
    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toMatchObject({ type: "checking", balanceCents: 2_154_460 });
    expect(accounts[1]).toMatchObject({ type: "credit_card", balanceCents: 245_075 });

    const cards = await provider.getCreditCards("item-1");
    expect(cards).toEqual([
      expect.objectContaining({
        accountExternalId: "b1a2c3d4-0002-4a5b-8c9d-000000000002",
        brand: "MASTERCARD",
        closingDay: 5,
        dueDay: 12,
      }),
    ]);
  });

  it.each([
    ["Banco Inter", "GOLD", interGoldFixture],
    ["Nubank", "platinum", nubankPlatinumFixture],
  ])("herda %s das outras contas do item para o cartão %s", async (bank, cardName, fixture) => {
    const fetchMock = makeRouter(({ url }) => {
      expect(url.pathname).toBe("/accounts");
      return jsonResponse(fixture);
    });
    const provider = makeProvider(fetchMock);

    const accounts = await provider.getAccounts("item-1");
    const bankAccounts = accounts.filter((account) => account.type !== "credit_card");
    expect(bankAccounts.length).toBeGreaterThan(0);
    expect(bankAccounts.every((account) => account.institutionName === bank)).toBe(true);
    expect(accounts.find((account) => account.type === "credit_card")).toMatchObject({
      name: cardName,
      institutionName: bank,
    });
  });

  it("não inventa banco quando o item só tem o cartão", async () => {
    const cardOnly = {
      ...nubankPlatinumFixture,
      total: 1,
      results: [nubankPlatinumFixture.results[1]!],
    };
    const fetchMock = makeRouter(({ url }) => {
      expect(url.pathname).toBe("/accounts");
      return jsonResponse(cardOnly);
    });
    const provider = makeProvider(fetchMock);

    const [card] = await provider.getAccounts("item-1");
    expect(card).toMatchObject({ type: "credit_card", institutionName: null });
  });

  it("reutiliza /accounts entre getAccounts, getCreditCards e getBalances", async () => {
    let accountCalls = 0;
    const fetchMock = makeRouter(({ url }) => {
      expect(url.pathname).toBe("/accounts");
      accountCalls += 1;
      return jsonResponse(accountsFixture);
    });
    const provider = makeProvider(fetchMock);

    await provider.getAccounts("item-1");
    await provider.getCreditCards("item-1");
    await provider.getBalances("item-1");

    expect(accountCalls).toBe(1);
  });

  it("respeita maxPages ao paginar contas", async () => {
    const bank = accountsFixture.results[0]!;
    const card = accountsFixture.results[1]!;
    const pages = new Map<number, unknown>([
      [1, { total: 2, totalPages: 2, page: 1, results: [bank] }],
      [2, { total: 2, totalPages: 2, page: 2, results: [card] }],
    ]);
    const seenPages: number[] = [];
    const fetchMock = makeRouter(({ url }) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      seenPages.push(page);
      return jsonResponse(pages.get(page));
    });
    const provider = makeProvider(fetchMock);

    const accounts = await provider.getAccounts("item-1", { maxPages: 1 });
    expect(accounts).toHaveLength(1);
    expect(seenPages).toEqual([1]);
  });

  it("devolve saldos a partir das contas sem /balance extra", async () => {
    const fetchMock = makeRouter(({ url }) => {
      expect(url.pathname).toBe("/accounts");
      return jsonResponse(accountsFixture);
    });
    const provider = makeProvider(fetchMock);

    const balances = await provider.getBalances("item-1");
    expect(balances).toHaveLength(2);
    expect(balances[0]).toMatchObject({
      accountExternalId: "b1a2c3d4-0001-4a5b-8c9d-000000000001",
      balanceCents: 2_154_460,
      availableCents: null,
      currency: "BRL",
    });
    expect(balances[1]).toMatchObject({
      accountExternalId: "b1a2c3d4-0002-4a5b-8c9d-000000000002",
      balanceCents: 245_075,
      availableCents: 1_254_925,
    });
  });

  it("mapeia faturas com status derivado", async () => {
    const fetchMock = makeRouter(({ url }) => {
      expect(url.pathname).toBe("/bills");
      expect(url.searchParams.get("accountId")).toBe("card-1");
      return jsonResponse(billsFixture);
    });
    const provider = makeProvider(fetchMock);

    const bills = await provider.getBills("card-1");
    expect(bills).toHaveLength(2);
    expect(bills[0]).toMatchObject({ status: "paid", totalCents: 245_075 });
    expect(bills[1]).toMatchObject({ status: "closed", totalCents: 181_040 });
  });

  it("mapeia investimentos", async () => {
    const fetchMock = makeRouter(({ url }) => {
      expect(url.pathname).toBe("/investments");
      expect(url.searchParams.get("itemId")).toBe("item-1");
      return jsonResponse(investmentsFixture);
    });
    const provider = makeProvider(fetchMock);

    const investments = await provider.getInvestments("item-1");
    expect(investments).toHaveLength(3);
    expect(investments.map((investment) => investment.type)).toEqual([
      "fixed_income",
      "fixed_income",
      "fund",
    ]);
    expect(investments[0]).toMatchObject({ balanceCents: 850_000, amountProfitCents: 64_500 });
  });

  it("pagina /bills e /investments por totalPages", async () => {
    const fetchMock = makeRouter(({ url }) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      if (url.pathname === "/bills") {
        const result = billsFixture.results[page - 1];
        return jsonResponse({ total: 2, totalPages: 2, page, results: result ? [result] : [] });
      }
      if (url.pathname === "/investments") {
        const result = investmentsFixture.results[page - 1];
        return jsonResponse({ total: 3, totalPages: 3, page, results: result ? [result] : [] });
      }
      throw new Error(`rota inesperada: ${url.pathname}`);
    });
    const provider = makeProvider(fetchMock);

    await expect(provider.getBills("card-1")).resolves.toHaveLength(2);
    await expect(provider.getInvestments("item-1")).resolves.toHaveLength(3);
  });

  it("propaga 404 como not_found", async () => {
    const fetchMock = makeRouter(() => jsonResponse(error404, { status: 404 }));
    const provider = makeProvider(fetchMock);

    await expect(provider.getConnection("nao-existe")).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });

  it("revoga o item e trata 404 como sucesso", async () => {
    const deleted: string[] = [];
    const fetchMock = makeRouter(({ url, init }) => {
      expect(init.method).toBe("DELETE");
      deleted.push(url.pathname);
      if (url.pathname.endsWith("/ja-foi")) {
        return jsonResponse(error404, { status: 404 });
      }
      return new Response(null, { status: 204 });
    });
    const provider = makeProvider(fetchMock);

    await provider.deleteConnection("item-1");
    await provider.deleteConnection("ja-foi");
    expect(deleted).toEqual(["/items/item-1", "/items/ja-foi"]);
  });

  it("resolve o conector MeuPluggy por id com fallback por nome", async () => {
    const fetchMock = makeRouter(({ url }) => {
      expect(url.pathname).toBe("/connectors");
      expect(url.searchParams.get("countries")).toBe("BR");
      return jsonResponse({
        total: 1,
        totalPages: 1,
        page: 1,
        results: [{ id: 200, name: "MeuPluggy", type: "PERSONAL_BANK", isSandbox: false }],
      });
    });
    const provider = makeProvider(fetchMock);

    await expect(provider.resolveMeuPluggyConnector()).resolves.toMatchObject({
      id: 200,
      name: "MeuPluggy",
    });
  });
});

describe("PluggyProvider — transações/paginação", () => {
  it("segue o cursor até o fim e devolve transações normalizadas", async () => {
    let transactionCalls = 0;
    const fetchMock = makeRouter(({ url }) => {
      expect(url.pathname).toBe("/v2/transactions");
      transactionCalls += 1;
      return jsonResponse(transactionCalls === 1 ? page1 : page2);
    });
    const provider = makeProvider(fetchMock);

    const page = await provider.getTransactionsPage("account-1", {
      from: "2026-11-01",
      to: "2026-11-10",
    });

    expect(page.transactions).toHaveLength(6);
    expect(page.transactions[0]).toMatchObject({
      externalId: "7a1b2c3d-0001-4e5f-8a9b-000000000001",
      amountCents: -5_590,
      type: "expense",
      date: "2026-11-04",
    });
    expect(page.transactions[3]).toMatchObject({
      amountCents: 245_075,
      type: "transfer",
    });
    expect(page.nextCursor).toBeNull();
    expect(page.partial).toBe(false);
    expect(page.requestCount).toBe(2);

    transactionCalls = 0;
    const convenience = await provider.getTransactions("account-1", {
      from: "2026-11-01",
      to: "2026-11-10",
    });
    expect(convenience).toEqual(page.transactions);
  });

  it("para por maxPages e devolve nextCursor para continuar", async () => {
    const urls: URL[] = [];
    let transactionCalls = 0;
    const fetchMock = makeRouter(({ url }) => {
      urls.push(url);
      transactionCalls += 1;
      return jsonResponse(transactionCalls === 1 ? page1 : page2);
    });
    const provider = makeProvider(fetchMock);

    const first = await provider.getTransactionsPage("account-1", {
      from: "2026-11-01",
      to: "2026-11-10",
      maxPages: 1,
    });
    expect(first.partial).toBe(true);
    expect(first.nextCursor).toBe(CURSOR);
    expect(first.requestCount).toBe(1);
    expect(first.transactions).toHaveLength(4);

    const second = await provider.getTransactionsPage("account-1", {
      from: "2026-11-01",
      to: "2026-11-10",
      cursor: first.nextCursor,
    });
    expect(second.partial).toBe(false);
    expect(second.nextCursor).toBeNull();
    expect(second.requestCount).toBe(1);
    expect(second.transactions).toHaveLength(2);
    expect(urls[1]?.searchParams.get("after")).toBe(CURSOR);
  });

  it("para por requestBudget (limite de subrequests)", async () => {
    let transactionCalls = 0;
    const fetchMock = makeRouter(() => {
      transactionCalls += 1;
      return jsonResponse(transactionCalls === 1 ? page1 : page2);
    });
    const provider = makeProvider(fetchMock);

    const page = await provider.getTransactionsPage("account-1", {
      from: "2026-11-01",
      to: "2026-11-10",
      requestBudget: 1,
    });
    expect(page.partial).toBe(true);
    expect(page.nextCursor).toBe(CURSOR);
    expect(page.requestCount).toBe(1);
    expect(transactionCalls).toBe(1);
  });

  it("extrai somente o valor de after do next", () => {
    expect(extractAfterCursor("?after=abc%2Bdef")).toBe("abc+def");
    expect(extractAfterCursor("?foo=bar")).toBeNull();
    expect(extractAfterCursor(null)).toBeNull();
  });
});

describe("PluggyProvider — refresh/widget", () => {
  it("faz GET do item + PATCH /items para conector comum", async () => {
    const methods: string[] = [];
    const fetchMock = makeRouter(({ url, init }) => {
      methods.push(`${init.method ?? "GET"} ${url.pathname}`);
      return jsonResponse(itemSuccess);
    });
    const provider = makeProvider(fetchMock);

    await expect(provider.refreshConnection("item-1")).resolves.toEqual({ refreshed: true });
    expect(methods).toEqual(["GET /items/item-1", "PATCH /items/item-1"]);
  });

  it("não faz PATCH em item MeuPluggy (conector 200)", async () => {
    const methods: string[] = [];
    const meuPluggy = {
      ...itemSuccess,
      connector: { ...itemSuccess.connector, id: 200, name: "MeuPluggy" },
    };
    const fetchMock = makeRouter(({ url, init }) => {
      methods.push(`${init.method ?? "GET"} ${url.pathname}`);
      return jsonResponse(meuPluggy);
    });
    const provider = makeProvider(fetchMock);

    await expect(provider.refreshConnection("item-1")).resolves.toEqual({
      refreshed: false,
      detail: "meu_pluggy_reads_only",
    });
    expect(methods).toEqual(["GET /items/item-1"]);
  });

  it("cria connect token e resolve conectores via provider", async () => {
    const fetchMock = makeRouter(({ url }) => {
      if (url.pathname === "/connect_token") return jsonResponse(connectTokenFixture);
      if (url.pathname === "/connectors") return jsonResponse(connectorsFixture);
      throw new Error(`rota inesperada: ${url.pathname}`);
    });
    const provider = makeProvider(fetchMock);

    await expect(
      provider.createConnectToken({ clientUserId: "user-1", products: ["ACCOUNTS"] }),
    ).resolves.toBe("fake-connect-token-for-tests");
    await expect(provider.getConnectors({ sandbox: true })).resolves.toHaveLength(1);
  });
});
