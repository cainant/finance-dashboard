/**
 * Metas por grupo: `GET/PUT /api/budget`, `PUT /api/budget/categories/:id` e a
 * exceção por transação em `PATCH /api/transactions/:id`.
 */
import {
  apiErrorSchema,
  budgetProgressResponse,
  budgetResponse,
  transactionSchema,
  type Budget,
} from "@fd/contracts";
import { categories, transactions } from "@fd/database/schema";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { defaultGroupId } from "../src/domain/budget";
import {
  createAccount,
  createCategory,
  createConnection,
  createInstitution,
  createTransaction,
} from "./fixtures";
import { authedRequest, createSessionCookie, createTestUser, db, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

async function setupUser(): Promise<{ userId: string; cookie: string }> {
  const user = await createTestUser();
  const { cookie } = await createSessionCookie(user.id);
  return { userId: user.id, cookie };
}

function send(method: "PUT" | "PATCH", path: string, cookie: string, body: unknown) {
  return authedRequest(path, cookie, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readBudget(response: Response): Promise<Budget> {
  expect(response.status).toBe(200);
  return budgetResponse.parse(await response.json()).data;
}

async function getBudget(cookie: string): Promise<Budget> {
  return readBudget(await authedRequest("/api/budget", cookie));
}

async function insertSystemCategory(id: string, name: string): Promise<void> {
  await db.insert(categories).values({
    id,
    userId: null,
    name,
    slug: id.replace(/^cat_/, ""),
    icon: "Circle",
    color: "#71717a",
    kind: "expense",
    parentId: null,
  });
}

async function setupTransaction(userId: string) {
  const institution = await createInstitution({ provider: "demo", name: "Banco Aurora" });
  const connection = await createConnection({
    userId,
    provider: "demo",
    institutionId: institution.id,
  });
  const account = await createAccount({
    userId,
    connectionId: connection.id,
    type: "credit_card",
    balanceCents: 0,
  });
  return createTransaction({
    userId,
    accountId: account.id,
    connectionId: connection.id,
    date: "2026-11-10",
    description: "Livraria",
    amountCents: -12_000,
  });
}

describe("GET /api/budget", () => {
  it("exige sessão", async () => {
    const response = await authedRequest("/api/budget", "fd_session=invalido");
    expect(response.status).toBe(401);
  });

  it("cria os 6 grupos padrão (100%) e vincula as categorias de sistema existentes", async () => {
    await insertSystemCategory("cat_mercado", "Mercado");
    await insertSystemCategory("cat_educacao", "Educação");
    const { userId, cookie } = await setupUser();

    const budget = await getBudget(cookie);

    expect(budget.referenceIncomeCents).toBeNull();
    expect(budget.groups.map((group) => [group.name, group.targetBps])).toEqual([
      ["Liberdade Financeira", 2500],
      ["Custos Fixos", 3000],
      ["Conforto", 1500],
      ["Metas", 1500],
      ["Prazeres", 1500],
      ["Conhecimento", 0],
    ]);
    expect(budget.groups.map((group) => group.position)).toEqual([0, 1, 2, 3, 4, 5]);
    // Categorias de sistema ausentes no banco (ex.: cat_moradia) não quebram a FK.
    expect(
      [...budget.categoryGroups].sort((a, b) => a.categoryId.localeCompare(b.categoryId)),
    ).toEqual([
      { categoryId: "cat_educacao", groupId: defaultGroupId(userId, "conhecimento") },
      { categoryId: "cat_mercado", groupId: defaultGroupId(userId, "custos-fixos") },
    ]);
  });

  it("é idempotente e isola usuários", async () => {
    const first = await setupUser();
    const second = await setupUser();

    await getBudget(first.cookie);
    const again = await getBudget(first.cookie);
    const other = await getBudget(second.cookie);

    expect(again.groups).toHaveLength(6);
    expect(other.groups).toHaveLength(6);
    expect(other.groups.every((group) => group.id.startsWith(second.userId))).toBe(true);
  });
});

describe("PUT /api/budget", () => {
  it("salva a renda de referência e limpa com null", async () => {
    const { cookie } = await setupUser();

    const saved = await readBudget(
      await send("PUT", "/api/budget", cookie, { referenceIncomeCents: 650_000 }),
    );
    expect(saved.referenceIncomeCents).toBe(650_000);
    expect((await getBudget(cookie)).referenceIncomeCents).toBe(650_000);

    const cleared = await readBudget(
      await send("PUT", "/api/budget", cookie, { referenceIncomeCents: null }),
    );
    expect(cleared.referenceIncomeCents).toBeNull();
  });

  it("renda de referência não vaza em /api/settings", async () => {
    const { cookie } = await setupUser();
    await send("PUT", "/api/budget", cookie, { referenceIncomeCents: 650_000 });

    const response = await authedRequest("/api/settings", cookie);
    const body = z.object({ data: z.record(z.string(), z.unknown()) }).parse(await response.json());
    expect(Object.keys(body.data).sort()).toEqual(["currency", "locale", "theme"]);
  });

  it("substitui a lista: atualiza, cria, reordena e remove", async () => {
    const { userId, cookie } = await setupUser();
    const initial = await getBudget(cookie);
    const [liberdade, custos] = initial.groups;
    if (!liberdade || !custos) throw new Error("grupos padrão ausentes");

    const saved = await readBudget(
      await send("PUT", "/api/budget", cookie, {
        groups: [
          { id: custos.id, name: "Essenciais", color: "#0a84ff", targetBps: 5000 },
          { name: "Viagens", color: "#14b8a6", targetBps: 1000 },
          { id: liberdade.id, name: liberdade.name, color: liberdade.color, targetBps: 4000 },
        ],
      }),
    );

    expect(saved.groups.map((group) => [group.name, group.targetBps, group.position])).toEqual([
      ["Essenciais", 5000, 0],
      ["Viagens", 1000, 1],
      ["Liberdade Financeira", 4000, 2],
    ]);
    expect(saved.groups[0]?.id).toBe(defaultGroupId(userId, "custos-fixos"));
  });

  it("remover um grupo desfaz vínculos de categoria e exceções de transação", async () => {
    await insertSystemCategory("cat_educacao", "Educação");
    const { userId, cookie } = await setupUser();
    const transaction = await setupTransaction(userId);
    const conhecimento = defaultGroupId(userId, "conhecimento");
    const initial = await getBudget(cookie);
    expect(initial.categoryGroups).toEqual([{ categoryId: "cat_educacao", groupId: conhecimento }]);
    await send("PATCH", `/api/transactions/${transaction.id}`, cookie, {
      budgetGroupId: conhecimento,
    });

    const saved = await readBudget(
      await send("PUT", "/api/budget", cookie, {
        groups: initial.groups
          .filter((group) => group.id !== conhecimento)
          .map(({ id, name, color, targetBps }) => ({ id, name, color, targetBps })),
      }),
    );

    expect(saved.groups).toHaveLength(5);
    expect(saved.categoryGroups).toEqual([]);
    const [row] = await db.select().from(transactions).where(eq(transactions.id, transaction.id));
    expect(row?.budgetGroupId).toBeNull();
  });

  it.each([
    [
      "metas acima de 100%",
      {
        groups: [
          { name: "A", color: "#000000", targetBps: 6000 },
          { name: "B", color: "#000000", targetBps: 4001 },
        ],
      },
    ],
    ["lista vazia", { groups: [] }],
    ["corpo vazio", {}],
    ["renda negativa", { referenceIncomeCents: -1 }],
    ["cor inválida", { groups: [{ name: "A", color: "azul", targetBps: 0 }] }],
    [
      "id repetido",
      {
        groups: [
          { id: "x", name: "A", color: "#000000", targetBps: 0 },
          { id: "x", name: "B", color: "#000000", targetBps: 0 },
        ],
      },
    ],
  ])("rejeita %s", async (_label, body) => {
    const { cookie } = await setupUser();
    const response = await send("PUT", "/api/budget", cookie, body);
    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("validation_error");
  });

  it("rejeita id de grupo de outro usuário sem alterar nada", async () => {
    const owner = await setupUser();
    const intruder = await setupUser();
    const ownerGroups = (await getBudget(owner.cookie)).groups;
    const before = await getBudget(intruder.cookie);

    const response = await send("PUT", "/api/budget", intruder.cookie, {
      referenceIncomeCents: 100,
      groups: [{ id: ownerGroups[0]?.id, name: "Roubado", color: "#000000", targetBps: 0 }],
    });

    expect(response.status).toBe(400);
    expect(await getBudget(intruder.cookie)).toEqual(before);
    expect((await getBudget(owner.cookie)).groups).toEqual(ownerGroups);
  });
});

describe("PUT /api/budget/categories/:categoryId", () => {
  it("vincula, troca e desvincula uma categoria do usuário", async () => {
    const { userId, cookie } = await setupUser();
    const category = await createCategory({ userId, name: "Cursos", kind: "expense" });
    const conhecimento = defaultGroupId(userId, "conhecimento");
    const prazeres = defaultGroupId(userId, "prazeres");
    await getBudget(cookie);

    const linked = await readBudget(
      await send("PUT", `/api/budget/categories/${category.id}`, cookie, {
        groupId: conhecimento,
      }),
    );
    expect(linked.categoryGroups).toEqual([{ categoryId: category.id, groupId: conhecimento }]);

    const moved = await readBudget(
      await send("PUT", `/api/budget/categories/${category.id}`, cookie, { groupId: prazeres }),
    );
    expect(moved.categoryGroups).toEqual([{ categoryId: category.id, groupId: prazeres }]);

    const unlinked = await readBudget(
      await send("PUT", `/api/budget/categories/${category.id}`, cookie, { groupId: null }),
    );
    expect(unlinked.categoryGroups).toEqual([]);
  });

  it("404 para categoria de outro usuário e 400 para grupo de outro usuário", async () => {
    const owner = await setupUser();
    const intruder = await setupUser();
    const category = await createCategory({
      userId: owner.userId,
      name: "Cursos",
      kind: "expense",
    });
    const intruderCategory = await createCategory({
      userId: intruder.userId,
      name: "Livros",
      kind: "expense",
    });
    await getBudget(owner.cookie);
    await getBudget(intruder.cookie);

    const foreignCategory = await send(
      "PUT",
      `/api/budget/categories/${category.id}`,
      intruder.cookie,
      { groupId: defaultGroupId(intruder.userId, "conforto") },
    );
    expect(foreignCategory.status).toBe(404);

    const foreignGroup = await send(
      "PUT",
      `/api/budget/categories/${intruderCategory.id}`,
      intruder.cookie,
      { groupId: defaultGroupId(owner.userId, "conforto") },
    );
    expect(foreignGroup.status).toBe(400);
  });
});

describe("PATCH /api/transactions/:id com budgetGroupId", () => {
  it("define e remove a exceção e expõe parcelas no DTO", async () => {
    const { userId, cookie } = await setupUser();
    const transaction = await setupTransaction(userId);
    await db
      .update(transactions)
      .set({ installmentNumber: 3, totalInstallments: 10 })
      .where(eq(transactions.id, transaction.id));
    await getBudget(cookie);
    const metas = defaultGroupId(userId, "metas");

    const response = await send("PATCH", `/api/transactions/${transaction.id}`, cookie, {
      budgetGroupId: metas,
    });
    expect(response.status).toBe(200);
    const patched = z.object({ data: transactionSchema }).parse(await response.json()).data;
    expect(patched).toMatchObject({
      budgetGroupId: metas,
      installmentNumber: 3,
      totalInstallments: 10,
    });

    const cleared = await send("PATCH", `/api/transactions/${transaction.id}`, cookie, {
      budgetGroupId: null,
    });
    expect(
      z.object({ data: transactionSchema }).parse(await cleared.json()).data.budgetGroupId,
    ).toBe(null);
  });

  it("rejeita grupo de outro usuário", async () => {
    const owner = await setupUser();
    const { userId, cookie } = await setupUser();
    const transaction = await setupTransaction(userId);
    await getBudget(owner.cookie);

    const response = await send("PATCH", `/api/transactions/${transaction.id}`, cookie, {
      budgetGroupId: defaultGroupId(owner.userId, "metas"),
    });
    expect(response.status).toBe(400);
  });
});

describe("GET /api/budget/progress", () => {
  async function setupLedger() {
    const { userId, cookie } = await setupUser();
    const institution = await createInstitution({ provider: "demo", name: "Banco Aurora" });
    const connection = await createConnection({
      userId,
      provider: "demo",
      institutionId: institution.id,
    });
    const account = await createAccount({
      userId,
      connectionId: connection.id,
      type: "credit_card",
      balanceCents: 0,
    });
    const groceries = await createCategory({ userId, name: "Feira", kind: "expense" });
    const books = await createCategory({ userId, name: "Livros", kind: "expense" });
    await getBudget(cookie);
    const fixed = defaultGroupId(userId, "custos-fixos");
    const knowledge = defaultGroupId(userId, "conhecimento");
    const freedom = defaultGroupId(userId, "liberdade-financeira");
    await send("PUT", `/api/budget/categories/${groceries.id}`, cookie, { groupId: fixed });

    const add = (
      date: string,
      amountCents: number,
      extra: Partial<Parameters<typeof createTransaction>[0]> = {},
    ) =>
      createTransaction({
        userId,
        accountId: account.id,
        connectionId: connection.id,
        date,
        description: `t ${date} ${amountCents}`,
        amountCents,
        ...extra,
      });

    return { userId, cookie, add, groceries, books, fixed, knowledge, freedom };
  }

  async function readProgress(cookie: string, month: string) {
    const response = await authedRequest(`/api/budget/progress?month=${month}`, cookie);
    expect(response.status).toBe(200);
    return budgetProgressResponse.parse(await response.json()).data;
  }

  it("soma por grupo efetivo: categoria, exceção e sem grupo", async () => {
    const { cookie, add, groceries, books, fixed, knowledge, freedom } = await setupLedger();
    await send("PUT", "/api/budget", cookie, { referenceIncomeCents: 650_000 });

    await add("2026-11-01", -10_000, { categoryId: groceries.id });
    await add("2026-11-30", -5_000, { categoryId: groceries.id, status: "pending" });
    const override = await add("2026-11-15", -3_000, { categoryId: groceries.id });
    await db
      .update(transactions)
      .set({ budgetGroupId: knowledge })
      .where(eq(transactions.id, override.id));
    await add("2026-11-10", -2_500, { categoryId: books.id });
    await add("2026-11-11", -700);
    // Aplicação atribuída à mão entra; transferência sem grupo e receita não.
    const investment = await add("2026-11-05", -50_000, { type: "transfer" });
    await db
      .update(transactions)
      .set({ budgetGroupId: freedom })
      .where(eq(transactions.id, investment.id));
    await add("2026-11-06", -80_000, { type: "transfer" });
    await add("2026-11-07", 900_000, { categoryId: groceries.id });
    // Fora do mês.
    await add("2026-10-31", -1_000, { categoryId: groceries.id });
    await add("2026-12-01", -1_000, { categoryId: groceries.id });

    const progress = await readProgress(cookie, "2026-11");

    expect(progress).toMatchObject({ month: "2026-11", from: "2026-11-01", to: "2026-11-30" });
    const byId = new Map(progress.groups.map((group) => [group.groupId, group]));
    expect(byId.get(fixed)).toEqual({
      groupId: fixed,
      targetCents: 195_000,
      spentCents: 15_000,
      transactionCount: 2,
    });
    expect(byId.get(knowledge)).toMatchObject({ targetCents: 0, spentCents: 3_000 });
    expect(byId.get(freedom)).toMatchObject({ targetCents: 162_500, spentCents: 50_000 });
    expect(progress.unassigned).toEqual({ spentCents: 3_200, transactionCount: 2 });
    expect(progress.groups).toHaveLength(6);
  });

  it("sem renda a meta em R$ é null; fevereiro termina no dia certo", async () => {
    const { cookie, add, groceries, fixed } = await setupLedger();
    await add("2028-02-29", -1_234, { categoryId: groceries.id });

    const progress = await readProgress(cookie, "2028-02");

    expect(progress.to).toBe("2028-02-29");
    expect(progress.referenceIncomeCents).toBeNull();
    expect(progress.groups.find((group) => group.groupId === fixed)).toMatchObject({
      targetCents: null,
      spentCents: 1_234,
    });
  });

  it("não mistura usuários", async () => {
    const { add, groceries } = await setupLedger();
    await add("2026-11-02", -9_999, { categoryId: groceries.id });
    const other = await setupUser();

    const progress = await readProgress(other.cookie, "2026-11");

    expect(progress.groups.every((group) => group.spentCents === 0)).toBe(true);
    expect(progress.unassigned.spentCents).toBe(0);
  });

  it.each(["2026-13", "2026-1", "novembro"])("rejeita month=%s", async (month) => {
    const { cookie } = await setupUser();
    const response = await authedRequest(`/api/budget/progress?month=${month}`, cookie);
    expect(response.status).toBe(400);
  });
});
