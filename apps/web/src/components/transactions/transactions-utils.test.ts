import type { Transaction } from "@fd/contracts";
import { describe, expect, it } from "vitest";

import {
  buildTransactionsListItems,
  formatTransactionsCount,
  resolveTransactionPanel,
  summarizeCategories,
  withUncategorizedFilter,
} from "./transactions-utils";

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    userId: "u1",
    accountId: "a1",
    connectionId: "c1",
    externalId: "ext-1",
    date: "2026-11-05",
    description: "Compra no mercado",
    amountCents: -12345,
    currency: "BRL",
    type: "expense",
    categoryId: "cat_mercado",
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

describe("formatTransactionsCount", () => {
  it("mostra 'carregados de total' quando o agregado já chegou", () => {
    expect(formatTransactionsCount(50, 760)).toBe("50 de 760 lançamentos");
  });

  it("mostra só o total quando a lista está completa", () => {
    expect(formatTransactionsCount(760, 760)).toBe("760 lançamentos");
    expect(formatTransactionsCount(1, 1)).toBe("1 lançamento");
  });

  it("não inventa total antes (ou depois de falhar) o resumo", () => {
    expect(formatTransactionsCount(50, undefined)).toBe("50 lançamentos carregados");
    expect(formatTransactionsCount(1, undefined)).toBe("1 lançamento carregado");
  });
});

describe("buildTransactionsListItems", () => {
  const transactions = [
    transaction({ id: "a", date: "2026-11-05" }),
    transaction({ id: "b", date: "2026-11-05" }),
    transaction({ id: "c", date: "2026-11-04" }),
  ];

  it("insere um cabeçalho por dia e depois as transações do dia", () => {
    const items = buildTransactionsListItems(transactions, true);

    expect(items.map((item) => item.key)).toEqual([
      "day:2026-11-05",
      "tx:a",
      "tx:b",
      "day:2026-11-04",
      "tx:c",
    ]);
    expect(items[0]).toMatchObject({ kind: "day", date: "2026-11-05" });
    expect(items[1]).toMatchObject({ kind: "transaction", transaction: { id: "a" } });
  });

  it("sem agrupamento mantém só as transações (data inline na linha)", () => {
    const items = buildTransactionsListItems(transactions, false);

    expect(items.map((item) => item.kind)).toEqual(["transaction", "transaction", "transaction"]);
  });
});

describe("summarizeCategories", () => {
  it("conta por categoria e separa as sem categoria", () => {
    const usage = summarizeCategories([
      transaction({ id: "1", categoryId: "cat_mercado" }),
      transaction({ id: "2", categoryId: "cat_mercado" }),
      transaction({ id: "3", categoryId: null }),
      transaction({ id: "4", categoryId: "cat_lazer" }),
    ]);

    expect(usage.byCategory.get("cat_mercado")).toBe(2);
    expect(usage.byCategory.get("cat_lazer")).toBe(1);
    expect(usage.uncategorizedCount).toBe(1);
  });
});

describe("resolveTransactionPanel", () => {
  const transactions = [
    transaction({ id: "a" }),
    transaction({ id: "b" }),
    transaction({ id: "c" }),
  ];

  it("resolve a transação aberta e os vizinhos da lista carregada", () => {
    const panel = resolveTransactionPanel(transactions, "b");

    expect(panel.transaction?.id).toBe("b");
    expect(panel.previous?.id).toBe("a");
    expect(panel.next?.id).toBe("c");
  });

  it("não inventa vizinho nas pontas", () => {
    expect(resolveTransactionPanel(transactions, "a").previous).toBeUndefined();
    expect(resolveTransactionPanel(transactions, "c").next).toBeUndefined();
  });

  it("sem `tx` na URL o painel fica fechado", () => {
    expect(resolveTransactionPanel(transactions, undefined)).toEqual({
      transaction: null,
      previous: undefined,
      next: undefined,
    });
  });

  it("id fora do recorte carregado não abre o painel", () => {
    expect(resolveTransactionPanel(transactions, "zzz").transaction).toBeNull();
    expect(resolveTransactionPanel([], "a").transaction).toBeNull();
  });
});

describe("withUncategorizedFilter", () => {
  const filters = { from: "2026-11-01", to: "2026-11-30", sort: "date_desc" } as const;

  it("só acrescenta o parâmetro quando ligado", () => {
    expect(withUncategorizedFilter(filters, false)).toEqual(filters);
    expect(withUncategorizedFilter(filters, undefined)).toEqual(filters);
    expect(withUncategorizedFilter(filters, true)).toEqual({ ...filters, uncategorized: true });
  });
});
