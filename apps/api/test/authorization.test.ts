/**
 * Testes de autorização: nenhum usuário enxerga (nem altera) dados de outro.
 *
 * Cada teste cria dois usuários completos (A e B) e verifica detalhes, listas,
 * mutações, faturas, conexões, investimentos e agregações.
 */
import {
  accountsResponse,
  addDays,
  apiErrorSchema,
  billsResponse,
  categoriesResponse,
  categoryBreakdownResponse,
  connectionSchema,
  creditCardsResponse,
  DEFAULT_SETTINGS,
  investmentsResponse,
  okResponse,
  overviewResponse,
  settingsResponse,
  todayIsoDate,
  transactionsResponse,
  transactionsSummaryResponse,
  upcomingBillsResponse,
} from "@fd/contracts";
import type {
  Account as AccountRow,
  Bill as BillRow,
  Category as CategoryRow,
  Connection as ConnectionRow,
  CreditCard as CreditCardRow,
  Institution as InstitutionRow,
  Investment as InvestmentRow,
  Transaction as TransactionRow,
} from "@fd/database";
import { connections } from "@fd/database/schema";
import { SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createAccount,
  createBill,
  createCategory,
  createConnection,
  createCreditCard,
  createInstitution,
  createInvestment,
  createTransaction,
  readTransaction,
} from "./fixtures";
import {
  authedRequest,
  BASE_URL,
  createSessionCookie,
  createTestUser,
  db,
  resetDatabase,
} from "./helpers";

const ALL_TIME = { from: "2020-01-01", to: "2099-12-31" } as const;

const connectionsEnvelope = z.object({ data: z.array(connectionSchema) });

interface OwnerData {
  institution: InstitutionRow;
  connection: ConnectionRow;
  checking: AccountRow;
  card: AccountRow;
  cardMeta: CreditCardRow;
  bill: BillRow;
  category: CategoryRow;
  expense: TransactionRow;
  income: TransactionRow;
  billCharge: TransactionRow;
  investment: InvestmentRow;
}

interface SeedOwnerOptions {
  prefix: string;
  bankName: string;
  incomeCents?: number;
  expenseCents?: number;
  investmentCents?: number;
}

async function seedOwner(userId: string, options: SeedOwnerOptions): Promise<OwnerData> {
  const today = todayIsoDate();
  const incomeCents = options.incomeCents ?? 400_000;
  const expenseCents = options.expenseCents ?? 7_000;
  const investmentCents = options.investmentCents ?? 300_000;

  const institution = await createInstitution({
    provider: "demo",
    externalId: `${options.prefix}-inst`,
    name: options.bankName,
  });
  const connection = await createConnection({
    userId,
    provider: "demo",
    externalId: `${options.prefix}-conn`,
    institutionId: institution.id,
  });
  const checking = await createAccount({
    userId,
    connectionId: connection.id,
    externalId: `${options.prefix}-checking`,
    name: `Conta ${options.bankName}`,
    balanceCents: 500_000,
    availableCents: 480_000,
    numberMasked: "0001",
  });
  const card = await createAccount({
    userId,
    connectionId: connection.id,
    type: "credit_card",
    externalId: `${options.prefix}-card`,
    name: `Cartão ${options.bankName}`,
    balanceCents: 120_000,
    numberMasked: "1234",
  });
  const cardMeta = await createCreditCard({
    accountId: card.id,
    brand: "VISA",
    limitCents: 1_000_000,
    availableLimitCents: 880_000,
    closingDay: 20,
    dueDay: 28,
  });
  const bill = await createBill({
    accountId: card.id,
    externalId: `${options.prefix}-bill`,
    dueDate: addDays(today, 10),
    closingDate: addDays(today, 2),
    totalCents: 120_000,
    minimumPaymentCents: 12_000,
    status: "open",
  });
  const category = await createCategory({
    userId,
    name: `Compras ${options.bankName}`,
    slug: `${options.prefix}-compras`,
    kind: "expense",
    icon: "ShoppingCart",
    color: "#22c55e",
  });

  const expense = await createTransaction({
    userId,
    connectionId: connection.id,
    accountId: checking.id,
    externalId: `${options.prefix}-expense`,
    date: addDays(today, -10),
    description: `COMPRA ${options.bankName}`,
    merchant: `Loja ${options.bankName}`,
    amountCents: -expenseCents,
    type: "expense",
    categoryId: category.id,
  });
  const income = await createTransaction({
    userId,
    connectionId: connection.id,
    accountId: checking.id,
    externalId: `${options.prefix}-income`,
    date: addDays(today, -8),
    description: `SALARIO ${options.bankName}`,
    amountCents: incomeCents,
    type: "income",
  });
  const billCharge = await createTransaction({
    userId,
    connectionId: connection.id,
    accountId: card.id,
    externalId: `${options.prefix}-bill-charge`,
    date: addDays(today, -5),
    description: `FATURA ${options.bankName}`,
    amountCents: -3_000,
    type: "expense",
    billId: bill.id,
  });
  const investment = await createInvestment({
    userId,
    connectionId: connection.id,
    externalId: `${options.prefix}-inv`,
    name: `CDB ${options.bankName}`,
    balanceCents: investmentCents,
    amountProfitCents: 10_000,
  });

  return {
    institution,
    connection,
    checking,
    card,
    cardMeta,
    bill,
    category,
    expense,
    income,
    billCharge,
    investment,
  };
}

interface AuthzContext {
  cookieA: string;
  cookieB: string;
  a: OwnerData;
  b: OwnerData;
  systemCategory: CategoryRow;
}

async function seedContext(): Promise<AuthzContext> {
  const userA = await createTestUser({ email: "usuario-a@example.com" });
  const userB = await createTestUser({ email: "usuario-b@example.com" });
  const { cookie: cookieA } = await createSessionCookie(userA.id);
  const { cookie: cookieB } = await createSessionCookie(userB.id);

  const systemCategory = await createCategory({
    userId: null,
    name: "Mercado",
    slug: "mercado",
    kind: "expense",
    icon: "ShoppingCart",
    color: "#22c55e",
  });

  const a = await seedOwner(userA.id, {
    prefix: "a",
    bankName: "Banco Aurora",
    incomeCents: 900_000,
    expenseCents: 15_000,
    investmentCents: 700_000,
  });
  const b = await seedOwner(userB.id, {
    prefix: "b",
    bankName: "Nuvem Bank",
    incomeCents: 400_000,
    expenseCents: 7_000,
    investmentCents: 300_000,
  });

  return { cookieA, cookieB, a, b, systemCategory };
}

async function getJson<T>(
  path: string,
  cookie: string,
  parser: { parse(value: unknown): T },
): Promise<T> {
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

beforeEach(async () => {
  await resetDatabase();
});

describe("autorização por usuário", () => {
  it("B não acessa conta de A e só vê as próprias contas", async () => {
    const { cookieA, cookieB, a, b } = await seedContext();

    const detail = await authedRequest(`/api/accounts/${a.checking.id}`, cookieB);
    expect(detail.status).toBe(404);
    expect(apiErrorSchema.parse(await detail.json()).error.code).toBe("not_found");

    const crossDetail = await authedRequest(`/api/accounts/${b.checking.id}`, cookieA);
    expect(crossDetail.status).toBe(404);

    const listB = await getJson("/api/accounts", cookieB, accountsResponse);
    expect(listB.data.map((account) => account.id).sort()).toEqual(
      [b.checking.id, b.card.id].sort(),
    );
    expect(listB.data.every((account) => account.userId === b.checking.userId)).toBe(true);
    expect(listB.data.some((account) => account.id === a.checking.id)).toBe(false);

    const own = await authedRequest(`/api/accounts/${b.checking.id}`, cookieB);
    expect(own.status).toBe(200);

    const listA = await getJson("/api/accounts", cookieA, accountsResponse);
    expect(listA.data.map((account) => account.id).sort()).toEqual(
      [a.checking.id, a.card.id].sort(),
    );
  });

  it("B não lista nem altera transações de A", async () => {
    const { cookieB, a, b } = await seedContext();

    const listB = await getJson(
      `/api/transactions?from=${ALL_TIME.from}&to=${ALL_TIME.to}`,
      cookieB,
      transactionsResponse,
    );
    expect(listB.data.map((tx) => tx.id).sort()).toEqual(
      [b.expense.id, b.income.id, b.billCharge.id].sort(),
    );
    expect(listB.data.every((tx) => tx.userId === b.expense.userId)).toBe(true);
    expect(listB.data.some((tx) => tx.id === a.expense.id)).toBe(false);

    // O resumo agregado também é escopado por usuário.
    const summaryB = await getJson(
      `/api/transactions/summary?from=${ALL_TIME.from}&to=${ALL_TIME.to}`,
      cookieB,
      transactionsSummaryResponse,
    );
    expect(summaryB.totalCount).toBe(3);

    const filteredByAccountA = await getJson(
      `/api/transactions?from=${ALL_TIME.from}&to=${ALL_TIME.to}&accountId=${a.checking.id}`,
      cookieB,
      transactionsResponse,
    );
    expect(filteredByAccountA.data).toEqual([]);

    const patchNotes = await sendJson("PATCH", `/api/transactions/${a.expense.id}`, cookieB, {
      notes: "invasao",
    });
    expect(patchNotes.status).toBe(404);
    expect(apiErrorSchema.parse(await patchNotes.json()).error.code).toBe("not_found");

    const patchCategory = await sendJson("PATCH", `/api/transactions/${a.expense.id}`, cookieB, {
      categoryId: b.category.id,
    });
    expect(patchCategory.status).toBe(404);

    const untouched = await readTransaction(a.expense.id);
    expect(untouched?.notes).toBeNull();
    expect(untouched?.categoryId).toBe(a.category.id);
    expect(untouched?.categorySource).toBe("provider");

    // Categoria de A não pode ser aplicada nem na própria transação de B.
    const foreignCategory = await sendJson("PATCH", `/api/transactions/${b.expense.id}`, cookieB, {
      categoryId: a.category.id,
    });
    expect(foreignCategory.status).toBe(400);
    expect(apiErrorSchema.parse(await foreignCategory.json()).error.code).toBe("bad_request");
    expect((await readTransaction(b.expense.id))?.categoryId).toBe(b.category.id);

    const ownPatch = await sendJson("PATCH", `/api/transactions/${b.expense.id}`, cookieB, {
      notes: "minha nota",
    });
    expect(ownPatch.status).toBe(200);
    expect((await readTransaction(b.expense.id))?.notes).toBe("minha nota");
    expect((await readTransaction(a.expense.id))?.notes).toBeNull();
  });

  it("B não acessa faturas e cartões de A", async () => {
    const { cookieA, cookieB, a, b } = await seedContext();

    const upcoming = await getJson("/api/bills/upcoming?days=30", cookieB, upcomingBillsResponse);
    expect(upcoming.data.map((bill) => bill.id)).toEqual([b.bill.id]);
    expect(upcoming.data.some((bill) => bill.id === a.bill.id)).toBe(false);

    const billTransactions = await authedRequest(`/api/bills/${a.bill.id}/transactions`, cookieB);
    expect(billTransactions.status).toBe(404);

    const cardBills = await authedRequest(`/api/credit-cards/${a.card.id}/bills`, cookieB);
    expect(cardBills.status).toBe(404);

    const cardsB = await getJson("/api/credit-cards", cookieB, creditCardsResponse);
    expect(cardsB.data.map((card) => card.accountId)).toEqual([b.card.id]);
    expect(cardsB.data.some((card) => card.accountId === a.card.id)).toBe(false);

    const ownBillTransactions = await authedRequest(
      `/api/bills/${b.bill.id}/transactions`,
      cookieB,
    );
    expect(ownBillTransactions.status).toBe(200);

    // A continua enxergando as faturas do próprio cartão.
    const ownBills = await getJson(`/api/credit-cards/${a.card.id}/bills`, cookieA, billsResponse);
    expect(ownBills.data.map((bill) => bill.id)).toEqual([a.bill.id]);
  });

  it("B não lista nem remove conexões de A", async () => {
    const { cookieA, cookieB, a, b } = await seedContext();

    const list = await getJson("/api/connections", cookieB, connectionsEnvelope);
    expect(list.data.map((connection) => connection.id)).toEqual([b.connection.id]);
    expect(list.data.some((connection) => connection.id === a.connection.id)).toBe(false);

    const removed = await authedRequest(`/api/connections/${a.connection.id}`, cookieB, {
      method: "DELETE",
    });
    expect(removed.status).toBe(404);
    expect(apiErrorSchema.parse(await removed.json()).error.code).toBe("not_found");

    const stillThere = await db
      .select()
      .from(connections)
      .where(eq(connections.id, a.connection.id));
    expect(stillThere).toHaveLength(1);

    // B pode remover a própria conexão.
    const ownRemoved = await authedRequest(`/api/connections/${b.connection.id}`, cookieB, {
      method: "DELETE",
    });
    expect(ownRemoved.status).toBe(200);
    expect(okResponse.parse(await ownRemoved.json())).toEqual({ ok: true });

    const listAfter = await getJson("/api/connections", cookieA, connectionsEnvelope);
    expect(listAfter.data.map((connection) => connection.id)).toEqual([a.connection.id]);
  });

  it("B não vê investimentos, categorias pessoais nem settings de A", async () => {
    const { cookieA, cookieB, a, b, systemCategory } = await seedContext();

    const investmentsB = await getJson("/api/investments", cookieB, investmentsResponse);
    expect(investmentsB.data.map((investment) => investment.id)).toEqual([b.investment.id]);
    expect(investmentsB.data.some((investment) => investment.id === a.investment.id)).toBe(false);

    const categoriesB = await getJson("/api/categories", cookieB, categoriesResponse);
    expect(categoriesB.data.some((category) => category.id === a.category.id)).toBe(false);
    expect(categoriesB.data.some((category) => category.id === b.category.id)).toBe(true);
    // Categoria de sistema é compartilhada por todos.
    expect(categoriesB.data.some((category) => category.id === systemCategory.id)).toBe(true);

    // Settings: A muda o tema; B continua no default.
    const updated = await sendJson("PUT", "/api/settings", cookieA, { theme: "light" });
    expect(updated.status).toBe(200);
    expect(settingsResponse.parse(await updated.json()).data.theme).toBe("light");

    const settingsB = await getJson("/api/settings", cookieB, settingsResponse);
    expect(settingsB.data).toEqual(DEFAULT_SETTINGS);
  });

  it("agregações de B não somam dados de A", async () => {
    const { cookieB, a, b } = await seedContext();
    const today = todayIsoDate();
    const from = addDays(today, -40);

    const overview = await getJson(
      `/api/overview?from=${from}&to=${today}`,
      cookieB,
      overviewResponse,
    );
    expect(overview.kpis.income.currentCents).toBe(400_000);
    expect(overview.kpis.expenses.currentCents).toBe(10_000);
    expect(overview.kpis.result.currentCents).toBe(390_000);

    const breakdown = await getJson(
      `/api/analytics/categories?from=${from}&to=${today}&type=expense`,
      cookieB,
      categoryBreakdownResponse,
    );
    expect(breakdown.totalCents).toBe(10_000);
    expect(breakdown.data.some((item) => item.categoryId === a.category.id)).toBe(false);
    expect(breakdown.data.some((item) => item.categoryId === b.category.id)).toBe(true);
    expect(breakdown.data.reduce((sum, item) => sum + item.amountCents, 0)).toBe(10_000);
  });

  it("B não lê sync-runs de A", async () => {
    const { cookieB, a } = await seedContext();

    const response = await authedRequest(
      `/api/connections/${a.connection.id}/sync-runs?limit=10`,
      cookieB,
    );
    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("not_found");
  });

  it("não permite anexar o item Pluggy de outro usuário (IDOR)", async () => {
    const userA = await createTestUser({ email: "pluggy-a@example.com" });
    const userB = await createTestUser({ email: "pluggy-b@example.com" });
    const { cookie: cookieB } = await createSessionCookie(userB.id);

    await createConnection({
      userId: userA.id,
      provider: "pluggy",
      externalId: "item-de-outra-pessoa",
    });

    const response = await sendJson("POST", "/api/connections", cookieB, {
      provider: "pluggy",
      itemId: "item-de-outra-pessoa",
    });

    expect(response.status).toBe(409);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("conflict");
    expect(body.error.message).toContain("outro usuário");
    expect(
      await db.select().from(connections).where(eq(connections.userId, userB.id)),
    ).toHaveLength(0);
  });

  it("rotas protegidas exigem sessão", async () => {
    const paths = [
      "/api/accounts",
      "/api/transactions",
      "/api/transactions/uncategorized-count",
      "/api/transactions/summary",
      "/api/investments",
      "/api/overview",
    ];

    for (const path of paths) {
      const response = await SELF.fetch(`${BASE_URL}${path}`);
      expect(response.status).toBe(401);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe("unauthorized");
    }
  });
});
