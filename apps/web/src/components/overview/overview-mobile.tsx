import { Link } from "@tanstack/react-router";
import { ChartLine, Plus } from "lucide-react";

import { IncomeExpenseBarChart } from "@/components/charts/income-expense-bar-chart";
import { demoConnectStatusLabel } from "@/components/connections/connection-view";
import { DemoBadge } from "@/components/domain/demo-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { HeaderActionLabel } from "@/components/domain/header-action-label";
import { PageHeader } from "@/components/domain/page-header";
import { AttentionStrip, AttentionStripSkeleton } from "@/components/overview/attention-strip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UPCOMING_BILLS_WINDOW_DAYS } from "@/lib/bills";
import { formatDate } from "@/lib/format";

import { MobileAccountsCard } from "./mobile-accounts-card";
import { MobileBillsCard } from "./mobile-bills-card";
import { MobileCategoriesCard } from "./mobile-categories-card";
import { MobileKpiGrid } from "./mobile-kpi-grid";
import { MobileNetWorthHero } from "./mobile-net-worth-hero";
import { OverviewCard } from "./overview-card";
import { OverviewWelcomeCard } from "./overview-welcome-card";
import { RecentTransactionsCard } from "./recent-transactions-card";
import type { OverviewData } from "./use-overview-data";

function SectionTitle({ children }: { children: string }) {
  return <h2 className="px-1 text-sm leading-5 font-medium text-foreground">{children}</h2>;
}

/**
 * Visão geral abaixo de `lg`: leitura de cima para baixo na ordem em que se
 * decide (atenção → patrimônio → resumo do período → categorias → contas →
 * faturas → recentes). O período é o filtro global da URL, no cartão do
 * patrimônio; nada aqui cria um segundo conceito de período.
 */
export function OverviewMobile({ data }: { data: OverviewData }) {
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
    attentionItems,
    attentionLoading,
  } = data;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        className="gap-3"
        title="Visão geral"
        badge={hasDemoConnection ? <DemoBadge /> : null}
        description={
          <>
            {period.label} · {formatDate(period.from)} a {formatDate(period.to)}
          </>
        }
        actions={
          <Button asChild variant={connectIsPrimary ? "default" : "outline"} className="min-h-11">
            <Link to="/connections" search={(previous) => previous}>
              <Plus aria-hidden="true" />
              <HeaderActionLabel label="Conectar conta" shortLabel="Conectar" />
            </Link>
          </Button>
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

      {attentionLoading ? (
        <AttentionStripSkeleton />
      ) : (
        <AttentionStrip items={attentionItems} mobile />
      )}

      <MobileNetWorthHero
        netWorth={{
          data: netWorth,
          isPending: netWorthQuery.isPending,
          isError: netWorthQuery.isError,
          error: netWorthQuery.error,
          isFetching: netWorthQuery.isFetching,
          onRetry: () => void netWorthQuery.refetch(),
        }}
        netWorthAmounts={kpis?.netWorth}
        balanceAmounts={kpis?.balance}
        kpisPending={overviewQuery.isPending}
      />

      <section aria-label="Resumo do período" className="flex flex-col gap-2">
        <SectionTitle>Resumo do período</SectionTitle>
        {overviewQuery.isError ? (
          <ErrorState
            title="Não foi possível carregar os indicadores"
            error={overviewQuery.error}
            onRetry={() => void overviewQuery.refetch()}
            isRetrying={overviewQuery.isFetching}
          />
        ) : (
          <MobileKpiGrid
            kpis={kpis}
            savingsRateValue={savingsRateValue}
            isPending={overviewQuery.isPending}
          />
        )}
      </section>

      <MobileCategoriesCard
        categories={breakdown}
        isPending={breakdownQuery.isPending}
        isError={breakdownQuery.isError}
        error={breakdownQuery.error}
        isFetching={breakdownQuery.isFetching}
        onRetry={() => void breakdownQuery.refetch()}
      />

      <OverviewCard
        data-slot="overview-monthly"
        title="Receitas vs. despesas"
        hint="Últimos 12 meses"
      >
        <div className="px-4 py-3">
          {monthlyQuery.isPending ? (
            <Skeleton className="h-48 w-full rounded-md" aria-hidden="true" />
          ) : monthlyQuery.isError ? (
            <ErrorState
              compact
              className="border-0 bg-transparent"
              title="Não foi possível carregar o resumo mensal"
              error={monthlyQuery.error}
              onRetry={() => void monthlyQuery.refetch()}
              isRetrying={monthlyQuery.isFetching}
            />
          ) : monthly.length === 0 ? (
            <EmptyState
              icon={ChartLine}
              title="Sem resumo mensal"
              description="O histórico mensal é montado a partir das transações sincronizadas."
              compact
              className="border-0 bg-transparent"
            />
          ) : (
            <IncomeExpenseBarChart data={[...monthly]} height={192} />
          )}
        </div>
      </OverviewCard>

      <MobileAccountsCard
        accounts={accountsQuery.data?.data ?? []}
        connections={connections}
        isPending={accountsQuery.isPending}
        isError={accountsQuery.isError}
        error={accountsQuery.error}
        isFetching={accountsQuery.isFetching}
        onRetry={() => void accountsQuery.refetch()}
      />

      <MobileBillsCard
        bills={bills}
        hasCreditCards={hasCreditCards}
        days={UPCOMING_BILLS_WINDOW_DAYS}
        isPending={billsQuery.isPending}
        isError={billsQuery.isError}
        error={billsQuery.error}
        isFetching={billsQuery.isFetching}
        onRetry={() => void billsQuery.refetch()}
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
  );
}
