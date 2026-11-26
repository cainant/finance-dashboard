import type { MonthlySummary, NetWorthPoint } from "@fd/contracts";
import { ChartLine, Landmark } from "lucide-react";
import { useState } from "react";

import { IncomeExpenseBarChart } from "@/components/charts/income-expense-bar-chart";
import { NetWorthAreaChart } from "@/components/charts/net-worth-area-chart";
import { DeltaBadge } from "@/components/domain/delta-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { MoneyText } from "@/components/domain/money-text";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DeltaAmounts } from "@/lib/delta";

type OverviewTab = "worth" | "flow";

/** Estado de carregamento/erro de uma série já buscada pela página. */
export interface OverviewChartState<T> {
  data: readonly T[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
}

export interface OverviewChartsCardProps {
  netWorth: OverviewChartState<NetWorthPoint>;
  monthly: OverviewChartState<MonthlySummary>;
  /** Patrimônio líquido atual, exibido no cabeçalho da aba. */
  netWorthCents: number | null | undefined;
  /** Montantes do patrimônio (atual e anterior) para a regra única do delta. */
  netWorthAmounts: DeltaAmounts | null | undefined;
}

function ChartSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-52 w-full rounded-md" />
      <div className="flex gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`size-2 shrink-0 rounded-[2px] ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Card de gráficos da Visão geral: abas "Patrimônio" e "Receitas vs. despesas",
 * um gráfico por vez. O valor do patrimônio e sua variação ficam no cabeçalho
 * da aba, já que o KPI correspondente saiu da grade.
 */
export function OverviewChartsCard({
  netWorth,
  monthly,
  netWorthCents,
  netWorthAmounts,
}: OverviewChartsCardProps) {
  const [tab, setTab] = useState<OverviewTab>("worth");

  return (
    <Card data-slot="overview-charts" className="min-w-0 gap-0">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as OverviewTab)}
        className="min-w-0 gap-0"
      >
        <div className="flex flex-col gap-2 border-b border-border-subtle px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
          <TabsList aria-label="Gráficos da visão geral" className="h-8">
            <TabsTrigger value="worth" className="h-7 px-2.5 text-[13px]">
              Patrimônio
            </TabsTrigger>
            <TabsTrigger value="flow" className="h-7 px-2.5 text-[13px]">
              Receitas vs. despesas
            </TabsTrigger>
          </TabsList>

          <div className="flex min-w-0 items-center gap-2">
            {tab === "worth" ? (
              <>
                <MoneyText
                  valueCents={netWorthCents ?? null}
                  size="sm"
                  weight="semibold"
                  tone="neutral"
                />
                {netWorthAmounts ? (
                  <DeltaBadge amounts={netWorthAmounts} label="no período" />
                ) : null}
              </>
            ) : (
              <>
                <LegendDot className="bg-chart-1" label="Receitas" />
                <LegendDot className="bg-subtle-foreground" label="Despesas" />
              </>
            )}
          </div>
        </div>

        <div className="px-4 pt-4 pb-4">
          <TabsContent value="worth" className="mt-0">
            {netWorth.isPending ? (
              <ChartSkeleton />
            ) : netWorth.isError ? (
              <ErrorState
                compact
                className="border-0 bg-transparent"
                title="Não foi possível carregar o patrimônio"
                error={netWorth.error}
                onRetry={netWorth.onRetry}
                isRetrying={netWorth.isFetching}
              />
            ) : netWorth.data.length === 0 ? (
              <EmptyState
                icon={Landmark}
                title="Sem histórico de patrimônio"
                description="Os snapshots diários de saldo aparecem depois da primeira sincronização."
                compact
                className="border-0 bg-transparent"
              />
            ) : (
              <NetWorthAreaChart data={[...netWorth.data]} />
            )}
          </TabsContent>

          <TabsContent value="flow" className="mt-0">
            {monthly.isPending ? (
              <ChartSkeleton />
            ) : monthly.isError ? (
              <ErrorState
                compact
                className="border-0 bg-transparent"
                title="Não foi possível carregar o resumo mensal"
                error={monthly.error}
                onRetry={monthly.onRetry}
                isRetrying={monthly.isFetching}
              />
            ) : monthly.data.length === 0 ? (
              <EmptyState
                icon={ChartLine}
                title="Sem resumo mensal"
                description="O histórico mensal é montado a partir das transações sincronizadas."
                compact
                className="border-0 bg-transparent"
              />
            ) : (
              <IncomeExpenseBarChart data={[...monthly.data]} />
            )}
          </TabsContent>
        </div>
      </Tabs>
    </Card>
  );
}
