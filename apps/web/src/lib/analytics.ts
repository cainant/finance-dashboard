import type { CategoryBreakdownItem, Granularity, MonthlySummary, Period } from "@fd/contracts";
import { queryOptions } from "@tanstack/react-query";

import { api } from "./api";
import { daysBetweenIso } from "./period";

/** Comparação entre dois valores em centavos (contrato de `OverviewKpi`). */
export interface AmountComparison {
  currentCents: number;
  previousCents: number;
  deltaCents: number;
  /** `null` quando `previousCents` é 0 (não existe base de comparação). */
  deltaPercent: number | null;
}

/**
 * Variação relativa em **pontos percentuais**, seguindo o contrato
 * `deltaPercent` da API (`2.9` = 2,9%). Sem base anterior (0) não há
 * percentual — nunca devolva `Infinity`.
 *
 * Formate sempre com `formatPercentPoints`; usar `formatPercent` aqui
 * mostraria 290% para 2,9 pontos.
 */
export function variationPercent(currentCents: number, previousCents: number): number | null {
  if (previousCents === 0) {
    return null;
  }

  return ((currentCents - previousCents) / Math.abs(previousCents)) * 100;
}

/** Compara dois montantes e calcula delta absoluto e percentual. */
export function compareAmounts(currentCents: number, previousCents: number): AmountComparison {
  return {
    currentCents,
    previousCents,
    deltaCents: currentCents - previousCents,
    deltaPercent: variationPercent(currentCents, previousCents),
  };
}

/**
 * Mês com a comparação em relação ao mês imediatamente anterior.
 *
 * Os percentuais brutos saíram daqui: a exibição passa pela regra única de
 * `describeDelta` (`@/lib/delta`), que troca percentual absurdo por reais.
 */
export interface MonthlyVariation extends MonthlySummary {
  /** Mês anterior (base da comparação); `null` no primeiro da série. */
  previous: MonthlySummary | null;
}

/** Série mensal com o mês anterior de cada ponto (primeiro = null). */
export function monthlyVariations(data: readonly MonthlySummary[]): MonthlyVariation[] {
  return data.map((month, index) => ({
    month: month.month,
    incomeCents: month.incomeCents,
    expenseCents: month.expenseCents,
    netCents: month.netCents,
    previous: data[index - 1] ?? null,
  }));
}

/** Categoria comparada entre o período atual e o anterior. */
export interface CategoryTrend {
  key: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  currentCents: number;
  previousCents: number;
  deltaCents: number;
  deltaPercent: number | null;
}

function categoryKey(item: Pick<CategoryBreakdownItem, "categoryId" | "slug">): string {
  return item.categoryId ?? `slug:${item.slug}`;
}

/**
 * Une os breakdowns de dois períodos por categoria (`categoryId`, com fallback
 * para o slug). Categorias que só existem em um dos lados entram com 0 no outro,
 * para que altas e baixas apareçam na comparação.
 */
export function categoryTrends(
  current: readonly CategoryBreakdownItem[],
  previous: readonly CategoryBreakdownItem[],
): CategoryTrend[] {
  const trends = new Map<string, CategoryTrend>();

  for (const item of current) {
    trends.set(categoryKey(item), {
      key: categoryKey(item),
      name: item.name,
      slug: item.slug,
      icon: item.icon,
      color: item.color,
      currentCents: item.amountCents,
      previousCents: 0,
      deltaCents: item.amountCents,
      deltaPercent: null,
    });
  }

  for (const item of previous) {
    const key = categoryKey(item);
    const existing = trends.get(key);

    if (existing) {
      existing.previousCents = item.amountCents;
    } else {
      trends.set(key, {
        key,
        name: item.name,
        slug: item.slug,
        icon: item.icon,
        color: item.color,
        currentCents: 0,
        previousCents: item.amountCents,
        deltaCents: -item.amountCents,
        deltaPercent: variationPercent(0, item.amountCents),
      });
    }
  }

  for (const trend of trends.values()) {
    trend.deltaCents = trend.currentCents - trend.previousCents;

    if (trend.currentCents > 0 && trend.previousCents > 0) {
      trend.deltaPercent = variationPercent(trend.currentCents, trend.previousCents);
    } else if (trend.currentCents === 0) {
      trend.deltaPercent = variationPercent(0, trend.previousCents);
    } else {
      trend.deltaPercent = null;
    }
  }

  return [...trends.values()].sort(
    (a, b) =>
      b.currentCents - a.currentCents ||
      b.previousCents - a.previousCents ||
      a.name.localeCompare(b.name, "pt-BR"),
  );
}

/** Maiores altas e maiores baixas de gastos por categoria. */
export interface CategoryMovers {
  risers: CategoryTrend[];
  fallers: CategoryTrend[];
}

export function topMovers(trends: readonly CategoryTrend[], limit = 3): CategoryMovers {
  const risers = trends
    .filter((trend) => trend.deltaCents > 0)
    .sort((a, b) => b.deltaCents - a.deltaCents)
    .slice(0, limit);

  const fallers = trends
    .filter((trend) => trend.deltaCents < 0)
    .sort((a, b) => a.deltaCents - b.deltaCents)
    .slice(0, limit);

  return { risers, fallers };
}

/** Médias mensais do período (série de resumos mensais). */
export interface MonthlyAverages {
  /** Quantidade de meses com resumo na série. */
  months: number;
  incomeCents: number;
  expenseCents: number;
  resultCents: number;
}

export function monthlyAverages(data: readonly MonthlySummary[]): MonthlyAverages {
  if (data.length === 0) {
    return { months: 0, incomeCents: 0, expenseCents: 0, resultCents: 0 };
  }

  let incomeCents = 0;
  let expenseCents = 0;
  let resultCents = 0;

  for (const month of data) {
    incomeCents += month.incomeCents;
    expenseCents += month.expenseCents;
    resultCents += month.netCents;
  }

  const count = data.length;

  return {
    months: count,
    incomeCents: Math.round(incomeCents / count),
    expenseCents: Math.round(expenseCents / count),
    resultCents: Math.round(resultCents / count),
  };
}

/** Ticket médio das despesas classificadas; `null` sem transações. */
export function averageTicketCents(totalCents: number, count: number): number | null {
  if (count <= 0) {
    return null;
  }

  return Math.round(Math.abs(totalCents) / count);
}

/** Taxa de poupança (resultado ÷ receitas); `null` quando não há receitas. */
export function savingsRate(incomeCents: number, resultCents: number): number | null {
  if (incomeCents <= 0) {
    return null;
  }

  return resultCents / incomeCents;
}

/**
 * Granularidade inicial do fluxo de caixa conforme o tamanho do período: dias
 * para janelas curtas, semanas para médias e meses para recortes longos.
 */
export function suggestedGranularity(period: { from: string; to: string }): Granularity {
  const days = daysBetweenIso(period.from, period.to) + 1;

  if (days <= 45) {
    return "day";
  }

  if (days <= 120) {
    return "week";
  }

  return "month";
}

/** Maiores despesas do período (`sort=amount_asc` já traz os menores valores). */
export function topExpensesQueryOptions(period: Period, limit = 5) {
  return queryOptions({
    queryKey: ["transactions", "top-expenses", period.from, period.to, limit] as const,
    queryFn: ({ signal }) => api.transactions({ ...period, sort: "amount_asc", limit }, signal),
  });
}
