import type { CashflowPoint, Granularity } from "@fd/contracts";
import { ChartLine } from "lucide-react";
import { useMemo } from "react";

import { CashflowBarChart } from "@/components/charts/income-expense-bar-chart";
import { ChartCard } from "@/components/domain/chart-card";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { MoneyText } from "@/components/domain/money-text";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const GRANULARITY_OPTIONS = [
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
] as const satisfies ReadonlyArray<{ value: Granularity; label: string }>;

export interface CashflowCardProps {
  data: CashflowPoint[];
  granularity: Granularity;
  onGranularityChange: (granularity: Granularity) => void;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
}

/** Fluxo de caixa com seletor acessível de granularidade (dia/semana/mês). */
export function CashflowCard({
  data,
  granularity,
  onGranularityChange,
  isPending,
  isError,
  error,
  isFetching,
  onRetry,
}: CashflowCardProps) {
  const totals = useMemo(() => {
    let incomeCents = 0;
    let expenseCents = 0;

    for (const point of data) {
      incomeCents += point.incomeCents;
      expenseCents += point.expenseCents;
    }

    return { incomeCents, expenseCents };
  }, [data]);

  return (
    <ChartCard
      className="min-w-0"
      title="Fluxo de caixa"
      description="Entradas e saídas por bucket no período"
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
            icon={ChartLine}
            title="Sem movimentação no período"
            description="Assim que houver entradas ou saídas sincronizadas, o fluxo de caixa aparece aqui."
            compact
            className="border-0 bg-transparent"
          />
        )
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Total do período</span>
          <span className="flex flex-wrap items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Entradas</span>
              <MoneyText valueCents={totals.incomeCents} size="sm" tone="positive" />
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Saídas</span>
              <MoneyText valueCents={-Math.abs(totals.expenseCents)} size="sm" tone="neutral" />
            </span>
          </span>
        </div>
      }
      actions={
        <ToggleGroup
          type="single"
          value={granularity}
          onValueChange={(value) => {
            if (value) {
              onGranularityChange(value as Granularity);
            }
          }}
          aria-label="Granularidade do fluxo de caixa"
          className="h-8"
        >
          {GRANULARITY_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              aria-label={`Agrupar por ${option.label.toLowerCase()}`}
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
    >
      <CashflowBarChart data={data} />
    </ChartCard>
  );
}
