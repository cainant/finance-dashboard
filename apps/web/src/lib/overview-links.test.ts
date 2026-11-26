import { describe, expect, it } from "vitest";

import { periodOnlySearch, transactionsLinkSearch } from "./overview-links";
import { transactionsSearchSchema } from "./search";

describe("periodOnlySearch", () => {
  it("mantém só o período e descarta o resto", () => {
    const previous = { period: "custom", from: "2026-09-01", to: "2026-09-30", q: "x", tx: "1" };

    expect(periodOnlySearch(previous as never)).toEqual({
      period: "custom",
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("não cria chaves quando o período é o padrão (URL limpa)", () => {
    expect(periodOnlySearch({})).toEqual({});
  });
});

describe("transactionsLinkSearch", () => {
  it("receitas e despesas filtram por tipo e preservam o período", () => {
    expect(transactionsLinkSearch({ period: "90d" }, { type: "income" })).toEqual({
      period: "90d",
      type: "income",
    });
    expect(transactionsLinkSearch({}, { type: "expense" })).toEqual({ type: "expense" });
  });

  it("categoria com id filtra por categoryId", () => {
    expect(
      transactionsLinkSearch(
        { period: "custom", from: "2026-09-01", to: "2026-09-30" },
        { type: "expense", categoryId: "cat-1" },
      ),
    ).toEqual({
      period: "custom",
      from: "2026-09-01",
      to: "2026-09-30",
      type: "expense",
      categoryId: "cat-1",
    });
  });

  it("categoria nula vira o filtro sem categoria", () => {
    expect(transactionsLinkSearch({}, { type: "expense", categoryId: null })).toEqual({
      type: "expense",
      uncategorized: true,
    });
  });
});

describe("transactionsLinkSearch × transactionsSearchSchema", () => {
  // A Visão geral monta o search; a rota de Transações o valida. Se alguém
  // renomear `type`, `categoryId` ou `uncategorized` num lado só, o filtro do
  // link some em silêncio (a URL vira "tudo"): estes casos quebram antes.
  const period = { period: "custom", from: "2026-09-01", to: "2026-09-30" } as const;

  it("despesas e receitas chegam como filtro de tipo", () => {
    expect(
      transactionsSearchSchema.parse(transactionsLinkSearch(period, { type: "expense" })),
    ).toMatchObject({ ...period, type: "expense" });
    expect(
      transactionsSearchSchema.parse(transactionsLinkSearch(period, { type: "income" })),
    ).toMatchObject({ ...period, type: "income" });
  });

  it("categoria chega como categoryId e o balde sem categoria como uncategorized", () => {
    expect(
      transactionsSearchSchema.parse(
        transactionsLinkSearch(period, { type: "expense", categoryId: "cat-1" }),
      ),
    ).toMatchObject({ type: "expense", categoryId: "cat-1" });

    const uncategorized = transactionsSearchSchema.parse(
      transactionsLinkSearch(period, { type: "expense", categoryId: null }),
    );
    expect(uncategorized).toMatchObject({ type: "expense", uncategorized: true });
    expect(uncategorized.categoryId).toBeUndefined();
  });
});
