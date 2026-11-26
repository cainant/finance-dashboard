import type { MonthlySummary } from "@fd/contracts";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartEmpty } from "@/components/charts/chart-empty";
import { ChartTooltipContent } from "@/components/domain/chart-card";
import { useMoneyFormatter } from "@/components/privacy/privacy-context";
import { formatDate, formatDayMonth, formatMonthShort } from "@/lib/format";

/** Cores das séries: receita no acento azul, despesa em cinza neutro. */
export const INCOME_SERIES_COLOR = "var(--chart-1)";
export const EXPENSE_SERIES_COLOR = "var(--subtle-foreground)";

export interface IncomeExpenseBarChartProps {
  data: MonthlySummary[];
  height?: number;
}

/** Barras mensais de receitas x despesas (12 meses por padrão). */
export function IncomeExpenseBarChart({ data, height = 260 }: IncomeExpenseBarChartProps) {
  const money = useMoneyFormatter();

  if (data.length === 0) {
    return <ChartEmpty height={height} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          minTickGap={16}
          tickMargin={8}
          tickFormatter={(value: string) => formatMonthShort(value)}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={64}
          tickMargin={6}
          tickFormatter={(value: number) => money.formatAxis(value)}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <Tooltip
          cursor={{ fill: "var(--accent)", opacity: 0.6 }}
          content={
            <ChartTooltipContent
              labelFormatter={(label) => formatMonthShort(String(label))}
              valueFormatter={(value) => money.formatCurrency(value)}
            />
          }
        />
        <Bar
          dataKey="incomeCents"
          name="Receitas"
          fill={INCOME_SERIES_COLOR}
          radius={[2, 2, 0, 0]}
          maxBarSize={20}
          isAnimationActive={false}
        />
        <Bar
          dataKey="expenseCents"
          name="Despesas"
          fill={EXPENSE_SERIES_COLOR}
          radius={[2, 2, 0, 0]}
          maxBarSize={20}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barras de fluxo de caixa por bucket (dia/semana/mês) para Análises. */
export function CashflowBarChart({
  data,
  height = 260,
}: {
  data: Array<{ date: string; incomeCents: number; expenseCents: number }>;
  height?: number;
}) {
  const money = useMoneyFormatter();

  if (data.length === 0) {
    return <ChartEmpty height={height} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} barGap={1}>
        <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          minTickGap={24}
          tickMargin={8}
          tickFormatter={(value: string) => formatDayMonth(value)}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={64}
          tickMargin={6}
          tickFormatter={(value: number) => money.formatAxis(value)}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <Tooltip
          cursor={{ fill: "var(--accent)", opacity: 0.6 }}
          content={
            <ChartTooltipContent
              labelFormatter={(label) => formatDate(String(label))}
              valueFormatter={(value) => money.formatCurrency(value)}
            />
          }
        />
        <Bar
          dataKey="incomeCents"
          name="Entradas"
          fill={INCOME_SERIES_COLOR}
          radius={[2, 2, 0, 0]}
          maxBarSize={18}
          isAnimationActive={false}
        />
        <Bar
          dataKey="expenseCents"
          name="Saídas"
          fill={EXPENSE_SERIES_COLOR}
          radius={[2, 2, 0, 0]}
          maxBarSize={18}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
