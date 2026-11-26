import type { CategoryBreakdownItem } from "@fd/contracts";
import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { useMemo } from "react";

import { CategoryDonut } from "@/components/charts/category-donut";
import { ChartCard } from "@/components/domain/chart-card";
import { DeltaBadge } from "@/components/domain/delta-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { MoneyText } from "@/components/domain/money-text";
import { useMoneyFormatter } from "@/components/privacy/privacy-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { categoryTrends, topMovers, type CategoryTrend } from "@/lib/analytics";
import { CategoryIcon } from "@/lib/category-icons";
import { describeDelta } from "@/lib/delta";

export interface CategoryBreakdownCardProps {
  data: CategoryBreakdownItem[];
  totalCents: number;
  periodLabel: string;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
}

/** Donut das despesas por categoria no período atual. */
export function CategoryBreakdownCard({
  data,
  totalCents,
  periodLabel,
  isPending,
  isError,
  error,
  isFetching,
  onRetry,
}: CategoryBreakdownCardProps) {
  return (
    <ChartCard
      className="min-w-0"
      title="Gastos por categoria"
      description={`Participação de cada categoria · ${periodLabel}`}
      isLoading={isPending}
      isEmpty={isError || data.length === 0}
      empty={
        isError ? (
          <ErrorState
            compact
            className="border-0 bg-transparent"
            error={error}
            onRetry={onRetry}
            isRetrying={isFetching}
          />
        ) : (
          <EmptyState
            icon={TrendingDown}
            title="Sem despesas classificadas"
            description="As categorias aparecem quando houver despesas no período."
            compact
            className="border-0 bg-transparent"
          />
        )
      }
    >
      <CategoryDonut data={data} totalCents={totalCents} />
    </ChartCard>
  );
}

export interface CategoryTrendsCardProps {
  current: CategoryBreakdownItem[];
  previous: CategoryBreakdownItem[];
  currentLabel: string;
  previousLabel: string;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
}

/**
 * Maiores altas e baixas de gastos por categoria: período atual vs. anterior.
 * Em despesas, subir é ruim — por isso o `invert` nos selos de variação.
 */
export function CategoryTrendsCard({
  current,
  previous,
  currentLabel,
  previousLabel,
  isPending,
  isError,
  error,
  isFetching,
  onRetry,
}: CategoryTrendsCardProps) {
  const trends = useMemo(() => categoryTrends(current, previous), [current, previous]);
  const movers = useMemo(() => topMovers(trends, 3), [trends]);

  return (
    <Card className="min-w-0 gap-0">
      <CardHeader>
        <CardTitle>Tendências por categoria</CardTitle>
        <CardDescription>
          Comparação de gastos: {previousLabel} vs. {currentLabel}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        {isPending ? (
          <div className="space-y-3 p-4" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-7 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-4">
            <ErrorState
              compact
              className="border-0 bg-transparent px-0"
              title="Não foi possível comparar as categorias"
              error={error}
              onRetry={onRetry}
              isRetrying={isFetching}
            />
          </div>
        ) : trends.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={TrendingUp}
              title="Sem categorias para comparar"
              description="Classifique despesas nos dois períodos para ver altas e baixas de gastos."
              compact
              className="border-0 bg-transparent px-0 py-6"
            />
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            <MoverSection
              title="Maiores altas"
              icon={TrendingUp}
              tone="negative"
              trends={movers.risers}
              emptyLabel="Nenhuma categoria gastou mais que no período anterior."
            />
            <MoverSection
              title="Maiores baixas"
              icon={TrendingDown}
              tone="positive"
              trends={movers.fallers}
              emptyLabel="Nenhuma categoria reduziu o gasto no período."
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MoverSection({
  title,
  icon: Icon,
  tone,
  trends,
  emptyLabel,
}: {
  title: string;
  icon: LucideIcon;
  tone: "positive" | "negative";
  trends: CategoryTrend[];
  emptyLabel: string;
}) {
  const money = useMoneyFormatter();

  return (
    <section aria-label={title}>
      <h3 className="flex items-center gap-1.5 px-4 pt-3 pb-2 text-xs font-medium text-muted-foreground">
        <Icon
          aria-hidden="true"
          className={tone === "positive" ? "size-3.5 text-positive" : "size-3.5 text-negative"}
        />
        {title}
      </h3>

      {trends.length === 0 ? (
        <p className="px-4 pb-3 text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {trends.map((trend) => (
            <li key={trend.key} className="flex h-11 items-center gap-3 px-4">
              <span
                className="grid size-7 shrink-0 place-items-center rounded-md border border-border-subtle bg-surface-2"
                aria-hidden="true"
              >
                <CategoryIcon name={trend.icon} color={trend.color} className="size-3.5" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm leading-5 font-medium text-foreground">
                  {trend.name}
                </p>
                <p className="text-xs leading-4 text-muted-foreground tabular-nums">
                  {money.formatCurrency(trend.previousCents)} →{" "}
                  {money.formatCurrency(trend.currentCents)}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-0.5">
                {trend.previousCents === 0 ? (
                  <Badge variant="secondary">nova</Badge>
                ) : describeDelta(trend.currentCents, trend.previousCents).display === "percent" ? (
                  <DeltaBadge value={trend.deltaPercent} invert />
                ) : null}
                <MoneyText
                  valueCents={trend.deltaCents}
                  signDisplay="always"
                  size="sm"
                  tone={trend.deltaCents > 0 ? "negative" : "positive"}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
