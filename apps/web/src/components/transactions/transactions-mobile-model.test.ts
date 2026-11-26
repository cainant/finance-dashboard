import type { Account, Category, Transaction } from "@fd/contracts";
import { describe, expect, it } from "vitest";

import {
  activeFilterChips,
  activeQuickKind,
  buildMobileListItems,
  hasSheetFilters,
  quickKindPatch,
  type QuickKind,
} from "./transactions-mobile-model";

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    userId: "u1",
    accountId: "a1",
    connectionId: "c1",
    externalId: "ext-1",
    date: "2026-11-05",
    description: "Compra",
    amountCents: -1000,
    currency: "BRL",
    type: "expense",
    categoryId: "cat",
    status: "posted",
    billId: null,
    merchant: null,
    notes: null,
    installmentNumber: null,
    totalInstallments: null,
    budgetGroupId: null,
    createdAt: "2026-11-05T12:00:00.000Z",
    updatedAt: "2026-11-05T12:00:00.000Z",
    ...overrides,
  };
}

describe("chips rápidos ↔ search params", () => {
  it("cada chip liga o próprio filtro e desliga os outros", () => {
    expect(quickKindPatch("expense")).toEqual({
      type: "expense",
      uncategorized: undefined,
      pending: undefined,
    });
    expect(quickKindPatch("income")).toMatchObject({ type: "income" });
    expect(quickKindPatch("pending")).toEqual({
      type: undefined,
      uncategorized: undefined,
      pending: true,
    });
    expect(quickKindPatch("all")).toEqual({
      type: undefined,
      uncategorized: undefined,
      pending: undefined,
    });
  });

  it("'Sem categoria' solta a categoria específica (a rota não aceita as duas)", () => {
    expect(quickKindPatch("uncategorized")).toEqual({
      type: undefined,
      uncategorized: true,
      pending: undefined,
      categoryId: undefined,
    });
  });

  it("o chip ativo vem dos search params (e volta nos dois sentidos)", () => {
    expect(activeQuickKind({})).toBe("all");
    for (const kind of ["expense", "income", "uncategorized", "pending"] as QuickKind[]) {
      expect(activeQuickKind({ ...quickKindPatch(kind) })).toBe(kind);
    }
  });

  it("combinação vinda da URL não marca nenhum chip", () => {
    expect(activeQuickKind({ type: "expense", uncategorized: true })).toBe("mixed");
    expect(activeQuickKind({ type: "transfer" })).toBe("mixed");
    expect(activeQuickKind({ uncategorized: true, pending: true })).toBe("mixed");
  });
});

describe("activeFilterChips", () => {
  const accounts = [{ id: "a1", name: "Conta Corrente" }] as unknown as Account[];
  const categories = [{ id: "c1", name: "Mercado", color: "#f59e0b" }] as unknown as Category[];

  it("lista conta e categoria como chips removíveis", () => {
    const chips = activeFilterChips({ accountId: "a1", categoryId: "c1" }, accounts, categories);

    expect(chips.map((chip) => [chip.key, chip.label])).toEqual([
      ["account", "Conta Corrente"],
      ["category", "Mercado"],
    ]);
    expect(chips[0]!.clear).toEqual({ accountId: undefined });
    expect(chips[1]!.color).toBe("#f59e0b");
  });

  it("o chip rápido ativo não vira chip removível", () => {
    expect(activeFilterChips({ type: "expense" }, accounts, categories)).toEqual([]);
  });

  it("combinações (mixed) viram um chip por parâmetro", () => {
    const chips = activeFilterChips({ type: "expense", pending: true }, accounts, categories);

    expect(chips.map((chip) => chip.key)).toEqual(["type", "pending"]);
    expect(chips[0]!.clear).toEqual({ type: undefined });
  });

  it("usa um rótulo genérico quando a conta ainda não carregou", () => {
    expect(activeFilterChips({ accountId: "x" }, [], [])[0]!.label).toBe("Conta");
  });
});

describe("hasSheetFilters", () => {
  it("indica filtro ativo do sheet (conta, categoria ou ordenação)", () => {
    expect(hasSheetFilters({})).toBe(false);
    expect(hasSheetFilters({ type: "expense" })).toBe(false);
    expect(hasSheetFilters({ accountId: "a1" })).toBe(true);
    expect(hasSheetFilters({ categoryId: "c1" })).toBe(true);
    expect(hasSheetFilters({ uncategorized: true })).toBe(true);
    expect(hasSheetFilters({ sort: "amount_desc" })).toBe(true);
  });
});

describe("buildMobileListItems", () => {
  it("agrupa por dia com o saldo do dia (só efetivadas de entrada/saída)", () => {
    const items = buildMobileListItems(
      [
        transaction({ id: "a", date: "2026-11-05", amountCents: -1000 }),
        transaction({ id: "b", date: "2026-11-05", amountCents: 5000, type: "income" }),
        transaction({ id: "c", date: "2026-11-05", amountCents: -999, status: "pending" }),
        transaction({ id: "d", date: "2026-11-05", amountCents: -777, type: "transfer" }),
        transaction({ id: "e", date: "2026-11-04", amountCents: -200 }),
      ],
      { grouped: true, hasMore: false },
    );

    expect(items.map((item) => item.key)).toEqual([
      "day:2026-11-05",
      "tx:a",
      "tx:b",
      "tx:c",
      "tx:d",
      "day:2026-11-04",
      "tx:e",
    ]);
    expect(items[0]).toMatchObject({ kind: "day", totalCents: 4000 });
    expect(items[5]).toMatchObject({ kind: "day", totalCents: -200 });
  });

  it("não afirma total do último dia enquanto há lotes por carregar", () => {
    const items = buildMobileListItems(
      [
        transaction({ id: "a", date: "2026-11-05" }),
        transaction({ id: "b", date: "2026-11-04", amountCents: -300 }),
      ],
      { grouped: true, hasMore: true },
    );

    // O dia anterior ao último já está completo; o último pode receber mais.
    expect(items.find((item) => item.key === "day:2026-11-05")).toMatchObject({
      totalCents: -1000,
    });
    expect(items.find((item) => item.key === "day:2026-11-04")).toMatchObject({
      totalCents: null,
    });
  });

  it("dia só com pendentes ou transferências fica sem total", () => {
    const items = buildMobileListItems([transaction({ status: "pending" })], {
      grouped: true,
      hasMore: false,
    });

    expect(items[0]).toMatchObject({ kind: "day", totalCents: null });
  });

  it("sem agrupamento (ordenação por valor) não há cabeçalhos", () => {
    const items = buildMobileListItems(
      [transaction({ id: "a" }), transaction({ id: "b", date: "2026-11-01" })],
      { grouped: false, hasMore: false },
    );

    expect(items.every((item) => item.kind === "transaction")).toBe(true);
  });
});
