import type { CategoryBreakdownItem, MonthlySummary } from "@fd/contracts";
import { describe, expect, it } from "vitest";

import {
  averageTicketCents,
  categoryTrends,
  compareAmounts,
  monthlyAverages,
  monthlyVariations,
  savingsRate,
  suggestedGranularity,
  topMovers,
  variationPercent,
} from "./analytics";

function month(
  month: string,
  incomeCents: number,
  expenseCents: number,
  netCents = incomeCents - expenseCents,
): MonthlySummary {
  return { month, incomeCents, expenseCents, netCents };
}

function category(
  overrides: Partial<CategoryBreakdownItem> & Pick<CategoryBreakdownItem, "slug" | "amountCents">,
): CategoryBreakdownItem {
  return {
    categoryId: `cat-${overrides.slug}`,
    name: overrides.slug,
    icon: "Tag",
    color: "#22c55e",
    percentage: 0,
    transactionCount: 1,
    ...overrides,
  };
}

describe("variationPercent", () => {
  it("calcula a variação em pontos percentuais (contrato deltaPercent)", () => {
    expect(variationPercent(150, 100)).toBeCloseTo(50);
    expect(variationPercent(50, 100)).toBeCloseTo(-50);
    expect(variationPercent(100, 100)).toBe(0);
  });

  it("não calcula percentual sem base anterior", () => {
    expect(variationPercent(100, 0)).toBeNull();
  });
});

describe("compareAmounts", () => {
  it("devolve delta absoluto e percentual", () => {
    expect(compareAmounts(120_000, 100_000)).toEqual({
      currentCents: 120_000,
      previousCents: 100_000,
      deltaCents: 20_000,
      deltaPercent: 20,
    });
  });
});

describe("monthlyVariations", () => {
  it("aponta o mês anterior de cada ponto e deixa o primeiro sem base", () => {
    const variations = monthlyVariations([
      month("2026-09", 100_000, 80_000),
      month("2026-10", 150_000, 120_000),
      month("2026-11", 150_000, 90_000),
    ]);

    expect(variations).toHaveLength(3);
    expect(variations[0]).toMatchObject({ month: "2026-09", previous: null });
    expect(variations[1]).toMatchObject({
      month: "2026-10",
      previous: { month: "2026-09", incomeCents: 100_000, expenseCents: 80_000, netCents: 20_000 },
    });
    expect(variations[2]).toMatchObject({
      month: "2026-11",
      previous: { month: "2026-10", incomeCents: 150_000, expenseCents: 120_000, netCents: 30_000 },
    });
  });

  it("devolve lista vazia sem série", () => {
    expect(monthlyVariations([])).toEqual([]);
  });
});

describe("categoryTrends", () => {
  it("une os períodos por categoria e calcula altas e quedas", () => {
    const trends = categoryTrends(
      [
        category({ categoryId: "food", name: "Mercado", slug: "mercado", amountCents: 120_000 }),
        category({ categoryId: "fun", name: "Lazer", slug: "lazer", amountCents: 40_000 }),
        category({
          categoryId: "new",
          name: "Viagem",
          slug: "viagem",
          amountCents: 30_000,
        }),
      ],
      [
        category({ categoryId: "food", name: "Mercado", slug: "mercado", amountCents: 100_000 }),
        category({ categoryId: "fun", name: "Lazer", slug: "lazer", amountCents: 60_000 }),
        category({
          categoryId: "old",
          name: "Assinaturas",
          slug: "assinaturas",
          amountCents: 10_000,
        }),
      ],
    );

    const byKey = new Map(trends.map((trend) => [trend.key, trend]));

    expect(byKey.get("food")).toMatchObject({
      currentCents: 120_000,
      previousCents: 100_000,
      deltaCents: 20_000,
      deltaPercent: 20,
    });
    expect(byKey.get("fun")).toMatchObject({ deltaCents: -20_000 });
    expect(byKey.get("fun")!.deltaPercent).toBeCloseTo(-100 / 3);
    expect(byKey.get("new")).toMatchObject({
      previousCents: 0,
      deltaCents: 30_000,
      deltaPercent: null,
    });
    expect(byKey.get("old")).toMatchObject({
      currentCents: 0,
      deltaCents: -10_000,
      deltaPercent: -100,
    });
  });

  it("usa o slug quando a categoria não tem id", () => {
    const trends = categoryTrends(
      [category({ categoryId: null, slug: "mercado", amountCents: 10_000 })],
      [category({ categoryId: null, slug: "mercado", amountCents: 5_000 })],
    );

    expect(trends).toHaveLength(1);
    expect(trends[0]).toMatchObject({ key: "slug:mercado", deltaCents: 5_000 });
  });
});

describe("topMovers", () => {
  it("separa as maiores altas e baixas, limitando o tamanho", () => {
    const trends = categoryTrends(
      [
        category({ categoryId: "a", slug: "a", amountCents: 500 }),
        category({ categoryId: "b", slug: "b", amountCents: 50 }),
        category({ categoryId: "c", slug: "c", amountCents: 10 }),
      ],
      [
        category({ categoryId: "a", slug: "a", amountCents: 100 }),
        category({ categoryId: "b", slug: "b", amountCents: 100 }),
        category({ categoryId: "c", slug: "c", amountCents: 100 }),
      ],
    );

    const { risers, fallers } = topMovers(trends, 2);

    expect(risers.map((trend) => trend.key)).toEqual(["a"]);
    // Quedas listadas da mais negativa (c, −90) para a menos negativa (b, −50).
    expect(fallers.map((trend) => trend.key)).toEqual(["c", "b"]);
  });
});

describe("monthlyAverages", () => {
  it("calcula as médias mensais de receitas, despesas e resultado", () => {
    const averages = monthlyAverages([
      month("2026-09", 100_000, 80_000),
      month("2026-10", 200_000, 120_000),
    ]);

    expect(averages).toEqual({
      months: 2,
      incomeCents: 150_000,
      expenseCents: 100_000,
      resultCents: 50_000,
    });
  });

  it("zera sem série", () => {
    expect(monthlyAverages([])).toEqual({
      months: 0,
      incomeCents: 0,
      expenseCents: 0,
      resultCents: 0,
    });
  });
});

describe("averageTicketCents", () => {
  it("divide o total pelo número de despesas", () => {
    expect(averageTicketCents(-50_000, 4)).toBe(12_500);
    expect(averageTicketCents(0, 0)).toBeNull();
  });
});

describe("savingsRate", () => {
  it("calcula resultado sobre receitas", () => {
    expect(savingsRate(100_000, 25_000)).toBeCloseTo(0.25);
    expect(savingsRate(0, 10_000)).toBeNull();
  });
});

describe("suggestedGranularity", () => {
  it("cresce a granularidade conforme o tamanho do período", () => {
    expect(suggestedGranularity({ from: "2026-11-01", to: "2026-11-30" })).toBe("day");
    expect(suggestedGranularity({ from: "2026-08-01", to: "2026-11-01" })).toBe("week");
    expect(suggestedGranularity({ from: "2025-12-01", to: "2026-11-10" })).toBe("month");
  });
});
