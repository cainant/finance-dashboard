import type { MonthlySummary } from "@fd/contracts";
import { ChartLine } from "lucide-react";
import { useMemo } from "react";

import { IncomeExpenseBarChart } from "@/components/charts/income-expense-bar-chart";
import { ChartCard } from "@/components/domain/chart-card";
import { DeltaBadge } from "@/components/domain/delta-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { MoneyText } from "@/components/domain/money-text";
import { monthlyVariations } from "@/lib/analytics";
import { formatMonthShort } from "@/lib/format";

export interface MonthlyComparisonCardProps {
  data: MonthlySummary[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
}

/**
 * Barras dos últimos 12 meses + tabela com a variação de cada mês contra o
 * anterior (receitas, despesas e resultado).
 */
export function MonthlyComparisonCard({
  data,
  isPending,
  isError,
  error,
  isFetching,
  onRetry,
}: MonthlyComparisonCardProps) {
  const variations = useMemo(() => monthlyVariations(data), [data]);
  const recent = useMemo(() => [...variations].reverse().slice(0, 6), [variations]);

  return (
    <ChartCard
      className="min-w-0"
      contentClassName="p-0"
      title="Receitas vs. despesas"
      description="Últimos 12 meses, com variação mês a mês"
      isLoading={isPending}
      isEmpty={isError || data.length === 0}
      empty={
        isError ? (
          <div className="p-4">
            <ErrorState
              compact
              className="border-0 bg-transparent"
              error={error}
              onRetry={onRetry}
              isRetrying={isFetching}
            />
          </div>
        ) : (
          <div className="p-4">
            <EmptyState
              icon={ChartLine}
              title="Sem resumo mensal"
              description="O histórico mensal é montado a partir das transações sincronizadas."
              compact
              className="border-0 bg-transparent"
            />
          </div>
        )
      }
    >
      <div className="px-4 pt-4 pb-2">
        <IncomeExpenseBarChart data={data} />
      </div>

      <div
        data-slot="monthly-comparison-table"
        className="overflow-x-auto border-t border-border-subtle"
      >
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Variação mensal de receitas, despesas e resultado em relação ao mês anterior
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="h-10 bg-background px-4 text-left text-[13px] font-medium whitespace-nowrap text-muted-foreground"
              >
                Mês
              </th>
              <th
                scope="col"
                className="hidden h-10 bg-background px-4 text-right text-[13px] font-medium whitespace-nowrap text-muted-foreground sm:table-cell"
              >
                Receitas
              </th>
              <th
                scope="col"
                className="h-10 bg-background px-4 text-right text-[13px] font-medium whitespace-nowrap text-muted-foreground"
              >
                Δ receitas
              </th>
              <th
                scope="col"
                className="hidden h-10 bg-background px-4 text-right text-[13px] font-medium whitespace-nowrap text-muted-foreground sm:table-cell"
              >
                Despesas
              </th>
              <th
                scope="col"
                className="h-10 bg-background px-4 text-right text-[13px] font-medium whitespace-nowrap text-muted-foreground"
              >
                Δ despesas
              </th>
              <th
                scope="col"
                className="h-10 bg-background px-4 text-right text-[13px] font-medium whitespace-nowrap text-muted-foreground"
              >
                Resultado
              </th>
              <th
                scope="col"
                className="hidden h-10 bg-background px-4 text-right text-[13px] font-medium whitespace-nowrap text-muted-foreground sm:table-cell"
              >
                Δ resultado
              </th>
            </tr>
          </thead>
          <tbody>
            {recent.map((month) => (
              <tr
                key={month.month}
                className="border-b border-border-subtle last:border-0 hover:bg-accent/40"
              >
                <th
                  scope="row"
                  className="h-11 px-4 text-left text-sm font-medium whitespace-nowrap text-foreground"
                >
                  {formatMonthShort(month.month)}
                </th>
                <td className="hidden h-11 px-4 text-right whitespace-nowrap sm:table-cell">
                  <MoneyText valueCents={month.incomeCents} size="sm" tone="neutral" />
                </td>
                <td className="h-11 px-4 whitespace-nowrap">
                  <div className="flex justify-end">
                    <DeltaBadge
                      amounts={{
                        currentCents: month.incomeCents,
                        previousCents: month.previous?.incomeCents ?? null,
                      }}
                    />
                  </div>
                </td>
                <td className="hidden h-11 px-4 text-right whitespace-nowrap sm:table-cell">
                  <MoneyText valueCents={month.expenseCents} size="sm" tone="neutral" />
                </td>
                <td className="h-11 px-4 whitespace-nowrap">
                  <div className="flex justify-end">
                    <DeltaBadge
                      amounts={{
                        currentCents: month.expenseCents,
                        previousCents: month.previous?.expenseCents ?? null,
                      }}
                      invert
                    />
                  </div>
                </td>
                <td className="h-11 px-4 text-right whitespace-nowrap">
                  <MoneyText
                    valueCents={month.netCents}
                    size="sm"
                    weight="semibold"
                    tone={month.netCents < 0 ? "negative" : "neutral"}
                  />
                </td>
                <td className="hidden h-11 px-4 whitespace-nowrap sm:table-cell">
                  <div className="flex justify-end">
                    <DeltaBadge
                      amounts={{
                        currentCents: month.netCents,
                        previousCents: month.previous?.netCents ?? null,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-border-subtle px-4 py-2.5 text-xs leading-4 text-muted-foreground">
        Últimos 6 meses, do mais recente para o mais antigo. Δ = variação vs. mês anterior; sem base
        comparável (base zero ou pequena, sinal trocado ou percentual extremo), mostra a diferença
        em reais. "—" quando não há base de comparação.
      </p>
    </ChartCard>
  );
}
