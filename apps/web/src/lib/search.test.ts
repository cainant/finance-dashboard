import { describe, expect, it } from "vitest";

import {
  accountsSearchSchema,
  closeTransactionPanel,
  hasActiveTransactionFilters,
  openTransactionPanel,
  transactionsSearchSchema,
} from "./search";

describe("transactionsSearchSchema", () => {
  it("omite o período padrão e a ordenação padrão da URL", () => {
    expect(transactionsSearchSchema.parse({})).toEqual({});
  });

  it("mantém filtros válidos", () => {
    expect(
      transactionsSearchSchema.parse({
        period: "90d",
        q: "  mercado  ",
        type: "expense",
        sort: "amount_desc",
      }),
    ).toEqual({
      period: "90d",
      q: "mercado",
      type: "expense",
      sort: "amount_desc",
    });
  });

  it("cai no padrão quando o filtro é inválido em vez de derrubar a navegação", () => {
    expect(
      transactionsSearchSchema.parse({
        period: "ontem",
        type: "qualquer",
        sort: "aleatorio",
      }),
    ).toEqual({});
  });

  it("exige from/to para período personalizado", () => {
    expect(transactionsSearchSchema.parse({ period: "custom", from: "2026-01-01" })).toEqual({});
    expect(
      transactionsSearchSchema.parse({
        period: "custom",
        from: "2026-01-01",
        to: "2026-01-31",
      }),
    ).toEqual({ period: "custom", from: "2026-01-01", to: "2026-01-31" });
  });

  it("interpreta uncategorized como booleano ou string e ignora o desligado", () => {
    expect(transactionsSearchSchema.parse({ uncategorized: true })).toEqual({
      uncategorized: true,
    });
    expect(transactionsSearchSchema.parse({ uncategorized: "true" })).toEqual({
      uncategorized: true,
    });
    expect(transactionsSearchSchema.parse({ uncategorized: false })).toEqual({});
    expect(transactionsSearchSchema.parse({ uncategorized: "false" })).toEqual({});
    expect(transactionsSearchSchema.parse({ uncategorized: "talvez" })).toEqual({});
  });

  it("mantém o painel aberto (`tx`) ao lado dos filtros", () => {
    expect(transactionsSearchSchema.parse({ q: "mercado", tx: "tx-1" })).toEqual({
      q: "mercado",
      tx: "tx-1",
    });
  });

  it("interpreta filters (sheet aberto) como booleano e ignora o desligado", () => {
    expect(transactionsSearchSchema.parse({ filters: true })).toEqual({ filters: true });
    expect(transactionsSearchSchema.parse({ filters: "true" })).toEqual({ filters: true });
    expect(transactionsSearchSchema.parse({ filters: "false" })).toEqual({});
    expect(transactionsSearchSchema.parse({ filters: "talvez" })).toEqual({});
  });

  it("filters não conta como filtro ativo", () => {
    expect(hasActiveTransactionFilters({ filters: true })).toBe(false);
  });

  it("descarta um tx inválido em vez de derrubar a navegação", () => {
    expect(transactionsSearchSchema.parse({ tx: "" })).toEqual({});
    expect(transactionsSearchSchema.parse({ tx: 42 })).toEqual({});
  });

  it("dá prioridade a uncategorized sobre categoryId", () => {
    expect(transactionsSearchSchema.parse({ uncategorized: true, categoryId: "cat-1" })).toEqual({
      uncategorized: true,
    });
    expect(transactionsSearchSchema.parse({ categoryId: "cat-1" })).toEqual({
      categoryId: "cat-1",
    });
  });
});

describe("accountsSearchSchema", () => {
  it("omite a URL sem filtro de instituição", () => {
    expect(accountsSearchSchema.parse({})).toEqual({});
  });

  it("mantém conexão e instituição válidas", () => {
    expect(
      accountsSearchSchema.parse({ connection: "conn-1", institution: "  Banco Aurora  " }),
    ).toEqual({ connection: "conn-1", institution: "Banco Aurora" });
    expect(accountsSearchSchema.parse({ connection: "conn-1", institution: "Itaú" })).toEqual({
      connection: "conn-1",
      institution: "Itaú",
    });
  });

  it("descarta entradas inválidas sem derrubar a navegação", () => {
    expect(accountsSearchSchema.parse({ connection: "", institution: "" })).toEqual({});
    expect(accountsSearchSchema.parse({ institution: "x".repeat(200) })).toEqual({});
    expect(accountsSearchSchema.parse({ connection: 42, institution: ["Itaú"] })).toEqual({});
  });

  it("não deixa instituição numérica virar chave de grupo", () => {
    expect(accountsSearchSchema.parse({ connection: "c1", institution: 2024 })).toEqual({
      connection: "c1",
    });
  });

  it("ignora o período do layout (quem o valida é o _app)", () => {
    expect(accountsSearchSchema.parse({ period: "90d", connection: "conn-1" })).toEqual({
      connection: "conn-1",
    });
  });
});

describe("hasActiveTransactionFilters", () => {
  it("ignora período e ordenação", () => {
    expect(hasActiveTransactionFilters({ period: "90d", sort: "date_asc" })).toBe(false);
    expect(hasActiveTransactionFilters({ q: "mercado" })).toBe(true);
    expect(hasActiveTransactionFilters({ accountId: "acc-1" })).toBe(true);
    expect(hasActiveTransactionFilters({ categoryId: "cat-1" })).toBe(true);
    expect(hasActiveTransactionFilters({ type: "income" })).toBe(true);
    expect(hasActiveTransactionFilters({ uncategorized: true })).toBe(true);
  });

  it("não conta o painel aberto como filtro", () => {
    expect(hasActiveTransactionFilters({ tx: "tx-1" })).toBe(false);
    expect(hasActiveTransactionFilters({ tx: "tx-1", period: "90d" })).toBe(false);
  });
});

describe("painel de detalhe na URL", () => {
  const filters = { period: "90d", q: "mercado", categoryId: "cat-1" } as const;

  it("abre trocando só o `tx`", () => {
    expect(openTransactionPanel(filters, "tx-1")).toEqual({ ...filters, tx: "tx-1" });
  });

  it("fecha removendo só o `tx`, sem tocar nos filtros", () => {
    expect(closeTransactionPanel({ ...filters, tx: "tx-1" })).toEqual(filters);
  });

  it("link com tx e filters juntos abre só o detalhe: o schema descarta o filters", () => {
    const parsed = transactionsSearchSchema.parse({ ...filters, tx: "tx-1", filters: true });

    expect(parsed.tx).toBe("tx-1");
    expect(parsed.filters).toBeUndefined();
    expect(closeTransactionPanel(parsed)).toEqual(filters);
  });

  it("fechar um painel já fechado mantém os filtros", () => {
    expect(closeTransactionPanel(filters)).toEqual(filters);
  });
});
