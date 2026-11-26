import type { Granularity } from "@fd/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { ArrowRight, Landmark } from "lucide-react";
import { useMemo, useState } from "react";

import { StatisticsCard, TopExpensesCard } from "@/components/analytics/analytics-stats";
import { CashflowCard } from "@/components/analytics/cashflow-card";
import { CategoryBreakdownCard, CategoryTrendsCard } from "@/components/analytics/category-trends";
import { MonthlyComparisonCard } from "@/components/analytics/monthly-comparison";
import { NetWorthAreaChart } from "@/components/charts/net-worth-area-chart";
import { ChartCard } from "@/components/domain/chart-card";
import { DemoBadge } from "@/components/domain/demo-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { HeaderActionLabel } from "@/components/domain/header-action-label";
import { KpiCard } from "@/components/domain/kpi-card";
import { PageHeader } from "@/components/domain/page-header";
import { PeriodControl } from "@/components/domain/period-control";
import { Button } from "@/components/ui/button";
import {
  averageTicketCents,
  monthlyAverages,
  savingsRate,
  suggestedGranularity,
  topExpensesQueryOptions,
} from "@/lib/analytics";
import { formatDate } from "@/lib/format";
import { periodSelectionFromSearch, previousPeriod, resolvePeriod } from "@/lib/period";
import {
  cashflowQueryOptions,
  categoryBreakdownQueryOptions,
  connectionsQueryOptions,
  monthlyQueryOptions,
  netWorthQueryOptions,
  overviewQueryOptions,
} from "@/lib/queries";

export const Route = createFileRoute("/_app/analytics")({
  staticData: { title: "Análises" },
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const search = useSearch({ from: "/_app" });
  const period = resolvePeriod(periodSelectionFromSearch(search));
  const periodInput = { from: period.from, to: period.to };
  const previousRange = previousPeriod(periodInput);

  const [granularityOverride, setGranularityOverride] = useState<Granularity | null>(null);
  const granularity = granularityOverride ?? suggestedGranularity(periodInput);

  const overviewQuery = useQuery(overviewQueryOptions(periodInput));
  const monthlyQuery = useQuery(monthlyQueryOptions(12));
  const cashflowQuery = useQuery(cashflowQueryOptions(periodInput, granularity));
  const currentCategoriesQuery = useQuery(categoryBreakdownQueryOptions(periodInput, "expense"));
  const previousCategoriesQuery = useQuery(categoryBreakdownQueryOptions(previousRange, "expense"));
  const netWorthQuery = useQuery(netWorthQueryOptions(periodInput));
  const topExpensesQuery = useQuery(topExpensesQueryOptions(periodInput, 5));
  const connectionsQuery = useQuery(connectionsQueryOptions);

  const monthlyData = useMemo(() => monthlyQuery.data?.data ?? [], [monthlyQuery.data]);
  const averages = useMemo(() => monthlyAverages(monthlyData), [monthlyData]);

  const currentCategories = useMemo(
    () => currentCategoriesQuery.data?.data ?? [],
    [currentCategoriesQuery.data],
  );
  const previousCategories = previousCategoriesQuery.data?.data ?? [];
  const expenseTotalCents = currentCategoriesQuery.data?.totalCents ?? 0;
  const expenseCount = useMemo(
    () => currentCategories.reduce((total, item) => total + item.transactionCount, 0),
    [currentCategories],
  );
  const ticketCents = averageTicketCents(expenseTotalCents, expenseCount);

  const kpis = overviewQuery.data?.kpis;
  const saveRate = savingsRate(kpis?.income.currentCents ?? 0, kpis?.result.currentCents ?? 0);
  const hasDemoConnection = Boolean(
    connectionsQuery.data?.data.some((connection) => connection.provider === "demo"),
  );

  const categoriesPending = currentCategoriesQuery.isPending || previousCategoriesQuery.isPending;
  const categoriesError = currentCategoriesQuery.isError || previousCategoriesQuery.isError;
  const categoriesErrorValue = currentCategoriesQuery.error ?? previousCategoriesQuery.error;
  const categoriesFetching =
    currentCategoriesQuery.isFetching || previousCategoriesQuery.isFetching;

  function retryCategories() {
    void currentCategoriesQuery.refetch();
    void previousCategoriesQuery.refetch();
  }

  function retryStatistics() {
    void monthlyQuery.refetch();
    retryCategories();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Análises"
        badge={hasDemoConnection ? <DemoBadge /> : null}
        description={
          <>
            {period.label} · {formatDate(periodInput.from)} a {formatDate(periodInput.to)}
          </>
        }
        actions={
          <>
            <PeriodControl />
            <Button asChild variant="outline" size="sm">
              <Link to="/transactions" search={(previous) => previous}>
                <HeaderActionLabel label="Ver transações" shortLabel="Ver" />
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="Resumo do período" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Receitas"
          valueCents={kpis?.income.currentCents ?? null}
          tone="neutral"
          deltaAmounts={kpis?.income}
          isLoading={overviewQuery.isPending}
        />
        <KpiCard
          label="Despesas"
          valueCents={kpis?.expenses.currentCents ?? null}
          tone="neutral"
          deltaAmounts={kpis?.expenses}
          invertDelta
          isLoading={overviewQuery.isPending}
        />
        <KpiCard
          label="Resultado"
          valueCents={kpis?.result.currentCents ?? null}
          tone={(kpis?.result.currentCents ?? 0) < 0 ? "negative" : "neutral"}
          deltaAmounts={kpis?.result}
          isLoading={overviewQuery.isPending}
        />
        <KpiCard
          label="Taxa de poupança"
          format="percent"
          value={saveRate}
          hint={
            kpis
              ? `${formatDate(periodInput.from)} a ${formatDate(periodInput.to)} · resultado ÷ receitas`
              : "Sem receitas no período"
          }
          isLoading={overviewQuery.isPending}
        />
      </section>

      {overviewQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar o resumo do período"
          error={overviewQuery.error}
          onRetry={() => void overviewQuery.refetch()}
          isRetrying={overviewQuery.isFetching}
        />
      ) : null}

      <div className="grid gap-4">
        <MonthlyComparisonCard
          data={monthlyData}
          isPending={monthlyQuery.isPending}
          isError={monthlyQuery.isError}
          error={monthlyQuery.error}
          isFetching={monthlyQuery.isFetching}
          onRetry={() => void monthlyQuery.refetch()}
        />

        <CashflowCard
          data={cashflowQuery.data?.data ?? []}
          granularity={granularity}
          onGranularityChange={setGranularityOverride}
          isPending={cashflowQuery.isPending}
          isError={cashflowQuery.isError}
          error={cashflowQuery.error}
          isFetching={cashflowQuery.isFetching}
          onRetry={() => void cashflowQuery.refetch()}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <CategoryBreakdownCard
          data={currentCategories}
          totalCents={expenseTotalCents}
          periodLabel={period.label}
          isPending={currentCategoriesQuery.isPending}
          isError={currentCategoriesQuery.isError}
          error={currentCategoriesQuery.error}
          isFetching={currentCategoriesQuery.isFetching}
          onRetry={() => void currentCategoriesQuery.refetch()}
        />

        <CategoryTrendsCard
          current={currentCategories}
          previous={previousCategories}
          currentLabel={period.label}
          previousLabel="período anterior"
          isPending={categoriesPending}
          isError={categoriesError}
          error={categoriesErrorValue}
          isFetching={categoriesFetching}
          onRetry={retryCategories}
        />
      </div>

      <ChartCard
        className="min-w-0"
        title="Evolução patrimonial"
        description="Contas + investimentos − faturas abertas"
        isLoading={netWorthQuery.isPending}
        isEmpty={netWorthQuery.isError || (netWorthQuery.data?.data.length ?? 0) < 2}
        empty={
          netWorthQuery.isError ? (
            <ErrorState
              compact
              className="border-0 bg-transparent"
              error={netWorthQuery.error}
              onRetry={() => void netWorthQuery.refetch()}
              isRetrying={netWorthQuery.isFetching}
            />
          ) : (
            <EmptyState
              icon={Landmark}
              title="Sem histórico de patrimônio"
              description="Os snapshots diários de saldo aparecem depois da primeira sincronização."
              compact
              className="border-0 bg-transparent"
            />
          )
        }
      >
        <NetWorthAreaChart data={netWorthQuery.data?.data ?? []} />
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <StatisticsCard
          months={averages.months}
          incomeCents={averages.incomeCents}
          expenseCents={averages.expenseCents}
          resultCents={averages.resultCents}
          ticketCents={ticketCents}
          expenseCount={expenseCount}
          isPending={monthlyQuery.isPending || currentCategoriesQuery.isPending}
          isError={monthlyQuery.isError || currentCategoriesQuery.isError}
          error={monthlyQuery.error ?? currentCategoriesQuery.error}
          isFetching={monthlyQuery.isFetching || currentCategoriesQuery.isFetching}
          onRetry={retryStatistics}
        />

        <TopExpensesCard
          transactions={topExpensesQuery.data?.data ?? []}
          periodLabel={period.label}
          isPending={topExpensesQuery.isPending}
          isError={topExpensesQuery.isError}
          error={topExpensesQuery.error}
          isFetching={topExpensesQuery.isFetching}
          onRetry={() => void topExpensesQuery.refetch()}
        />
      </div>
    </div>
  );
}
