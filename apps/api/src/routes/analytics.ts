/**
 * `GET /api/overview` e `/api/analytics/*`.
 * Todas as agregações rodam em SQL (ver `domain/analytics.ts`); aqui só
 * preenchemos buckets vazios e calculamos deltas/percentuais.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import {
  addDays,
  cashflowQuery,
  categoryBreakdownQuery,
  monthlyQuery,
  netWorthQuery,
  periodQuery,
  todayIsoDate,
  type CashflowResponse,
  type CategoryBreakdownResponse,
  type MonthlyResponse,
  type NetWorthResponse,
  type OverviewKpi,
  type OverviewResponse,
  type Period,
} from "@fd/contracts";

import { currentUser } from "../auth/middleware";
import {
  balanceTotals,
  cashflowBuckets,
  categoryBreakdown,
  investmentsTotal,
  monthlyTotals,
  netWorthSeries,
  transactionTotals,
} from "../domain/analytics";
import { enumerateBuckets, lastMonths, previousPeriod } from "../domain/period";
import type { AppEnv } from "../env";
import { queryParams } from "../http/validate";

export const analyticsRoutes = new Hono<AppEnv>();
export const overviewRoutes = new Hono<AppEnv>();

overviewRoutes.get("/", queryParams(periodQuery), async (c) => {
  const user = currentUser(c);
  const db = c.get("db");
  const period = c.req.valid("query");
  const previous = previousPeriod(period);

  const [currentTotals, previousTotals, currentBalance, previousBalance, investments] =
    await Promise.all([
      transactionTotals(db, user.id, period),
      transactionTotals(db, user.id, previous),
      balanceTotals(db, user.id, period.to),
      balanceTotals(db, user.id, previous.to),
      investmentsTotal(db, user.id),
    ]);

  const currentResult = currentTotals.incomeCents - currentTotals.expensesCents;
  const previousResult = previousTotals.incomeCents - previousTotals.expensesCents;
  // Patrimônio = contas não-crédito + investimentos − dívida dos cartões.
  // A dívida do cartão no Open Finance é o saldo devedor (faturas não pagas),
  // e o overview anterior recalculava `balanceTotals` duas vezes.
  const netWorth = (balance: typeof currentBalance, invested: number) =>
    balance.assetsCents + invested - balance.liabilitiesCents;
  const currentNetWorth = netWorth(currentBalance, investments);
  const previousNetWorth = netWorth(previousBalance, investments);

  const body: OverviewResponse = {
    period,
    previousPeriod: previous,
    currency: "BRL",
    kpis: {
      balance: kpi(currentBalance.assetsCents, previousBalance.assetsCents),
      income: kpi(currentTotals.incomeCents, previousTotals.incomeCents),
      expenses: kpi(currentTotals.expensesCents, previousTotals.expensesCents),
      result: kpi(currentResult, previousResult),
      netWorth: kpi(currentNetWorth, previousNetWorth),
    },
  };

  return c.json(body);
});

analyticsRoutes.get("/cashflow", queryParams(cashflowQuery), async (c) => {
  const user = currentUser(c);
  const query = c.req.valid("query");
  const rows = await cashflowBuckets(c.get("db"), user.id, query, query.granularity);
  const byBucket = new Map(rows.map((row) => [row.bucket, row]));

  const body: CashflowResponse = {
    data: enumerateBuckets(query, query.granularity).map((bucket) => {
      const row = byBucket.get(bucket);
      const incomeCents = row?.incomeCents ?? 0;
      const expenseCents = row?.expensesCents ?? 0;
      return {
        date: bucket,
        incomeCents,
        expenseCents,
        netCents: incomeCents - expenseCents,
      };
    }),
    period: { from: query.from, to: query.to },
    granularity: query.granularity,
  };

  return c.json(body);
});

analyticsRoutes.get("/categories", queryParams(categoryBreakdownQuery), async (c) => {
  const user = currentUser(c);
  const query = c.req.valid("query");
  const rows = await categoryBreakdown(c.get("db"), user.id, query, query.type);
  const totalCents = rows.reduce((sum, row) => sum + Math.max(0, row.amountCents), 0);

  const body: CategoryBreakdownResponse = {
    data: rows.map((row) => ({
      categoryId: row.categoryId,
      name: row.name ?? "Sem categoria",
      slug: row.slug ?? "sem-categoria",
      icon: row.icon ?? "CircleHelp",
      color: row.color ?? "#71717a",
      amountCents: row.amountCents,
      percentage: percentage(row.amountCents, totalCents),
      transactionCount: row.transactionCount,
    })),
    period: { from: query.from, to: query.to },
    type: query.type,
    totalCents,
  };

  return c.json(body);
});

analyticsRoutes.get("/net-worth", queryParams(netWorthQuery), async (c) => {
  const user = currentUser(c);
  const period = c.req.valid("query");
  const series = await netWorthSeries(c.get("db"), user.id, clampSeriesPeriod(period));

  const body: NetWorthResponse = {
    data: series.map((point) => ({
      date: point.date,
      assetsCents: point.assetsCents,
      liabilitiesCents: point.liabilitiesCents,
      netWorthCents: point.assetsCents - point.liabilitiesCents,
    })),
    period,
  };

  return c.json(body);
});

analyticsRoutes.get("/monthly", queryParams(monthlyQuery), async (c) => {
  const user = currentUser(c);
  const { months } = c.req.valid("query");
  const today = todayIsoDate();
  const monthStarts = lastMonths(months, today);
  const rows = await monthlyTotals(c.get("db"), user.id, monthStarts[0]!, today);
  const byMonth = new Map(rows.map((row) => [row.month, row]));

  const body: MonthlyResponse = {
    data: monthStarts.map((monthStart) => {
      const month = monthStart.slice(0, 7);
      const row = byMonth.get(month);
      const incomeCents = row?.incomeCents ?? 0;
      const expenseCents = row?.expensesCents ?? 0;
      return { month, incomeCents, expenseCents, netCents: incomeCents - expenseCents };
    }),
  };

  return c.json(body);
});

function kpi(currentCents: number, previousCents: number): OverviewKpi {
  const current = Math.round(currentCents);
  const previous = Math.round(previousCents);
  const delta = current - previous;
  return {
    currentCents: current,
    previousCents: previous,
    deltaCents: delta,
    deltaPercent: previous === 0 ? null : Math.round((delta / Math.abs(previous)) * 1000) / 10,
  };
}

function percentage(amountCents: number, totalCents: number): number {
  if (totalCents <= 0) return 0;
  return Math.round((Math.max(0, amountCents) / totalCents) * 10_000) / 100;
}

/** A série patrimonial é diária e limitada a 366 dias (CPU do Free). */
function clampSeriesPeriod(period: Period): Period {
  const maxFrom = addDays(period.to, -365);
  return period.from < maxFrom ? { from: maxFrom, to: period.to } : period;
}

export type AnalyticsContext = Context<AppEnv>;
