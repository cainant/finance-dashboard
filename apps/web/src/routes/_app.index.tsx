import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { demoConnectStatusLabel } from "@/components/connections/connection-view";
import { DemoBadge } from "@/components/domain/demo-badge";
import { ErrorState } from "@/components/domain/error-state";
import { HeaderActionLabel } from "@/components/domain/header-action-label";
import { KpiCard } from "@/components/domain/kpi-card";
import { PageHeader } from "@/components/domain/page-header";
import { PeriodControl } from "@/components/domain/period-control";
import { AttentionStrip, AttentionStripSkeleton } from "@/components/overview/attention-strip";
import { OverviewAccountsCard } from "@/components/overview/overview-accounts-card";
import { OverviewCategoriesCard } from "@/components/overview/overview-categories-card";
import { OverviewChartsCard } from "@/components/overview/overview-charts-card";
import { OverviewUpcomingBillsCard } from "@/components/overview/overview-upcoming-bills-card";
import { OverviewMobile } from "@/components/overview/overview-mobile";
import { OverviewWelcomeCard } from "@/components/overview/overview-welcome-card";
import { RecentTransactionsCard } from "@/components/overview/recent-transactions-card";
import { useOverviewData } from "@/components/overview/use-overview-data";
import { Button } from "@/components/ui/button";
import { UPCOMING_BILLS_WINDOW_DAYS } from "@/lib/bills";
import { formatDate, formatPercent } from "@/lib/format";
import { useIsDesktop } from "@/lib/hooks";

export const Route = createFileRoute("/_app/")({
  staticData: { title: "Visão geral" },
  component: OverviewPage,
});

function OverviewPage() {
  const isDesktop = useIsDesktop();
  const data = useOverviewData();
  const {
    period,
    overviewQuery,
    netWorthQuery,
    monthlyQuery,
    breakdownQuery,
    recentQuery,
    accountsQuery,
    billsQuery,
    connect,
    step,
    progress,
    demoEnabled,
    connections,
    bills,
    monthly,
    hasCreditCards,
    connectionsLoaded,
    hasLiveConnection,
    connectIsPrimary,
    hasDemoConnection,
    kpis,
    breakdown,
    recent,
    categories,
    netWorth,
    savingsRateValue,
    incomeSeries,
    expenseSeries,
    resultSeries,
    netWorthSeries,
    attentionItems,
    attentionLoading,
  } = data;

  // Abaixo de `lg` a tela é outra composição (ver `OverviewMobile`); só um dos
  // dois layouts existe no DOM por vez.
  if (!isDesktop) {
    return <OverviewMobile data={data} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        className="mb-2"
        title="Visão geral"
        badge={hasDemoConnection ? <DemoBadge /> : null}
        description={
          <>
            {period.label} · {formatDate(period.from)} a {formatDate(period.to)} · comparado ao
            período anterior
          </>
        }
        actions={
          <>
            <PeriodControl />
            <Button asChild variant={connectIsPrimary ? "default" : "outline"}>
              <Link to="/connections" search={(previous) => previous}>
                <Plus aria-hidden="true" />
                <HeaderActionLabel label="Conectar conta" shortLabel="Conectar" />
              </Link>
            </Button>
          </>
        }
      />

      {connectionsLoaded && !hasLiveConnection ? (
        <OverviewWelcomeCard
          demoEnabled={demoEnabled}
          isConnecting={connect.isPending}
          statusLabel={connect.isPending ? demoConnectStatusLabel(step, progress) : null}
          onConnect={() => connect.mutate()}
        />
      ) : null}

      {attentionLoading ? <AttentionStripSkeleton /> : <AttentionStrip items={attentionItems} />}

      <section
        aria-label="Indicadores principais"
        className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard
          label="Saldo em contas"
          valueCents={kpis?.balance.currentCents ?? null}
          deltaAmounts={kpis?.balance}
          deltaLabel="Saldo consolidado · vs. período anterior"
          hint="Saldo consolidado"
          series={netWorthSeries}
          isLoading={overviewQuery.isPending}
        />
        <KpiCard
          label="Receitas"
          valueCents={kpis?.income.currentCents ?? null}
          deltaAmounts={kpis?.income}
          series={incomeSeries}
          isLoading={overviewQuery.isPending}
        />
        <KpiCard
          label="Despesas"
          valueCents={kpis?.expenses.currentCents ?? null}
          deltaAmounts={kpis?.expenses}
          invertDelta
          series={expenseSeries}
          isLoading={overviewQuery.isPending}
        />
        <KpiCard
          label="Resultado"
          valueCents={kpis?.result.currentCents ?? null}
          deltaAmounts={kpis?.result}
          deltaLabel={
            savingsRateValue === null
              ? "vs. período anterior"
              : `vs. período anterior · ${formatPercent(savingsRateValue)} de poupança`
          }
          hint="vs. período anterior"
          series={resultSeries}
          isLoading={overviewQuery.isPending}
        />
      </section>

      {overviewQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar os indicadores"
          error={overviewQuery.error}
          onRetry={() => void overviewQuery.refetch()}
          isRetrying={overviewQuery.isFetching}
        />
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <OverviewChartsCard
            netWorth={{
              data: netWorth,
              isPending: netWorthQuery.isPending,
              isError: netWorthQuery.isError,
              error: netWorthQuery.error,
              isFetching: netWorthQuery.isFetching,
              onRetry: () => void netWorthQuery.refetch(),
            }}
            monthly={{
              data: monthly,
              isPending: monthlyQuery.isPending,
              isError: monthlyQuery.isError,
              error: monthlyQuery.error,
              isFetching: monthlyQuery.isFetching,
              onRetry: () => void monthlyQuery.refetch(),
            }}
            netWorthCents={kpis?.netWorth.currentCents}
            netWorthAmounts={kpis?.netWorth}
          />

          <RecentTransactionsCard
            transactions={recent}
            categories={categories}
            isPending={recentQuery.isPending}
            isError={recentQuery.isError}
            error={recentQuery.error}
            isFetching={recentQuery.isFetching}
            onRetry={() => void recentQuery.refetch()}
          />
        </div>

        <aside aria-label="Resumo lateral" className="flex min-w-0 flex-col gap-4">
          <OverviewAccountsCard
            accounts={accountsQuery.data?.data ?? []}
            connections={connections}
            isPending={accountsQuery.isPending}
            isError={accountsQuery.isError}
            error={accountsQuery.error}
            isFetching={accountsQuery.isFetching}
            onRetry={() => void accountsQuery.refetch()}
          />

          <OverviewUpcomingBillsCard
            bills={bills}
            hasCreditCards={hasCreditCards}
            days={UPCOMING_BILLS_WINDOW_DAYS}
            isPending={billsQuery.isPending}
            isError={billsQuery.isError}
            error={billsQuery.error}
            isFetching={billsQuery.isFetching}
            onRetry={() => void billsQuery.refetch()}
          />

          <OverviewCategoriesCard
            categories={breakdown}
            isPending={breakdownQuery.isPending}
            isError={breakdownQuery.isError}
            error={breakdownQuery.error}
            isFetching={breakdownQuery.isFetching}
            onRetry={() => void breakdownQuery.refetch()}
          />
        </aside>
      </div>
    </div>
  );
}
