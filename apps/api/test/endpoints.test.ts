/**
 * Testes de integração dos endpoints da API (D1 real via workerd).
 *
 * As fixtures entram direto no D1 (ver `fixtures.ts`) e as respostas são
 * validadas com os schemas Zod de `@fd/contracts`, não apenas com o status.
 */
import {
  accountSchema,
  accountsResponse,
  addDays,
  apiErrorSchema,
  billsResponse,
  cashflowResponse,
  categoriesResponse,
  categoryBreakdownResponse,
  categorySchema,
  connectionSchema,
  creditCardsResponse,
  DEFAULT_SETTINGS,
  investmentsResponse,
  monthlyResponse,
  netWorthResponse,
  okResponse,
  overviewResponse,
  providersResponse,
  settingsResponse,
  todayIsoDate,
  transactionSchema,
  transactionsResponse,
  transactionsSummaryResponse,
  uncategorizedCountResponse,
  upcomingBillsResponse,
} from "@fd/contracts";
import {
  accounts,
  balanceSnapshots,
  bills,
  connections,
  creditCards,
  investments,
  transactions,
} from "@fd/database/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAccount,
  createBalanceSnapshot,
  createBill,
  createCategory,
  createConnection,
  createCreditCard,
  createInstitution,
  createInvestment,
  createTransaction,
  readTransaction,
} from "./fixtures";
import { authedRequest, createSessionCookie, createTestUser, db, resetDatabase } from "./helpers";

/** Período amplo o bastante para qualquer fixture datada. */
const ALL_TIME = { from: "2020-01-01", to: "2099-12-31" } as const;

interface Parser<T> {
  parse(value: unknown): T;
}

const transactionEnvelope = z.object({ data: transactionSchema });
const connectionEnvelope = z.object({ data: connectionSchema });
const transactionListEnvelope = z.object({ data: z.array(transactionSchema) });

function findOrThrow<T>(items: readonly T[], predicate: (item: T) => boolean, label: string): T {
  const found = items.find(predicate);
  if (!found) throw new Error(`Item esperado não encontrado: ${label}`);
  return found;
}

async function getJson<T>(path: string, cookie: string, parser: Parser<T>): Promise<T> {
  const response = await authedRequest(path, cookie);
  expect(response.status).toBe(200);
  return parser.parse(await response.json());
}

async function sendJson(
  method: "POST" | "PUT" | "PATCH",
  path: string,
  cookie: string,
  body: unknown,
): Promise<Response> {
  return authedRequest(path, cookie, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function setupUser(): Promise<{ userId: string; cookie: string }> {
  const user = await createTestUser();
  const { cookie } = await createSessionCookie(user.id);
  return { userId: user.id, cookie };
}

async function setupConnection(
  userId: string,
): Promise<{ connectionId: string; institutionId: string }> {
  const institution = await createInstitution({ provider: "demo", name: "Banco Aurora" });
  const connection = await createConnection({
    userId,
    provider: "demo",
    institutionId: institution.id,
  });
  return { connectionId: connection.id, institutionId: institution.id };
}

function transactionsPath(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  return `/api/transactions?${search.toString()}`;
}

/** `GET /api/transactions/summary` aceita os mesmos filtros, sem paginação/sort. */
function transactionsSummaryPath(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  return `/api/transactions/summary?${search.toString()}`;
}

function monthStartOffset(today: string, offset: number): string {
  const [year, month] = today.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1 + offset, 1)).toISOString().slice(0, 10);
}

beforeEach(async () => {
  await resetDatabase();
});

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

describe("GET /api/overview", () => {
  it("calcula KPIs e deltas contra o período anterior", async () => {
    const { userId, cookie } = await setupUser();
    const { connectionId } = await setupConnection(userId);

    const checking = await createAccount({
      userId,
      connectionId,
      name: "Conta Corrente",
      balanceCents: 300_000,
    });
    const savings = await createAccount({
      userId,
      connectionId,
      type: "savings",
      name: "Poupança",
      balanceCents: 100_000,
    });
    const card = await createAccount({
      userId,
      connectionId,
      type: "credit_card",
      name: "Cartão Aurora",
      balanceCents: 120_000,
    });
    await createInvestment({
      userId,
      connectionId,
      name: "CDB Aurora 2028",
      balanceCents: 50_000,
    });

    // Saldos no fechamento de fevereiro (período atual) e janeiro (anterior).
    await createBalanceSnapshot({
      accountId: checking.id,
      date: "2026-01-31",
      balanceCents: 250_000,
    });
    await createBalanceSnapshot({
      accountId: checking.id,
      date: "2026-02-28",
      balanceCents: 300_000,
    });
    await createBalanceSnapshot({
      accountId: savings.id,
      date: "2026-01-31",
      balanceCents: 100_000,
    });
    await createBalanceSnapshot({
      accountId: savings.id,
      date: "2026-02-28",
      balanceCents: 100_000,
    });
    await createBalanceSnapshot({
      accountId: card.id,
      date: "2026-01-31",
      balanceCents: 80_000,
    });
    await createBalanceSnapshot({
      accountId: card.id,
      date: "2026-02-28",
      balanceCents: 120_000,
    });

    const salary = await createCategory({ userId, name: "Salário", kind: "income" });
    const groceries = await createCategory({ userId, name: "Mercado", kind: "expense" });
    const tx = (input: {
      date: string;
      description: string;
      amountCents: number;
      type?: "income" | "expense" | "transfer";
      categoryId?: string | null;
    }) =>
      createTransaction({
        userId,
        connectionId,
        accountId: checking.id,
        categoryId: input.categoryId ?? null,
        ...input,
      });

    // Fevereiro (período atual): receitas 850_000, despesas 150_000.
    await tx({
      date: "2026-02-05",
      description: "SALARIO",
      amountCents: 800_000,
      type: "income",
      categoryId: salary.id,
    });
    await tx({ date: "2026-02-20", description: "FREELA", amountCents: 50_000, type: "income" });
    await tx({
      date: "2026-02-10",
      description: "SUPERMERCADO",
      amountCents: -120_000,
      type: "expense",
      categoryId: groceries.id,
    });
    await tx({
      date: "2026-02-15",
      description: "FARMACIA",
      amountCents: -30_000,
      type: "expense",
    });
    // Transferência não entra em receitas/despesas.
    await tx({
      date: "2026-02-12",
      description: "TRANSFERENCIA",
      amountCents: -200_000,
      type: "transfer",
    });
    // Janeiro (período anterior): receitas 700_000, despesas 100_000.
    await tx({
      date: "2026-01-05",
      description: "SALARIO JAN",
      amountCents: 700_000,
      type: "income",
    });
    await tx({
      date: "2026-01-10",
      description: "ALUGUEL JAN",
      amountCents: -100_000,
      type: "expense",
    });
    // Fora dos dois períodos (não pode entrar em nenhum KPI).
    await tx({
      date: "2026-03-02",
      description: "SALARIO MAR",
      amountCents: 25_000,
      type: "income",
    });

    const body = await getJson(
      "/api/overview?from=2026-02-01&to=2026-02-28",
      cookie,
      overviewResponse,
    );

    expect(body.period).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(body.previousPeriod).toEqual({ from: "2026-01-04", to: "2026-01-31" });
    expect(body.currency).toBe("BRL");

    expect(body.kpis.balance).toEqual({
      currentCents: 400_000,
      previousCents: 350_000,
      deltaCents: 50_000,
      deltaPercent: 14.3,
    });
    expect(body.kpis.income).toEqual({
      currentCents: 850_000,
      previousCents: 700_000,
      deltaCents: 150_000,
      deltaPercent: 21.4,
    });
    expect(body.kpis.expenses).toEqual({
      currentCents: 150_000,
      previousCents: 100_000,
      deltaCents: 50_000,
      deltaPercent: 50,
    });
    expect(body.kpis.result).toEqual({
      currentCents: 700_000,
      previousCents: 600_000,
      deltaCents: 100_000,
      deltaPercent: 16.7,
    });
    expect(body.kpis.netWorth).toEqual({
      currentCents: 330_000,
      previousCents: 320_000,
      deltaCents: 10_000,
      deltaPercent: 3.1,
    });
  });

  it("usa deltaPercent null quando o período anterior é zero", async () => {
    const { userId, cookie } = await setupUser();
    const { connectionId } = await setupConnection(userId);
    const checking = await createAccount({ userId, connectionId, balanceCents: 100_000 });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: "2026-02-10",
      description: "SALARIO",
      amountCents: 50_000,
      type: "income",
    });

    const body = await getJson(
      "/api/overview?from=2026-02-01&to=2026-02-28",
      cookie,
      overviewResponse,
    );

    expect(body.kpis.income.currentCents).toBe(50_000);
    expect(body.kpis.income.previousCents).toBe(0);
    expect(body.kpis.income.deltaCents).toBe(50_000);
    expect(body.kpis.income.deltaPercent).toBeNull();
    expect(body.kpis.expenses.deltaPercent).toBeNull();
    expect(body.kpis.result.deltaPercent).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Analytics                                                                  */
/* -------------------------------------------------------------------------- */

describe("GET /api/analytics", () => {
  it("preenche todos os dias do cashflow e ignora transfers/pendentes", async () => {
    const { userId, cookie } = await setupUser();
    const { connectionId } = await setupConnection(userId);
    const checking = await createAccount({ userId, connectionId, balanceCents: 0 });

    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: "2026-02-02",
      description: "SALARIO",
      amountCents: 100_000,
      type: "income",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: "2026-02-04",
      description: "MERCADO",
      amountCents: -40_000,
      type: "expense",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: "2026-02-03",
      description: "TRANSFERENCIA",
      amountCents: -9_999,
      type: "transfer",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: "2026-02-05",
      description: "COMPRA PENDENTE",
      amountCents: -50_000,
      type: "expense",
      status: "pending",
    });

    const body = await getJson(
      "/api/analytics/cashflow?from=2026-02-01&to=2026-02-05&granularity=day",
      cookie,
      cashflowResponse,
    );

    expect(body.granularity).toBe("day");
    expect(body.period).toEqual({ from: "2026-02-01", to: "2026-02-05" });
    expect(body.data).toEqual([
      { date: "2026-02-01", incomeCents: 0, expenseCents: 0, netCents: 0 },
      { date: "2026-02-02", incomeCents: 100_000, expenseCents: 0, netCents: 100_000 },
      { date: "2026-02-03", incomeCents: 0, expenseCents: 0, netCents: 0 },
      { date: "2026-02-04", incomeCents: 0, expenseCents: 40_000, netCents: -40_000 },
      { date: "2026-02-05", incomeCents: 0, expenseCents: 0, netCents: 0 },
    ]);
  });

  it("rankeia categorias com percentuais e agrupa sem categoria", async () => {
    const { userId, cookie } = await setupUser();
    const { connectionId } = await setupConnection(userId);
    const checking = await createAccount({ userId, connectionId, balanceCents: 0 });

    const groceries = await createCategory({
      userId: null,
      name: "Mercado",
      slug: "mercado",
      kind: "expense",
      icon: "ShoppingCart",
      color: "#22c55e",
    });
    const transport = await createCategory({
      userId: null,
      name: "Transporte",
      slug: "transporte",
      kind: "expense",
      icon: "Car",
      color: "#3b82f6",
    });
    const salary = await createCategory({
      userId: null,
      name: "Salário",
      slug: "salario",
      kind: "income",
    });
    const tx = (input: {
      date: string;
      amountCents: number;
      type: "income" | "expense";
      categoryId?: string | null;
    }) =>
      createTransaction({
        userId,
        connectionId,
        accountId: checking.id,
        description: "LANCAMENTO",
        categoryId: input.categoryId ?? null,
        ...input,
      });

    await tx({
      date: "2026-02-03",
      amountCents: -60_000,
      type: "expense",
      categoryId: groceries.id,
    });
    await tx({
      date: "2026-02-10",
      amountCents: -20_000,
      type: "expense",
      categoryId: groceries.id,
    });
    await tx({
      date: "2026-02-15",
      amountCents: -20_000,
      type: "expense",
      categoryId: transport.id,
    });
    await tx({ date: "2026-02-20", amountCents: -25_000, type: "expense" });
    await tx({ date: "2026-02-05", amountCents: 300_000, type: "income", categoryId: salary.id });

    const expenses = await getJson(
      "/api/analytics/categories?from=2026-02-01&to=2026-02-28&type=expense",
      cookie,
      categoryBreakdownResponse,
    );

    expect(expenses.type).toBe("expense");
    expect(expenses.totalCents).toBe(125_000);
    expect(expenses.data).toHaveLength(3);

    const mercado = findOrThrow(expenses.data, (item) => item.slug === "mercado", "Mercado");
    expect(mercado).toEqual({
      categoryId: groceries.id,
      name: "Mercado",
      slug: "mercado",
      icon: "ShoppingCart",
      color: "#22c55e",
      amountCents: 80_000,
      percentage: 64,
      transactionCount: 2,
    });

    const semCategoria = findOrThrow(
      expenses.data,
      (item) => item.categoryId === null,
      "sem categoria",
    );
    expect(semCategoria).toEqual({
      categoryId: null,
      name: "Sem categoria",
      slug: "sem-categoria",
      icon: "CircleHelp",
      color: "#71717a",
      amountCents: 25_000,
      percentage: 20,
      transactionCount: 1,
    });

    const transporte = findOrThrow(
      expenses.data,
      (item) => item.slug === "transporte",
      "Transporte",
    );
    expect(transporte.amountCents).toBe(20_000);
    expect(transporte.percentage).toBe(16);

    expect(expenses.data.reduce((sum, item) => sum + item.percentage, 0)).toBe(100);

    const income = await getJson(
      "/api/analytics/categories?from=2026-02-01&to=2026-02-28&type=income",
      cookie,
      categoryBreakdownResponse,
    );
    expect(income.type).toBe("income");
    expect(income.totalCents).toBe(300_000);
    const salario = findOrThrow(income.data, (item) => item.slug === "salario", "Salário");
    expect(salario.amountCents).toBe(300_000);
    expect(salario.percentage).toBe(100);
    expect(salario.transactionCount).toBe(1);
  });

  it("monta a série diária de patrimônio usando snapshots", async () => {
    const { userId, cookie } = await setupUser();
    const { connectionId } = await setupConnection(userId);
    const checking = await createAccount({ userId, connectionId, balanceCents: 150_000 });
    const card = await createAccount({
      userId,
      connectionId,
      type: "credit_card",
      name: "Cartão",
      balanceCents: 40_000,
    });
    await createInvestment({
      userId,
      connectionId,
      name: "CDB",
      balanceCents: 20_000,
    });

    await createBalanceSnapshot({
      accountId: checking.id,
      date: "2026-01-31",
      balanceCents: 100_000,
    });
    await createBalanceSnapshot({
      accountId: checking.id,
      date: "2026-02-02",
      balanceCents: 150_000,
    });
    await createBalanceSnapshot({ accountId: card.id, date: "2026-01-31", balanceCents: 30_000 });
    await createBalanceSnapshot({ accountId: card.id, date: "2026-02-03", balanceCents: 40_000 });

    const body = await getJson(
      "/api/analytics/net-worth?from=2026-02-01&to=2026-02-03",
      cookie,
      netWorthResponse,
    );

    expect(body.period).toEqual({ from: "2026-02-01", to: "2026-02-03" });
    expect(body.data).toEqual([
      { date: "2026-02-01", assetsCents: 120_000, liabilitiesCents: 30_000, netWorthCents: 90_000 },
      {
        date: "2026-02-02",
        assetsCents: 170_000,
        liabilitiesCents: 30_000,
        netWorthCents: 140_000,
      },
      {
        date: "2026-02-03",
        assetsCents: 170_000,
        liabilitiesCents: 40_000,
        netWorthCents: 130_000,
      },
    ]);
  });

  it("preenche 12 meses no resumo mensal", async () => {
    const { userId, cookie } = await setupUser();
    const { connectionId } = await setupConnection(userId);
    const checking = await createAccount({ userId, connectionId, balanceCents: 0 });

    const today = todayIsoDate();
    const currentMonth = monthStartOffset(today, 0);
    const twoBack = monthStartOffset(today, -2);
    const elevenBack = monthStartOffset(today, -11);
    const twelveBack = monthStartOffset(today, -12);

    const tx = (date: string, amountCents: number, type: "income" | "expense") =>
      createTransaction({
        userId,
        connectionId,
        accountId: checking.id,
        date,
        description: "LANCAMENTO",
        amountCents,
        type,
      });

    // Mês atual: 300_000 de receita e 50_000 de despesa.
    await tx(`${currentMonth.slice(0, 7)}-01`, 300_000, "income");
    await tx(`${currentMonth.slice(0, 7)}-01`, -50_000, "expense");
    // Dois meses atrás.
    await tx(`${twoBack.slice(0, 7)}-15`, 200_000, "income");
    await tx(`${twoBack.slice(0, 7)}-20`, -25_000, "expense");
    // Primeiro mês da janela (11 meses atrás).
    await tx(`${elevenBack.slice(0, 7)}-10`, -10_000, "expense");
    // Fora da janela de 12 meses.
    await tx(`${twelveBack.slice(0, 7)}-10`, 999_999, "income");

    const body = await getJson("/api/analytics/monthly?months=12", cookie, monthlyResponse);

    expect(body.data).toHaveLength(12);
    expect(body.data.map((item) => item.month)).toEqual(
      Array.from({ length: 12 }, (_, index) => monthStartOffset(today, index - 11).slice(0, 7)),
    );

    const byMonth = new Map(body.data.map((item) => [item.month, item]));
    expect(byMonth.get(currentMonth.slice(0, 7))).toEqual({
      month: currentMonth.slice(0, 7),
      incomeCents: 300_000,
      expenseCents: 50_000,
      netCents: 250_000,
    });
    expect(byMonth.get(twoBack.slice(0, 7))).toEqual({
      month: twoBack.slice(0, 7),
      incomeCents: 200_000,
      expenseCents: 25_000,
      netCents: 175_000,
    });
    expect(byMonth.get(elevenBack.slice(0, 7))).toEqual({
      month: elevenBack.slice(0, 7),
      incomeCents: 0,
      expenseCents: 10_000,
      netCents: -10_000,
    });

    expect(byMonth.has(twelveBack.slice(0, 7))).toBe(false);
    expect(body.data.reduce((sum, item) => sum + item.incomeCents, 0)).toBe(500_000);
    expect(body.data.reduce((sum, item) => sum + item.expenseCents, 0)).toBe(85_000);
    expect(body.data.every((item) => item.netCents === item.incomeCents - item.expenseCents)).toBe(
      true,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Contas                                                                     */
/* -------------------------------------------------------------------------- */

describe("GET /api/accounts", () => {
  it("lista e detalha contas do usuário", async () => {
    const { userId, cookie } = await setupUser();
    const { connectionId } = await setupConnection(userId);

    const checking = await createAccount({
      userId,
      connectionId,
      name: "Conta Corrente",
      externalId: "acc-checking",
      subtype: "CHECKING_ACCOUNT",
      numberMasked: "0001/12345-0",
      balanceCents: 500_000,
      availableCents: 450_000,
    });
    const savings = await createAccount({
      userId,
      connectionId,
      type: "savings",
      name: "Poupança",
      externalId: "acc-savings",
      balanceCents: 200_000,
    });
    const card = await createAccount({
      userId,
      connectionId,
      type: "credit_card",
      name: "Cartão Aurora",
      externalId: "acc-card",
      numberMasked: "4821",
      balanceCents: 120_000,
    });

    const list = await getJson("/api/accounts", cookie, accountsResponse);

    expect(list.data).toHaveLength(3);
    expect(list.data.map((account) => account.id)).toEqual([checking.id, card.id, savings.id]);
    expect(list.data.map((account) => account.provider)).toEqual(["demo", "demo", "demo"]);

    const listChecking = findOrThrow(
      list.data,
      (account) => account.id === checking.id,
      "checking",
    );
    expect(listChecking).toEqual({
      id: checking.id,
      userId,
      connectionId,
      externalId: "acc-checking",
      type: "checking",
      subtype: "CHECKING_ACCOUNT",
      name: "Conta Corrente",
      numberMasked: "0001/12345-0",
      currency: "BRL",
      balanceCents: 500_000,
      availableCents: 450_000,
      updatedAt: checking.updatedAt,
      provider: "demo",
    });

    const detail = await getJson(`/api/accounts/${checking.id}`, cookie, accountSchema);
    expect(detail.id).toBe(checking.id);
    expect(detail.balanceCents).toBe(500_000);
    expect(detail.provider).toBe("demo");

    const missing = await authedRequest(
      "/api/accounts/00000000-0000-4000-8000-000000000000",
      cookie,
    );
    expect(missing.status).toBe(404);
    const error = apiErrorSchema.parse(await missing.json());
    expect(error.error.code).toBe("not_found");
  });
});

/* -------------------------------------------------------------------------- */
/* Transações                                                                 */
/* -------------------------------------------------------------------------- */

interface TransactionsScenario {
  userId: string;
  cookie: string;
  connectionId: string;
  checkingId: string;
  savingsId: string;
  mercadoId: string;
  salarioId: string;
  grocery: { id: string };
  bakery: { id: string };
  salary: { id: string };
  ride: { id: string };
  transfer: { id: string };
}

async function seedTransactionsScenario(): Promise<TransactionsScenario> {
  const { userId, cookie } = await setupUser();
  const { connectionId } = await setupConnection(userId);

  const checking = await createAccount({
    userId,
    connectionId,
    externalId: "acc-checking",
    name: "Conta Corrente",
    balanceCents: 500_000,
  });
  const savings = await createAccount({
    userId,
    connectionId,
    type: "savings",
    externalId: "acc-savings",
    name: "Poupança",
    balanceCents: 100_000,
  });
  const mercado = await createCategory({
    userId,
    name: "Mercado",
    slug: "mercado",
    kind: "expense",
    icon: "ShoppingCart",
    color: "#22c55e",
  });
  const salario = await createCategory({ userId, name: "Salário", kind: "income" });

  const grocery = await createTransaction({
    userId,
    connectionId,
    accountId: checking.id,
    externalId: "tx-grocery",
    date: "2026-03-01",
    description: "SUPERMERCADO BOM PRECO",
    merchant: "Mercado Bom Preço",
    amountCents: -9_000,
    type: "expense",
    categoryId: mercado.id,
  });
  const bakery = await createTransaction({
    userId,
    connectionId,
    accountId: checking.id,
    externalId: "tx-bakery",
    date: "2026-03-02",
    description: "PADARIA PAO DOURADO",
    merchant: "Padaria Central",
    amountCents: -2_000,
    type: "expense",
    categoryId: mercado.id,
  });
  const salary = await createTransaction({
    userId,
    connectionId,
    accountId: checking.id,
    externalId: "tx-salary",
    date: "2026-03-03",
    description: "SALARIO ACME",
    amountCents: 500_000,
    type: "income",
    categoryId: salario.id,
  });
  const ride = await createTransaction({
    userId,
    connectionId,
    accountId: savings.id,
    externalId: "tx-ride",
    date: "2026-03-04",
    description: "99APP *CORRIDA",
    merchant: "Uber do Brasil",
    amountCents: -3_000,
    type: "expense",
  });
  const transfer = await createTransaction({
    userId,
    connectionId,
    accountId: checking.id,
    externalId: "tx-transfer",
    date: "2026-03-05",
    description: "TRANSFERENCIA PARA POUPANCA",
    amountCents: -50_000,
    type: "transfer",
  });

  return {
    userId,
    cookie,
    connectionId,
    checkingId: checking.id,
    savingsId: savings.id,
    mercadoId: mercado.id,
    salarioId: salario.id,
    grocery,
    bakery,
    salary,
    ride,
    transfer,
  };
}

describe("GET /api/transactions", () => {
  it("filtra por período, conta, categoria, tipo e busca", async () => {
    const scenario = await seedTransactionsScenario();
    const { cookie } = scenario;

    const byPeriod = await getJson(
      transactionsPath({ ...ALL_TIME, from: "2026-03-02", to: "2026-03-03" }),
      cookie,
      transactionsResponse,
    );
    expect(new Set(byPeriod.data.map((tx) => tx.id))).toEqual(
      new Set([scenario.bakery.id, scenario.salary.id]),
    );

    const byAccount = await getJson(
      transactionsPath({ ...ALL_TIME, accountId: scenario.checkingId }),
      cookie,
      transactionsResponse,
    );
    expect(new Set(byAccount.data.map((tx) => tx.id))).toEqual(
      new Set([scenario.grocery.id, scenario.bakery.id, scenario.salary.id, scenario.transfer.id]),
    );

    const byCategory = await getJson(
      transactionsPath({ ...ALL_TIME, categoryId: scenario.mercadoId }),
      cookie,
      transactionsResponse,
    );
    expect(new Set(byCategory.data.map((tx) => tx.id))).toEqual(
      new Set([scenario.grocery.id, scenario.bakery.id]),
    );

    const byType = await getJson(
      transactionsPath({ ...ALL_TIME, type: "income" }),
      cookie,
      transactionsResponse,
    );
    expect(byType.data.map((tx) => tx.id)).toEqual([scenario.salary.id]);

    const byDescription = await getJson(
      transactionsPath({ ...ALL_TIME, q: "padaria" }),
      cookie,
      transactionsResponse,
    );
    expect(byDescription.data.map((tx) => tx.id)).toEqual([scenario.bakery.id]);

    // "Uber" só existe em `merchant` (a descrição é "99APP *CORRIDA").
    const byMerchant = await getJson(
      transactionsPath({ ...ALL_TIME, q: "uber" }),
      cookie,
      transactionsResponse,
    );
    expect(byMerchant.data.map((tx) => tx.id)).toEqual([scenario.ride.id]);

    const caseInsensitive = await getJson(
      transactionsPath({ ...ALL_TIME, q: "SALARIO" }),
      cookie,
      transactionsResponse,
    );
    expect(caseInsensitive.data.map((tx) => tx.id)).toEqual([scenario.salary.id]);

    // Filtros combinados.
    const combined = await getJson(
      transactionsPath({
        from: "2026-03-01",
        to: "2026-03-02",
        accountId: scenario.checkingId,
        categoryId: scenario.mercadoId,
        type: "expense",
      }),
      cookie,
      transactionsResponse,
    );
    expect(combined.data.map((tx) => tx.id)).toEqual([scenario.bakery.id, scenario.grocery.id]);
  });

  it("pagina por cursor sem duplicar nem omitir (date_asc, limit=2)", async () => {
    const scenario = await seedTransactionsScenario();
    const { cookie } = scenario;

    const page1 = await getJson(
      transactionsPath({ ...ALL_TIME, sort: "date_asc", limit: 2 }),
      cookie,
      transactionsResponse,
    );
    expect(page1.data.map((tx) => tx.id)).toEqual([scenario.grocery.id, scenario.bakery.id]);
    expect(page1.page.cursor).toBeNull();
    expect(page1.page.nextCursor).not.toBeNull();

    const page2 = await getJson(
      transactionsPath({
        ...ALL_TIME,
        sort: "date_asc",
        limit: 2,
        cursor: page1.page.nextCursor ?? undefined,
      }),
      cookie,
      transactionsResponse,
    );
    expect(page2.data.map((tx) => tx.id)).toEqual([scenario.salary.id, scenario.ride.id]);
    expect(page2.page.cursor).toBe(page1.page.nextCursor);
    expect(page2.page.nextCursor).not.toBeNull();

    const page3 = await getJson(
      transactionsPath({
        ...ALL_TIME,
        sort: "date_asc",
        limit: 2,
        cursor: page2.page.nextCursor ?? undefined,
      }),
      cookie,
      transactionsResponse,
    );
    expect(page3.data.map((tx) => tx.id)).toEqual([scenario.transfer.id]);
    expect(page3.page.nextCursor).toBeNull();

    const allIds = [...page1.data, ...page2.data, ...page3.data].map((tx) => tx.id);
    expect(allIds).toHaveLength(5);
    expect(new Set(allIds).size).toBe(5);
  });

  it("ordena por valor com cursor keyset (amount_asc/amount_desc)", async () => {
    const scenario = await seedTransactionsScenario();
    const { cookie } = scenario;

    const ascPage1 = await getJson(
      transactionsPath({ ...ALL_TIME, sort: "amount_asc", limit: 2 }),
      cookie,
      transactionsResponse,
    );
    expect(ascPage1.data.map((tx) => tx.id)).toEqual([scenario.transfer.id, scenario.grocery.id]);

    const ascPage2 = await getJson(
      transactionsPath({
        ...ALL_TIME,
        sort: "amount_asc",
        limit: 2,
        cursor: ascPage1.page.nextCursor ?? undefined,
      }),
      cookie,
      transactionsResponse,
    );
    expect(ascPage2.data.map((tx) => tx.id)).toEqual([scenario.ride.id, scenario.bakery.id]);

    const ascPage3 = await getJson(
      transactionsPath({
        ...ALL_TIME,
        sort: "amount_asc",
        limit: 2,
        cursor: ascPage2.page.nextCursor ?? undefined,
      }),
      cookie,
      transactionsResponse,
    );
    expect(ascPage3.data.map((tx) => tx.id)).toEqual([scenario.salary.id]);
    expect(ascPage3.page.nextCursor).toBeNull();

    const descPage1 = await getJson(
      transactionsPath({ ...ALL_TIME, sort: "amount_desc", limit: 2 }),
      cookie,
      transactionsResponse,
    );
    expect(descPage1.data.map((tx) => tx.id)).toEqual([scenario.salary.id, scenario.bakery.id]);

    const descPage2 = await getJson(
      transactionsPath({
        ...ALL_TIME,
        sort: "amount_desc",
        limit: 2,
        cursor: descPage1.page.nextCursor ?? undefined,
      }),
      cookie,
      transactionsResponse,
    );
    expect(descPage2.data.map((tx) => tx.id)).toEqual([scenario.ride.id, scenario.grocery.id]);

    const descPage3 = await getJson(
      transactionsPath({
        ...ALL_TIME,
        sort: "amount_desc",
        limit: 2,
        cursor: descPage2.page.nextCursor ?? undefined,
      }),
      cookie,
      transactionsResponse,
    );
    expect(descPage3.data.map((tx) => tx.id)).toEqual([scenario.transfer.id]);
  });

  it("busca trata % e _ literalmente e aceita q no limite máximo", async () => {
    const { userId, cookie } = await setupUser();
    const { connectionId } = await setupConnection(userId);
    const checking = await createAccount({
      userId,
      connectionId,
      externalId: "acc-search",
      balanceCents: 0,
    });
    const literal = await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      externalId: "tx-literal",
      date: "2026-03-01",
      description: "PROMO 100% _OFF_ CUPOM",
      amountCents: -1_000,
      type: "expense",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      externalId: "tx-other",
      date: "2026-03-02",
      description: "OUTRA COISA",
      amountCents: -1_000,
      type: "expense",
    });

    const percent = await getJson(
      transactionsPath({ ...ALL_TIME, q: "100% _off_" }),
      cookie,
      transactionsResponse,
    );
    expect(percent.data.map((tx) => tx.id)).toEqual([literal.id]);

    const underscore = await getJson(
      transactionsPath({ ...ALL_TIME, q: "_off_" }),
      cookie,
      transactionsResponse,
    );
    expect(underscore.data.map((tx) => tx.id)).toEqual([literal.id]);

    // 120 chars é o máximo do contrato; com LIKE/GLOB o D1 rejeitaria o padrão
    // (>50 bytes). Com instr a busca continua válida e não acha nada.
    const long = await getJson(
      transactionsPath({ ...ALL_TIME, q: "x".repeat(120) }),
      cookie,
      transactionsResponse,
    );
    expect(long.data).toEqual([]);
  });

  it("rejeita cursor inválido e cursor de outra ordenação", async () => {
    const scenario = await seedTransactionsScenario();
    const { cookie } = scenario;

    const invalid = await authedRequest(
      transactionsPath({ ...ALL_TIME, cursor: "nao-e-cursor" }),
      cookie,
    );
    expect(invalid.status).toBe(400);
    expect(apiErrorSchema.parse(await invalid.json()).error.code).toBe("bad_request");

    const page = await getJson(
      transactionsPath({ ...ALL_TIME, sort: "date_asc", limit: 2 }),
      cookie,
      transactionsResponse,
    );
    const mismatched = await authedRequest(
      transactionsPath({
        ...ALL_TIME,
        sort: "amount_desc",
        cursor: page.page.nextCursor ?? undefined,
      }),
      cookie,
    );
    expect(mismatched.status).toBe(400);
    expect(apiErrorSchema.parse(await mismatched.json()).error.code).toBe("bad_request");
  });
});

describe("GET /api/transactions/summary", () => {
  it("soma o filtro inteiro, não só a primeira página da lista", async () => {
    const scenario = await seedTransactionsScenario();
    const { cookie } = scenario;

    // A lista entrega 2 de 5 linhas; o resumo tem que falar das 5.
    const firstPage = await getJson(
      transactionsPath({ ...ALL_TIME, limit: 2 }),
      cookie,
      transactionsResponse,
    );
    expect(firstPage.data).toHaveLength(2);

    const summary = await getJson(
      transactionsSummaryPath(ALL_TIME),
      cookie,
      transactionsSummaryResponse,
    );

    expect(summary.period).toEqual({ from: ALL_TIME.from, to: ALL_TIME.to });
    expect(summary.totalCount).toBe(5);
    expect(summary.incomeCents).toBe(500_000);
    expect(summary.expensesCents).toBe(14_000);
    expect(summary.resultCents).toBe(486_000);
    // Contagem por categoria também cobre as 5 linhas (inclui "sem categoria").
    expect(summary.categories).toHaveLength(3);
    expect(summary.categories).toEqual(
      expect.arrayContaining([
        { categoryId: scenario.mercadoId, count: 2 },
        { categoryId: scenario.salarioId, count: 1 },
        { categoryId: null, count: 2 },
      ]),
    );
  });

  it("respeita os mesmos filtros da lista", async () => {
    const scenario = await seedTransactionsScenario();
    const { cookie } = scenario;

    const income = await getJson(
      transactionsSummaryPath({ ...ALL_TIME, type: "income" }),
      cookie,
      transactionsSummaryResponse,
    );
    expect(income).toMatchObject({
      totalCount: 1,
      incomeCents: 500_000,
      expensesCents: 0,
      resultCents: 500_000,
    });
    expect(income.categories).toEqual([{ categoryId: scenario.salarioId, count: 1 }]);

    const byCategory = await getJson(
      transactionsSummaryPath({ ...ALL_TIME, categoryId: scenario.mercadoId }),
      cookie,
      transactionsSummaryResponse,
    );
    expect(byCategory).toMatchObject({
      totalCount: 2,
      incomeCents: 0,
      expensesCents: 11_000,
      resultCents: -11_000,
    });

    const bySearch = await getJson(
      transactionsSummaryPath({ ...ALL_TIME, q: "padaria" }),
      cookie,
      transactionsSummaryResponse,
    );
    expect(bySearch).toMatchObject({ totalCount: 1, expensesCents: 2_000 });

    const uncategorized = await getJson(
      transactionsSummaryPath({ ...ALL_TIME, uncategorized: "true" }),
      cookie,
      transactionsSummaryResponse,
    );
    expect(uncategorized).toMatchObject({ totalCount: 1, expensesCents: 3_000 });
    expect(uncategorized.categories).toEqual([{ categoryId: null, count: 1 }]);

    // Transferência conta como linha do filtro, mas nunca como receita/despesa.
    const transfers = await getJson(
      transactionsSummaryPath({ ...ALL_TIME, type: "transfer" }),
      cookie,
      transactionsSummaryResponse,
    );
    expect(transfers).toMatchObject({
      totalCount: 1,
      incomeCents: 0,
      expensesCents: 0,
      resultCents: 0,
    });
  });

  it("conta pendentes no total, mas soma só efetivadas (paridade com os KPIs)", async () => {
    const { userId, cookie } = await setupUser();
    const { connectionId } = await setupConnection(userId);
    const checking = await createAccount({ userId, connectionId, balanceCents: 0 });

    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: "2026-03-01",
      description: "CAFE DA ESQUINA",
      amountCents: -1_500,
      type: "expense",
      status: "pending",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: "2026-03-02",
      description: "MERCADO",
      amountCents: -9_000,
      type: "expense",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: "2026-03-03",
      description: "SALARIO ACME",
      amountCents: 200_000,
      type: "income",
    });

    // A lista mostra as 3 linhas (a pendente inclusa) — `totalCount` fecha com ela.
    const list = await getJson(transactionsPath(ALL_TIME), cookie, transactionsResponse);
    const summary = await getJson(
      transactionsSummaryPath(ALL_TIME),
      cookie,
      transactionsSummaryResponse,
    );

    expect(summary.totalCount).toBe(list.data.length);
    expect(summary.totalCount).toBe(3);
    // Receitas/despesas só com `posted`, como em `/api/overview`.
    expect(summary.incomeCents).toBe(200_000);
    expect(summary.expensesCents).toBe(9_000);
    expect(summary.resultCents).toBe(191_000);

    const overview = await getJson(
      `/api/overview?from=${ALL_TIME.from}&to=${ALL_TIME.to}`,
      cookie,
      overviewResponse,
    );
    expect(summary.incomeCents).toBe(overview.kpis.income.currentCents);
    expect(summary.expensesCents).toBe(overview.kpis.expenses.currentCents);
    expect(summary.resultCents).toBe(overview.kpis.result.currentCents);

    // `pending=true` recorta a lista e o resumo no mesmo conjunto: só a pendente,
    // e pendentes nunca entram em receitas/despesas.
    const pendingList = await getJson(
      transactionsPath({ ...ALL_TIME, pending: "true" }),
      cookie,
      transactionsResponse,
    );
    expect(pendingList.data.map((tx) => tx.description)).toEqual(["CAFE DA ESQUINA"]);
    const pendingSummary = await getJson(
      transactionsSummaryPath({ ...ALL_TIME, pending: "true" }),
      cookie,
      transactionsSummaryResponse,
    );
    expect(pendingSummary).toMatchObject({ totalCount: 1, incomeCents: 0, expensesCents: 0 });
  });

  it("fecha com a lista paginada inteira por conta e período estreito", async () => {
    const scenario = await seedTransactionsScenario();
    const { cookie } = scenario;

    const filter = {
      from: "2026-03-01",
      to: "2026-03-03",
      accountId: scenario.checkingId,
    };
    const summary = await getJson(
      transactionsSummaryPath(filter),
      cookie,
      transactionsSummaryResponse,
    );

    // Percorre todas as páginas (limit=1) somando linhas e sinais.
    let cursor: string | undefined;
    let rows = 0;
    let incomeCents = 0;
    let expensesCents = 0;
    do {
      const page = await getJson(
        transactionsPath({ ...filter, limit: 1, cursor }),
        cookie,
        transactionsResponse,
      );
      for (const transaction of page.data) {
        rows += 1;
        if (transaction.type === "transfer") continue;
        if (transaction.type === "income") incomeCents += transaction.amountCents;
        if (transaction.type === "expense") expensesCents -= transaction.amountCents;
      }
      cursor = page.page.nextCursor ?? undefined;
    } while (cursor);

    expect(summary.totalCount).toBe(rows);
    expect(summary.incomeCents).toBe(incomeCents);
    expect(summary.expensesCents).toBe(expensesCents);
    expect(summary.totalCount).toBe(3);
  });
});

describe("GET /api/transactions/uncategorized-count", () => {
  it("devolve 0 sem transações", async () => {
    const { cookie } = await setupUser();

    const body = await getJson(
      "/api/transactions/uncategorized-count",
      cookie,
      uncategorizedCountResponse,
    );
    expect(body).toEqual({ count: 0 });
  });

  it("conta só posted income/expense sem categoria e o filtro devolve o mesmo conjunto", async () => {
    const scenario = await seedTransactionsScenario();
    const { cookie } = scenario;

    const count = await getJson(
      "/api/transactions/uncategorized-count",
      cookie,
      uncategorizedCountResponse,
    );
    // grocery/bakery/salary têm categoria; transfer fica fora pela regra.
    expect(count).toEqual({ count: 1 });

    const filtered = await getJson(
      transactionsPath({ ...ALL_TIME, uncategorized: "true" }),
      cookie,
      transactionsResponse,
    );
    expect(filtered.data.map((tx) => tx.id)).toEqual([scenario.ride.id]);
    expect(filtered.data.every((tx) => tx.categoryId === null)).toBe(true);

    // `uncategorized=false` (ou ausente) não filtra.
    const all = await getJson(
      transactionsPath({ ...ALL_TIME, uncategorized: "false" }),
      cookie,
      transactionsResponse,
    );
    expect(all.data).toHaveLength(5);
  });

  it("exclui transferência/pendente, inclui conexão desconectada e isola usuários", async () => {
    const { userId, cookie } = await setupUser();
    const { connectionId } = await setupConnection(userId);
    const checking = await createAccount({ userId, connectionId, balanceCents: 0 });
    const category = await createCategory({ userId, name: "Mercado", kind: "expense" });

    const uncategorizedExpense = await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      externalId: "tx-uncategorized-expense",
      date: "2026-03-01",
      description: "COMPRA SEM CATEGORIA",
      amountCents: -5_000,
      type: "expense",
    });
    const uncategorizedIncome = await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      externalId: "tx-uncategorized-income",
      date: "2026-03-02",
      description: "ENTRADA SEM CATEGORIA",
      amountCents: 7_000,
      type: "income",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      externalId: "tx-categorized",
      date: "2026-03-03",
      description: "COMPRA COM CATEGORIA",
      amountCents: -1_000,
      type: "expense",
      categoryId: category.id,
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      externalId: "tx-transfer",
      date: "2026-03-04",
      description: "TRANSFERENCIA",
      amountCents: -2_000,
      type: "transfer",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      externalId: "tx-pending",
      date: "2026-03-05",
      description: "COMPRA PENDENTE",
      amountCents: -3_000,
      type: "expense",
      status: "pending",
    });

    // Conexão desconectada: os dados continuam visíveis na listagem/análises,
    // então também entram na contagem.
    const disconnected = await createConnection({
      userId,
      provider: "demo",
      status: "disconnected",
    });
    const oldAccount = await createAccount({
      userId,
      connectionId: disconnected.id,
      externalId: "acc-old",
      balanceCents: 0,
    });
    const disconnectedTx = await createTransaction({
      userId,
      connectionId: disconnected.id,
      accountId: oldAccount.id,
      externalId: "tx-disconnected",
      date: "2026-02-20",
      description: "COMPRA ANTIGA SEM CATEGORIA",
      amountCents: -4_000,
      type: "expense",
    });

    const count = await getJson(
      "/api/transactions/uncategorized-count",
      cookie,
      uncategorizedCountResponse,
    );
    expect(count).toEqual({ count: 3 });

    const filtered = await getJson(
      transactionsPath({ ...ALL_TIME, uncategorized: "true", sort: "date_asc" }),
      cookie,
      transactionsResponse,
    );
    expect(filtered.data.map((tx) => tx.id)).toEqual([
      disconnectedTx.id,
      uncategorizedExpense.id,
      uncategorizedIncome.id,
    ]);

    // Outro usuário tem o próprio contador.
    const outsider = await setupUser();
    const outsiderConnection = await setupConnection(outsider.userId);
    const outsiderAccount = await createAccount({
      userId: outsider.userId,
      connectionId: outsiderConnection.connectionId,
      balanceCents: 0,
    });
    await createTransaction({
      userId: outsider.userId,
      connectionId: outsiderConnection.connectionId,
      accountId: outsiderAccount.id,
      date: "2026-03-06",
      description: "COMPRA DO OUTRO USUARIO",
      amountCents: -9_000,
      type: "expense",
    });
    const outsiderCount = await getJson(
      "/api/transactions/uncategorized-count",
      outsider.cookie,
      uncategorizedCountResponse,
    );
    expect(outsiderCount).toEqual({ count: 1 });

    // Categorizar uma transação reduz o contador.
    const patched = await sendJson(
      "PATCH",
      `/api/transactions/${uncategorizedExpense.id}`,
      cookie,
      { categoryId: category.id },
    );
    expect(patched.status).toBe(200);
    const after = await getJson(
      "/api/transactions/uncategorized-count",
      cookie,
      uncategorizedCountResponse,
    );
    expect(after).toEqual({ count: 2 });
  });

  it("rejeita uncategorized fora de true/false", async () => {
    const { cookie } = await setupUser();

    const response = await authedRequest(
      transactionsPath({ ...ALL_TIME, uncategorized: "talvez" }),
      cookie,
    );
    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("validation_error");
  });
});

describe("PATCH /api/transactions/:id", () => {
  it("atualiza categoria (marcando categorySource=user) e notas", async () => {
    const scenario = await seedTransactionsScenario();
    const { cookie } = scenario;

    const recategorized = await sendJson(
      "PATCH",
      `/api/transactions/${scenario.salary.id}`,
      cookie,
      { categoryId: scenario.mercadoId },
    );
    expect(recategorized.status).toBe(200);
    const recategorizedBody = transactionEnvelope.parse(await recategorized.json());
    expect(recategorizedBody.data.id).toBe(scenario.salary.id);
    expect(recategorizedBody.data.categoryId).toBe(scenario.mercadoId);
    expect(recategorizedBody.data.category?.slug).toBe("mercado");
    expect(recategorizedBody.data.account?.provider).toBe("demo");

    const salaryRow = await readTransaction(scenario.salary.id);
    expect(salaryRow?.categoryId).toBe(scenario.mercadoId);
    expect(salaryRow?.categorySource).toBe("user");

    const noted = await sendJson("PATCH", `/api/transactions/${scenario.bakery.id}`, cookie, {
      notes: "  compra do café da manhã  ",
    });
    expect(noted.status).toBe(200);
    const notedBody = transactionEnvelope.parse(await noted.json());
    expect(notedBody.data.notes).toBe("  compra do café da manhã  ");
    expect(notedBody.data.categoryId).toBe(scenario.mercadoId);

    const bakeryRow = await readTransaction(scenario.bakery.id);
    expect(bakeryRow?.notes).toBe("  compra do café da manhã  ");
    // Notas não mexem na origem da categoria.
    expect(bakeryRow?.categorySource).toBe("provider");

    const cleared = await sendJson("PATCH", `/api/transactions/${scenario.grocery.id}`, cookie, {
      categoryId: null,
    });
    expect(cleared.status).toBe(200);
    const clearedBody = transactionEnvelope.parse(await cleared.json());
    expect(clearedBody.data.categoryId).toBeNull();
    expect(clearedBody.data.category).toBeNull();
    expect((await readTransaction(scenario.grocery.id))?.categorySource).toBe("user");
  });

  it("rejeita categoria de outro usuário, corpo vazio e id inexistente", async () => {
    const scenario = await seedTransactionsScenario();
    const { cookie } = scenario;

    const outsider = await setupUser();
    const foreignCategory = await createCategory({
      userId: outsider.userId,
      name: "Categoria Alheia",
      kind: "expense",
    });

    const invalidCategory = await sendJson(
      "PATCH",
      `/api/transactions/${scenario.salary.id}`,
      cookie,
      { categoryId: foreignCategory.id },
    );
    expect(invalidCategory.status).toBe(400);
    expect(apiErrorSchema.parse(await invalidCategory.json()).error.code).toBe("bad_request");

    const emptyBody = await sendJson(
      "PATCH",
      `/api/transactions/${scenario.salary.id}`,
      cookie,
      {},
    );
    expect(emptyBody.status).toBe(400);
    expect(apiErrorSchema.parse(await emptyBody.json()).error.code).toBe("validation_error");

    const missing = await sendJson(
      "PATCH",
      "/api/transactions/00000000-0000-4000-8000-000000000000",
      cookie,
      { notes: "x" },
    );
    expect(missing.status).toBe(404);
    expect(apiErrorSchema.parse(await missing.json()).error.code).toBe("not_found");

    // Nenhuma das tentativas inválidas alterou a transação original.
    const salaryRow = await readTransaction(scenario.salary.id);
    expect(salaryRow?.categoryId).toBe(scenario.salarioId);
    expect(salaryRow?.notes).toBeNull();
    expect(salaryRow?.categorySource).toBe("provider");
  });
});

/* -------------------------------------------------------------------------- */
/* Categorias                                                                 */
/* -------------------------------------------------------------------------- */

describe("GET/POST /api/categories", () => {
  it("lista system + usuário e cria com slug derivado e sufixo em colisão", async () => {
    const { userId, cookie } = await setupUser();
    const systemMercado = await createCategory({
      userId: null,
      name: "Mercado",
      slug: "mercado",
      kind: "expense",
      icon: "ShoppingCart",
      color: "#22c55e",
    });
    const userSalary = await createCategory({
      userId,
      name: "Salário",
      slug: "salario",
      kind: "income",
      icon: "Wallet",
      color: "#3b82f6",
    });

    const list = await getJson("/api/categories", cookie, categoriesResponse);
    expect(list.data.map((category) => category.slug)).toEqual(["mercado", "salario"]);
    expect(findOrThrow(list.data, (item) => item.id === systemMercado.id, "system")).toMatchObject({
      userId: null,
      name: "Mercado",
      kind: "expense",
    });
    expect(findOrThrow(list.data, (item) => item.id === userSalary.id, "user").userId).toBe(userId);

    const created = await sendJson("POST", "/api/categories", cookie, {
      name: "Assinaturas",
      icon: "Repeat",
      color: "#a855f7",
      kind: "expense",
    });
    expect(created.status).toBe(201);
    const createdBody = categorySchema.parse(await created.json());
    expect(createdBody).toMatchObject({
      userId,
      name: "Assinaturas",
      slug: "assinaturas",
      icon: "Repeat",
      color: "#a855f7",
      kind: "expense",
      parentId: null,
    });

    // Mesmo nome do próprio usuário -> sufixo -2.
    const duplicated = await sendJson("POST", "/api/categories", cookie, {
      name: "Assinaturas",
      icon: "Repeat",
      color: "#a855f7",
      kind: "expense",
    });
    expect(duplicated.status).toBe(201);
    expect(categorySchema.parse(await duplicated.json()).slug).toBe("assinaturas-2");

    // Mesmo slug de categoria de sistema também colide.
    const systemCollision = await sendJson("POST", "/api/categories", cookie, {
      name: "Mercado",
      icon: "ShoppingCart",
      color: "#22c55e",
      kind: "expense",
    });
    expect(systemCollision.status).toBe(201);
    expect(categorySchema.parse(await systemCollision.json()).slug).toBe("mercado-2");

    const explicitSlug = await sendJson("POST", "/api/categories", cookie, {
      name: "Lazer e Cultura",
      slug: "lazer-custom",
      icon: "Ticket",
      color: "#f97316",
      kind: "expense",
    });
    expect(explicitSlug.status).toBe(201);
    expect(categorySchema.parse(await explicitSlug.json()).slug).toBe("lazer-custom");

    const after = await getJson("/api/categories", cookie, categoriesResponse);
    expect(after.data).toHaveLength(6);
  });

  it("valida cor, slug e categoria pai", async () => {
    const { cookie } = await setupUser();

    const badColor = await sendJson("POST", "/api/categories", cookie, {
      name: "Inválida",
      icon: "Circle",
      color: "verde",
      kind: "expense",
    });
    expect(badColor.status).toBe(400);
    expect(apiErrorSchema.parse(await badColor.json()).error.code).toBe("validation_error");

    const badSlug = await sendJson("POST", "/api/categories", cookie, {
      name: "Inválida",
      slug: "Com Espaço",
      icon: "Circle",
      color: "#22c55e",
      kind: "expense",
    });
    expect(badSlug.status).toBe(400);
    expect(apiErrorSchema.parse(await badSlug.json()).error.code).toBe("validation_error");

    const missingParent = await sendJson("POST", "/api/categories", cookie, {
      name: "Filha",
      icon: "Circle",
      color: "#22c55e",
      kind: "expense",
      parentId: "00000000-0000-4000-8000-000000000000",
    });
    expect(missingParent.status).toBe(400);
    expect(apiErrorSchema.parse(await missingParent.json()).error.code).toBe("bad_request");
  });
});

/* -------------------------------------------------------------------------- */
/* Cartões, faturas e bills                                                   */
/* -------------------------------------------------------------------------- */

describe("cartões e faturas", () => {
  it("lista cartões, faturas do cartão, próximos vencimentos e transações da fatura", async () => {
    const { userId, cookie } = await setupUser();
    const { connectionId } = await setupConnection(userId);
    const today = todayIsoDate();

    await createAccount({
      userId,
      connectionId,
      externalId: "acc-checking",
      name: "Conta Corrente",
      balanceCents: 500_000,
    });
    const card = await createAccount({
      userId,
      connectionId,
      type: "credit_card",
      externalId: "acc-card",
      name: "Cartão Aurora Visa",
      numberMasked: "4821",
      balanceCents: 250_000,
    });
    await createCreditCard({
      accountId: card.id,
      brand: "VISA",
      level: "INFINITE",
      limitCents: 1_000_000,
      availableLimitCents: 750_000,
      closingDay: 20,
      dueDay: 28,
    });

    const closed = await createBill({
      accountId: card.id,
      externalId: "bill-closed",
      dueDate: addDays(today, 20),
      closingDate: addDays(today, -2),
      totalCents: 180_000,
      minimumPaymentCents: 18_000,
      status: "closed",
    });
    const open = await createBill({
      accountId: card.id,
      externalId: "bill-open",
      dueDate: addDays(today, 10),
      closingDate: addDays(today, 2),
      totalCents: 250_000,
      minimumPaymentCents: 25_000,
      status: "open",
    });
    const overdue = await createBill({
      accountId: card.id,
      externalId: "bill-overdue",
      dueDate: addDays(today, -5),
      closingDate: addDays(today, -15),
      totalCents: 90_000,
      status: "overdue",
    });
    const paid = await createBill({
      accountId: card.id,
      externalId: "bill-paid",
      dueDate: addDays(today, -30),
      closingDate: addDays(today, -40),
      totalCents: 60_000,
      status: "paid",
    });
    const farFuture = await createBill({
      accountId: card.id,
      externalId: "bill-far",
      dueDate: addDays(today, 45),
      totalCents: 40_000,
      status: "open",
    });

    const purchase = await createTransaction({
      userId,
      connectionId,
      accountId: card.id,
      externalId: "card-purchase",
      date: addDays(today, -3),
      description: "COMPRA A VISTA",
      amountCents: -120_000,
      type: "expense",
      billId: open.id,
    });
    const installment = await createTransaction({
      userId,
      connectionId,
      accountId: card.id,
      externalId: "card-installment",
      date: addDays(today, -2),
      description: "PARCELA NOTEBOOK",
      amountCents: -10_000,
      type: "expense",
      billId: open.id,
    });

    const cards = await getJson("/api/credit-cards", cookie, creditCardsResponse);
    expect(cards.data).toHaveLength(1);
    const cardDto = cards.data[0]!;
    expect(cardDto).toMatchObject({
      accountId: card.id,
      brand: "VISA",
      level: "INFINITE",
      limitCents: 1_000_000,
      availableLimitCents: 750_000,
      closingDay: 20,
      dueDay: 28,
      account: {
        id: card.id,
        name: "Cartão Aurora Visa",
        numberMasked: "4821",
        currency: "BRL",
        balanceCents: 250_000,
        provider: "demo",
        institutionName: "Banco Aurora",
        institutionLogoUrl: null,
      },
    });

    const cardBills = await getJson(`/api/credit-cards/${card.id}/bills`, cookie, billsResponse);
    expect(cardBills.data.map((bill) => bill.id)).toEqual([
      farFuture.id,
      closed.id,
      open.id,
      overdue.id,
      paid.id,
    ]);
    expect(cardBills.data.map((bill) => bill.status)).toEqual([
      "open",
      "closed",
      "open",
      "overdue",
      "paid",
    ]);
    expect(findOrThrow(cardBills.data, (bill) => bill.id === open.id, "open bill")).toMatchObject({
      dueDate: addDays(today, 10),
      closingDate: addDays(today, 2),
      totalCents: 250_000,
      minimumPaymentCents: 25_000,
    });

    const upcoming = await getJson(
      "/api/bills/upcoming?days=30&limit=5",
      cookie,
      upcomingBillsResponse,
    );
    expect(upcoming.data.map((bill) => bill.id)).toEqual([overdue.id, open.id, closed.id]);
    expect(upcoming.data.map((bill) => bill.daysUntilDue)).toEqual([-5, 10, 20]);
    expect(upcoming.data.map((bill) => bill.status)).toEqual(["overdue", "open", "closed"]);
    expect(upcoming.data.map((bill) => bill.estimated)).toEqual([false, false, false]);
    const upcomingOpen = findOrThrow(upcoming.data, (bill) => bill.id === open.id, "upcoming open");
    expect(upcomingOpen).toMatchObject({
      accountName: "Cartão Aurora Visa",
      creditCardBrand: "VISA",
      daysUntilDue: 10,
    });

    const limited = await getJson(
      "/api/bills/upcoming?days=30&limit=2",
      cookie,
      upcomingBillsResponse,
    );
    expect(limited.data.map((bill) => bill.id)).toEqual([overdue.id, open.id]);

    const billTransactions = await getJson(
      `/api/bills/${open.id}/transactions`,
      cookie,
      transactionListEnvelope,
    );
    expect(billTransactions.data.map((tx) => tx.id)).toEqual([installment.id, purchase.id]);
    expect(billTransactions.data.map((tx) => tx.billId)).toEqual([open.id, open.id]);
    expect(billTransactions.data[0]?.account?.provider).toBe("demo");

    const missingBill = await authedRequest(
      "/api/bills/00000000-0000-4000-8000-000000000000/transactions",
      cookie,
    );
    expect(missingBill.status).toBe(404);
    expect(apiErrorSchema.parse(await missingBill.json()).error.code).toBe("not_found");
  });

  /**
   * Caso de produção com relógio fixo em 11/11/2026: o Pluggy só devolveu
   * faturas fechadas e a última de cada cartão já está paga, mas a fatura
   * corrente existe. Sem derivar, a Visão geral mostrava "sem faturas abertas"
   * com a dívida aparecendo no patrimônio.
   */
  it("deriva a fatura corrente do cartão a partir das compras do ciclo", async () => {
    const { userId, cookie } = await setupUser();
    const { connectionId } = await setupConnection(userId);

    // GOLD (produção): due_day 7, `closing_day` null porque o Pluggy não manda
    // `balanceCloseDate`; última fatura paga em 07/11 com fechamento em 30/10.
    const gold = await createAccount({
      userId,
      connectionId,
      type: "credit_card",
      externalId: "acc-gold",
      name: "GOLD",
      numberMasked: "1111",
      balanceCents: 123_456,
    });
    await createCreditCard({ accountId: gold.id, brand: "MASTERCARD", dueDay: 7 });
    await createBill({
      accountId: gold.id,
      externalId: "gold-2026-11",
      dueDate: "2026-11-07",
      closingDate: "2026-10-30",
      totalCents: 207_660,
      minimumPaymentCents: 32_692,
      status: "paid",
    });
    // O Pluggy deixa faturas antigas como `closed` sem pagamento: elas não
    // podem esconder a fatura corrente.
    await createBill({
      accountId: gold.id,
      externalId: "gold-2026-06",
      dueDate: "2026-06-22",
      closingDate: "2026-06-15",
      totalCents: 59_408,
      status: "closed",
    });
    // Compras do ciclo atual, posted e pending.
    await createTransaction({
      userId,
      connectionId,
      accountId: gold.id,
      externalId: "gold-purchase-1",
      date: "2026-11-01",
      description: "AMAZON BR",
      amountCents: -23_357,
      type: "expense",
      status: "posted",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: gold.id,
      externalId: "gold-purchase-2",
      date: "2026-11-01",
      description: "ZP LHL TXTIL",
      amountCents: -5_289,
      type: "expense",
      status: "pending",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: gold.id,
      externalId: "gold-purchase-3",
      date: "2026-11-08",
      description: "99FOOD",
      amountCents: -3_164,
      type: "expense",
      status: "pending",
    });
    // Compra de antes do fechamento: já está na fatura paga, não entra.
    await createTransaction({
      userId,
      connectionId,
      accountId: gold.id,
      externalId: "gold-purchase-old",
      date: "2026-10-29",
      description: "COMPRA ANTES DO FECHAMENTO",
      amountCents: -9_999,
      type: "expense",
      status: "posted",
    });
    // Pagamento da fatura e estorno: a fatura é a soma das compras.
    await createTransaction({
      userId,
      connectionId,
      accountId: gold.id,
      externalId: "gold-payment",
      date: "2026-11-09",
      description: "PAGTO DEBITO AUTOMATICO",
      amountCents: 207_660,
      type: "transfer",
      status: "pending",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: gold.id,
      externalId: "gold-refund",
      date: "2026-11-08",
      description: "ESTORNO",
      amountCents: 11_000,
      type: "income",
      status: "pending",
    });

    // Com histórico: teto pelo saldo devedor. A platinum tem R$ 1.500 de
    // compras no ciclo e R$ 12,34 de saldo → fatura de R$ 12,34 (ciclo pago).
    const platinum = await createAccount({
      userId,
      connectionId,
      type: "credit_card",
      externalId: "acc-platinum",
      name: "platinum",
      numberMasked: "2222",
      balanceCents: 1_234,
    });
    await createCreditCard({ accountId: platinum.id, brand: "MASTERCARD", dueDay: 22 });
    await createBill({
      accountId: platinum.id,
      externalId: "platinum-2026-10",
      dueDate: "2026-10-22",
      closingDate: "2026-10-15",
      totalCents: 178_877,
      status: "paid",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: platinum.id,
      externalId: "platinum-purchase-1",
      date: "2026-10-20",
      description: "PASSAGEM AEREA",
      amountCents: -100_000,
      type: "expense",
      status: "posted",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: platinum.id,
      externalId: "platinum-purchase-2",
      date: "2026-11-10",
      description: "PASSAGEM AEREA 2",
      amountCents: -50_000,
      type: "expense",
      status: "pending",
    });
    // Pagamento do ciclo: `transfer`, não abate o total derivado.
    await createTransaction({
      userId,
      connectionId,
      accountId: platinum.id,
      externalId: "platinum-payment",
      date: "2026-11-10",
      description: "Pagamento recebido",
      amountCents: 450_000,
      type: "transfer",
      status: "pending",
    });

    // Compras líquidas: o dia do fechamento entra no ciclo e estornos (`income`)
    // abatem — 5.000 + 60.000 − 10.000 = 55.000 (abaixo do saldo de 100.000).
    const net = await createAccount({
      userId,
      connectionId,
      type: "credit_card",
      externalId: "acc-net",
      name: "Cartão Net",
      balanceCents: 100_000,
    });
    await createCreditCard({ accountId: net.id, brand: "VISA", dueDay: 20 });
    await createBill({
      accountId: net.id,
      externalId: "net-2026-10",
      dueDate: "2026-10-20",
      closingDate: "2026-10-15",
      totalCents: 90_000,
      status: "paid",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: net.id,
      externalId: "net-closing-day",
      date: "2026-10-15",
      description: "COMPRA NO DIA DO FECHAMENTO",
      amountCents: -5_000,
      type: "expense",
      status: "pending",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: net.id,
      externalId: "net-purchase",
      date: "2026-11-01",
      description: "COMPRA",
      amountCents: -60_000,
      type: "expense",
      status: "posted",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: net.id,
      externalId: "net-refund",
      date: "2026-11-02",
      description: "ESTORNO",
      amountCents: 10_000,
      type: "income",
      status: "posted",
    });

    // Sem histórico de faturas, o valor vem do saldo devedor do cartão.
    const semHistorico = await createAccount({
      userId,
      connectionId,
      type: "credit_card",
      externalId: "acc-sem-historico",
      name: "Cartão Elo",
      balanceCents: 7_000,
    });
    await createCreditCard({ accountId: semHistorico.id, brand: "ELO", dueDay: 15 });

    // Sem saldo devedor e sem faturas não existe fatura aberta.
    const semSaldo = await createAccount({
      userId,
      connectionId,
      type: "credit_card",
      externalId: "acc-sem-saldo",
      name: "Cartão Sem Saldo",
      balanceCents: 0,
    });
    await createCreditCard({ accountId: semSaldo.id, brand: "VISA", dueDay: 10 });

    // Outro usuário com cartão sem faturas não pode aparecer nesta lista.
    const outro = await createTestUser();
    const outraConexao = await createConnection({ userId: outro.id, provider: "demo" });
    const cartaoDoOutro = await createAccount({
      userId: outro.id,
      connectionId: outraConexao.id,
      type: "credit_card",
      externalId: "acc-outro",
      name: "Cartão de outro usuário",
      balanceCents: 900_000,
    });
    await createCreditCard({ accountId: cartaoDoOutro.id, brand: "VISA", dueDay: 7 });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-11T12:00:00.000Z"));

    try {
      const upcoming = await getJson(
        "/api/bills/upcoming?days=30&limit=10",
        cookie,
        upcomingBillsResponse,
      );

      expect(upcoming.data.map((bill) => bill.dueDate)).toEqual([
        "2026-11-15",
        "2026-11-20",
        "2026-11-22",
        "2026-12-07",
      ]);

      const goldBill = findOrThrow(
        upcoming.data,
        (bill) => bill.accountId === gold.id,
        "fatura derivada do GOLD",
      );
      expect(goldBill).toMatchObject({
        id: `open-invoice:${gold.id}:2026-12-07`,
        externalId: "open-invoice-2026-12-07",
        accountName: "GOLD",
        creditCardBrand: "MASTERCARD",
        dueDate: "2026-12-07",
        closingDate: "2026-11-30",
        // 23.357 + 5.289 + 3.164 = 31.810 de compras depois do fechamento de
        // 30/10, menos 11.000 de estorno (`income`) = 20.810.
        totalCents: 20_810,
        minimumPaymentCents: null,
        status: "open",
        daysUntilDue: 26,
        estimated: true,
      });

      const platinumBill = findOrThrow(
        upcoming.data,
        (bill) => bill.accountId === platinum.id,
        "fatura derivada da platinum",
      );
      expect(platinumBill).toMatchObject({
        dueDate: "2026-11-22",
        closingDate: "2026-11-15",
        // R$ 1.500 de compras no ciclo, mas só R$ 12,34 de saldo devedor: o
        // pagamento aparece como `transfer` e o saldo é o teto da fatura.
        totalCents: 1_234,
        status: "open",
        daysUntilDue: 11,
        estimated: true,
      });

      const netBill = findOrThrow(
        upcoming.data,
        (bill) => bill.accountId === net.id,
        "fatura derivada com estorno",
      );
      expect(netBill).toMatchObject({
        dueDate: "2026-11-20",
        // 5.000 (dia do fechamento) + 60.000 − 10.000 de estorno.
        totalCents: 55_000,
        estimated: true,
      });

      const semHistoricoBill = findOrThrow(
        upcoming.data,
        (bill) => bill.accountId === semHistorico.id,
        "fatura derivada sem histórico",
      );
      expect(semHistoricoBill).toMatchObject({
        dueDate: "2026-11-15",
        closingDate: null,
        totalCents: 7_000,
        estimated: true,
      });

      expect(upcoming.data.some((bill) => bill.accountId === semSaldo.id)).toBe(false);
      expect(upcoming.data.some((bill) => bill.accountId === cartaoDoOutro.id)).toBe(false);

      // Id estável entre chamadas (a UI usa como key); a derivada não existe em
      // `bills`, então a rota de lançamentos responde 404 em vez de quebrar.
      const again = await getJson(
        "/api/bills/upcoming?days=30&limit=10",
        cookie,
        upcomingBillsResponse,
      );
      expect(again.data.map((bill) => bill.id)).toEqual(upcoming.data.map((bill) => bill.id));

      const derivedTransactions = await authedRequest(
        `/api/bills/${goldBill.id}/transactions`,
        cookie,
      );
      expect(derivedTransactions.status).toBe(404);
      expect(apiErrorSchema.parse(await derivedTransactions.json()).error.code).toBe("not_found");

      // A janela (`days`) também filtra a derivada: com 1 dia nenhuma das
      // faturas correntes (15/11, 20/11, 22/11 e 07/12) entra.
      const narrow = await getJson(
        "/api/bills/upcoming?days=1&limit=10",
        cookie,
        upcomingBillsResponse,
      );
      expect(narrow.data).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Investimentos, settings e providers                                        */
/* -------------------------------------------------------------------------- */

describe("GET /api/investments", () => {
  it("lista posições ordenadas por saldo com provider e instituição", async () => {
    const { userId, cookie } = await setupUser();
    const { connectionId } = await setupConnection(userId);
    const small = await createInvestment({
      userId,
      connectionId,
      externalId: "inv-small",
      name: "Tesouro Selic 2029",
      balanceCents: 500_000,
      amountProfitCents: 25_000,
      type: "fixed_income",
    });
    const big = await createInvestment({
      userId,
      connectionId,
      externalId: "inv-big",
      name: "Fundo Multimercado",
      balanceCents: 900_000,
      amountProfitCents: 90_000,
      type: "fund",
    });

    const body = await getJson("/api/investments", cookie, investmentsResponse);
    expect(body.data.map((investment) => investment.id)).toEqual([big.id, small.id]);
    expect(body.data[0]).toMatchObject({
      id: big.id,
      userId,
      connectionId,
      externalId: "inv-big",
      type: "fund",
      name: "Fundo Multimercado",
      balanceCents: 900_000,
      amountProfitCents: 90_000,
      currency: "BRL",
      provider: "demo",
      institution: { name: "Banco Aurora", provider: "demo" },
    });
  });
});

describe("settings", () => {
  it("devolve defaults e persiste atualizações parciais", async () => {
    const { cookie } = await setupUser();

    const defaults = await getJson("/api/settings", cookie, settingsResponse);
    expect(defaults.data).toEqual(DEFAULT_SETTINGS);

    const updated = await sendJson("PUT", "/api/settings", cookie, { theme: "light" });
    expect(updated.status).toBe(200);
    const updatedBody = settingsResponse.parse(await updated.json());
    expect(updatedBody.data).toEqual({ theme: "light", locale: "pt-BR", currency: "BRL" });

    const persisted = await getJson("/api/settings", cookie, settingsResponse);
    expect(persisted.data.theme).toBe("light");

    const invalid = await sendJson("PUT", "/api/settings", cookie, { theme: "blue" });
    expect(invalid.status).toBe(400);
    expect(apiErrorSchema.parse(await invalid.json()).error.code).toBe("validation_error");

    const empty = await sendJson("PUT", "/api/settings", cookie, {});
    expect(empty.status).toBe(400);
    expect(apiErrorSchema.parse(await empty.json()).error.code).toBe("validation_error");
  });
});

describe("providers", () => {
  it("lista providers configurados e falha o connect-token sem Pluggy", async () => {
    const { cookie } = await setupUser();

    const body = await getJson("/api/providers", cookie, providersResponse);
    const demo = findOrThrow(body.data, (provider) => provider.id === "demo", "demo");
    expect(demo).toEqual({
      id: "demo",
      name: "Demonstração",
      configured: true,
      description:
        "Dados fictícios determinísticos (3 instituições, ~12 meses) para explorar o app.",
      supportsConnectWidget: false,
    });

    const pluggy = findOrThrow(body.data, (provider) => provider.id === "pluggy", "pluggy");
    expect(pluggy.configured).toBe(false);
    expect(pluggy.supportsConnectWidget).toBe(true);
    expect(pluggy.description).toContain("Pluggy");

    const connectToken = await sendJson("POST", "/api/providers/pluggy/connect-token", cookie, {});
    expect(connectToken.status).toBe(502);
    const error = apiErrorSchema.parse(await connectToken.json());
    expect(error.error.code).toBe("provider_error");
    expect(error.error.message).toContain("Pluggy");
  });
});

/* -------------------------------------------------------------------------- */
/* Conexões                                                                   */
/* -------------------------------------------------------------------------- */

describe("conexões", () => {
  it("POST demo cria as 3 conexões e GET lista com instituição", async () => {
    const { cookie } = await setupUser();

    const empty = await getJson(
      "/api/connections",
      cookie,
      z.object({ data: z.array(connectionSchema) }),
    );
    expect(empty.data).toEqual([]);

    const created = await sendJson("POST", "/api/connections", cookie, { provider: "demo" });
    expect(created.status).toBe(201);
    const createdBody = connectionEnvelope.parse(await created.json());
    expect(createdBody.data).toMatchObject({
      provider: "demo",
      externalId: "demo-conn-banco-aurora",
      status: "active",
      statusDetail: null,
      lastSyncedAt: null,
      institution: { name: "Banco Aurora", provider: "demo" },
    });

    const list = await getJson(
      "/api/connections",
      cookie,
      z.object({ data: z.array(connectionSchema) }),
    );
    expect(list.data).toHaveLength(3);
    expect(list.data.every((connection) => connection.provider === "demo")).toBe(true);
    expect(list.data.every((connection) => connection.institution !== null)).toBe(true);
    expect(list.data.map((connection) => connection.institution?.name).sort()).toEqual([
      "Banco Aurora",
      "Cooperativa Horizonte",
      "Nuvem Bank",
    ]);
    expect(list.data.map((connection) => connection.id)).toContain(createdBody.data.id);

    // Idempotente: repetir o POST não duplica conexões.
    const again = await sendJson("POST", "/api/connections", cookie, { provider: "demo" });
    expect(again.status).toBe(201);
    const listAgain = await getJson(
      "/api/connections",
      cookie,
      z.object({ data: z.array(connectionSchema) }),
    );
    expect(listAgain.data).toHaveLength(3);
  });

  it("DELETE remove a conexão e os dados em cascade", async () => {
    const { userId, cookie } = await setupUser();
    await sendJson("POST", "/api/connections", cookie, { provider: "demo" });

    const list = await getJson(
      "/api/connections",
      cookie,
      z.object({ data: z.array(connectionSchema) }),
    );
    const aurora = findOrThrow(
      list.data,
      (connection) => connection.institution?.name === "Banco Aurora",
      "conexão Aurora",
    );

    const card = await createAccount({
      userId,
      connectionId: aurora.id,
      type: "credit_card",
      name: "Cartão Aurora",
      externalId: "cascade-card",
      balanceCents: 10_000,
    });
    await createCreditCard({ accountId: card.id, brand: "VISA" });
    const bill = await createBill({
      accountId: card.id,
      externalId: "cascade-bill",
      dueDate: addDays(todayIsoDate(), 10),
      totalCents: 10_000,
    });
    await createTransaction({
      userId,
      connectionId: aurora.id,
      accountId: card.id,
      externalId: "cascade-tx",
      date: addDays(todayIsoDate(), -5),
      description: "COMPRA CASCADE",
      amountCents: -10_000,
      billId: bill.id,
    });
    await createBalanceSnapshot({
      accountId: card.id,
      date: addDays(todayIsoDate(), -1),
      balanceCents: 10_000,
    });
    await createInvestment({
      userId,
      connectionId: aurora.id,
      externalId: "cascade-inv",
      name: "CDB Cascade",
      balanceCents: 1_000,
    });

    const removed = await authedRequest(`/api/connections/${aurora.id}`, cookie, {
      method: "DELETE",
    });
    expect(removed.status).toBe(200);
    expect(okResponse.parse(await removed.json())).toEqual({ ok: true });

    const remaining = await getJson(
      "/api/connections",
      cookie,
      z.object({ data: z.array(connectionSchema) }),
    );
    expect(remaining.data).toHaveLength(2);
    expect(remaining.data.map((connection) => connection.id)).not.toContain(aurora.id);

    expect(
      await db.select().from(accounts).where(eq(accounts.connectionId, aurora.id)),
    ).toHaveLength(0);
    expect(await db.select().from(bills).where(eq(bills.accountId, card.id))).toHaveLength(0);
    expect(
      await db.select().from(creditCards).where(eq(creditCards.accountId, card.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(balanceSnapshots).where(eq(balanceSnapshots.accountId, card.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(transactions).where(eq(transactions.connectionId, aurora.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(investments).where(eq(investments.connectionId, aurora.id)),
    ).toHaveLength(0);
    expect(await db.select().from(connections).where(eq(connections.id, aurora.id))).toHaveLength(
      0,
    );
  });

  it("Pluggy sem provider configurado responde 502 e DELETE inexistente responde 404", async () => {
    const { cookie } = await setupUser();

    const pluggy = await sendJson("POST", "/api/connections", cookie, {
      provider: "pluggy",
      itemId: "pluggy-item-123",
    });
    expect(pluggy.status).toBe(502);
    expect(apiErrorSchema.parse(await pluggy.json()).error.code).toBe("provider_error");

    const missingItem = await sendJson("POST", "/api/connections", cookie, { provider: "pluggy" });
    expect(missingItem.status).toBe(400);
    expect(apiErrorSchema.parse(await missingItem.json()).error.code).toBe("validation_error");

    const missing = await authedRequest(
      "/api/connections/00000000-0000-4000-8000-000000000000",
      cookie,
      { method: "DELETE" },
    );
    expect(missing.status).toBe(404);
    expect(apiErrorSchema.parse(await missing.json()).error.code).toBe("not_found");
  });
});
