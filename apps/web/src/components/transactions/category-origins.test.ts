import type { Category, Transaction } from "@fd/contracts";
import { describe, expect, it } from "vitest";

import { rememberOrigin, type CategoryOrigins } from "./category-origins";
import { isForeignCategory } from "./category-picker-options";

function category(overrides: Pick<Category, "id" | "name" | "kind"> & Partial<Category>): Category {
  return {
    userId: null,
    slug: overrides.id,
    icon: "Tag",
    color: "#8b8b8b",
    parentId: null,
    ...overrides,
  };
}

const mercado = category({ id: "cat_mercado", name: "Mercado", kind: "expense" });
const lazer = category({ id: "cat_lazer", name: "Lazer", kind: "expense" });
const transferencias = category({
  id: "cat_transferencias",
  name: "Transferências",
  kind: "transfer",
});
const categories = [mercado, lazer, transferencias];

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    userId: "u1",
    accountId: "a1",
    connectionId: "c1",
    externalId: "ext-1",
    date: "2026-11-05",
    description: "PIX ENVIADO - Fulano",
    amountCents: -12345,
    currency: "BRL",
    type: "expense",
    categoryId: transferencias.id,
    status: "posted",
    billId: null,
    merchant: null,
    notes: null,
    installmentNumber: null,
    totalInstallments: null,
    budgetGroupId: null,
    createdAt: "2026-11-05T12:00:00.000Z",
    updatedAt: "2026-11-05T12:00:00.000Z",
    category: transferencias,
    ...overrides,
  };
}

describe("rememberOrigin", () => {
  it("guarda a categoria de outra natureza da linha", () => {
    const origins = rememberOrigin(new Map(), transaction(), categories);

    expect(origins.get("t1")?.id).toBe(transferencias.id);
  });

  it("não guarda categoria de mesma natureza nem linha sem categoria", () => {
    const empty: CategoryOrigins = new Map();

    const sameKind = rememberOrigin(
      empty,
      transaction({ categoryId: mercado.id, category: mercado }),
      categories,
    );
    const semCategoria = rememberOrigin(
      empty,
      transaction({ categoryId: null, category: null }),
      categories,
    );

    expect(sameKind).toBe(empty);
    expect(semCategoria).toBe(empty);
  });

  it("resolve a categoria pela lista quando a transação não traz a embutida", () => {
    // Visão geral: a transação vem com `categoryId`, sem o objeto da categoria.
    const origins = rememberOrigin(
      new Map(),
      transaction({ category: undefined, categoryId: transferencias.id }),
      categories,
    );

    expect(origins.get("t1")?.id).toBe(transferencias.id);
  });

  it("a primeira origem vence: trocar duas vezes não sobrescreve", () => {
    const first = rememberOrigin(new Map(), transaction(), categories);

    const second = rememberOrigin(
      first,
      transaction({ categoryId: mercado.id, category: mercado }),
      categories,
    );
    const third = rememberOrigin(
      second,
      transaction({ categoryId: lazer.id, category: lazer }),
      categories,
    );

    expect(third.get("t1")?.id).toBe(transferencias.id);
    expect(third).toBe(second);
  });

  it("não mistura linhas diferentes", () => {
    const origins = rememberOrigin(new Map(), transaction({ id: "t1" }), categories);
    const both = rememberOrigin(
      origins,
      transaction({ id: "t2", categoryId: mercado.id, category: mercado }),
      categories,
    );

    expect([...both.keys()]).toEqual(["t1"]);
    expect(both.get("t1")?.id).toBe(transferencias.id);
  });
});

describe("isForeignCategory", () => {
  it("compara a natureza da categoria com a do lançamento", () => {
    expect(isForeignCategory(transferencias, "expense")).toBe(true);
    expect(isForeignCategory(transferencias, "transfer")).toBe(false);
    expect(isForeignCategory(mercado, "income")).toBe(true);
    expect(isForeignCategory(mercado, "expense")).toBe(false);
  });
});
