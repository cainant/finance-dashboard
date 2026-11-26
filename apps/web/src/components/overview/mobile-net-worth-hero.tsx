import type { NetWorthPoint } from "@fd/contracts";
import { Link } from "@tanstack/react-router";
import { Landmark } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { NetWorthScrubChart } from "@/components/charts/net-worth-scrub-chart";
import { DeltaBadge } from "@/components/domain/delta-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { MoneyText } from "@/components/domain/money-text";
import { PeriodControl } from "@/components/domain/period-control";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DeltaAmounts } from "@/lib/delta";
import { formatDate } from "@/lib/format";

import { RowChevron, SrDestination } from "./mobile-parts";
import { MOBILE_ROW_CLASS } from "./mobile-row-class";
import type { OverviewChartState } from "./overview-charts-card";

export interface MobileNetWorthHeroProps {
  netWorth: OverviewChartState<NetWorthPoint>;
  /** Patrimônio e variação do período (KPI da API). */
  netWorthAmounts: DeltaAmounts | null | undefined;
  /** Saldo em contas e variação do período (KPI da API). */
  balanceAmounts: DeltaAmounts | null | undefined;
  kpisPending: boolean;
}

/**
 * Patrimônio em destaque. Arrastar o dedo no gráfico troca o número, a data e
 * a variação pelos do ponto sob o dedo (variação desde o início da série);
 * soltar volta ao valor atual. O único estado que muda por gesto é o índice do
 * ponto, que só re-renderiza este cabeçalho de texto: o gráfico é memoizado.
 */
export function MobileNetWorthHero({
  netWorth,
  netWorthAmounts,
  balanceAmounts,
  kpisPending,
}: MobileNetWorthHeroProps) {
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const handleScrub = useCallback((index: number | null) => setScrubIndex(index), []);

  const points = netWorth.data;
  // Referência estável para o gráfico memoizado não redesenhar a cada render.
  const chartData = useMemo(() => [...points], [points]);
  const scrubbed = scrubIndex === null ? null : (points[scrubIndex] ?? null);
  const first = points[0];

  const valueCents = scrubbed ? scrubbed.netWorthCents : (netWorthAmounts?.currentCents ?? null);
  const deltaAmounts: DeltaAmounts | null | undefined = scrubbed
    ? { currentCents: scrubbed.netWorthCents, previousCents: first?.netWorthCents }
    : netWorthAmounts;

  return (
    <Card data-slot="overview-hero" aria-label="Patrimônio" role="region" className="gap-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-3">
        <h2 className="min-w-0 truncate text-xs font-medium text-muted-foreground">
          Patrimônio total
        </h2>
        <div className="w-44 max-w-full shrink-0 sm:w-auto">
          <PeriodControl />
        </div>
      </div>

      <div className="flex flex-col gap-1 px-4 pt-2">
        {kpisPending ? (
          <div className="flex flex-col gap-1.5" aria-hidden="true">
            <Skeleton className="h-10 w-52" />
            <Skeleton className="h-5 w-32" />
          </div>
        ) : (
          <>
            <MoneyText
              data-slot="hero-value"
              valueCents={valueCents}
              weight="semibold"
              tone="neutral"
              className="block truncate text-[32px] leading-10 tracking-[-0.02em]"
            />
            <div className="flex min-h-5 min-w-0 items-center gap-2" data-slot="hero-delta">
              {deltaAmounts ? (
                <DeltaBadge
                  amounts={deltaAmounts}
                  label={scrubbed ? `até ${formatDate(scrubbed.date)}` : "no período"}
                />
              ) : null}
            </div>
          </>
        )}
      </div>

      <div className="px-4 pt-3 pb-3">
        {netWorth.isPending ? (
          <Skeleton className="aspect-[340/132] w-full rounded-md" aria-hidden="true" />
        ) : netWorth.isError ? (
          <ErrorState
            compact
            className="border-0 bg-transparent"
            title="Não foi possível carregar o patrimônio"
            error={netWorth.error}
            onRetry={netWorth.onRetry}
            isRetrying={netWorth.isFetching}
          />
        ) : chartData.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="Sem histórico de patrimônio"
            description="Os snapshots diários de saldo aparecem depois da primeira sincronização."
            compact
            className="border-0 bg-transparent"
          />
        ) : (
          <NetWorthScrubChart data={chartData} onScrub={handleScrub} />
        )}
      </div>

      <Link
        to="/accounts"
        search={(previous) => previous}
        data-slot="overview-balance-link"
        className={`${MOBILE_ROW_CLASS} rounded-b-lg border-t border-border-subtle`}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs leading-4 text-muted-foreground">Saldo em contas</span>
          {kpisPending ? (
            <Skeleton className="mt-1 h-5 w-28" aria-hidden="true" />
          ) : (
            <span className="flex min-w-0 items-center gap-2">
              <MoneyText
                valueCents={balanceAmounts?.currentCents ?? null}
                size="md"
                weight="semibold"
                tone="neutral"
                className="truncate"
              />
              {balanceAmounts ? <DeltaBadge amounts={balanceAmounts} /> : null}
            </span>
          )}
        </span>
        <SrDestination>Ver contas</SrDestination>
        <RowChevron />
      </Link>
    </Card>
  );
}
