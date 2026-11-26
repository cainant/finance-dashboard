import type { NetWorthPoint } from "@fd/contracts";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartEmpty } from "@/components/charts/chart-empty";
import { chartAxis } from "@/components/charts/chart-domain";
import { ChartTooltipContent } from "@/components/domain/chart-card";
import { useMoneyFormatter } from "@/components/privacy/privacy-context";
import { formatDate, formatDayMonth } from "@/lib/format";

export interface NetWorthAreaChartProps {
  data: NetWorthPoint[];
  height?: number;
  dataKey?: "netWorthCents" | "assetsCents";
  name?: string;
}

/**
 * Área de evolução patrimonial: linha de 1,5px `chart-1`, área a 12%, grade
 * horizontal sutil e eixo Y à direita (padrão do painel).
 */
export function NetWorthAreaChart({
  data,
  height = 260,
  dataKey = "netWorthCents",
  name = "Patrimônio",
}: NetWorthAreaChartProps) {
  const money = useMoneyFormatter();
  const axis = useMemo(() => chartAxis(data.map((point) => point[dataKey])), [data, dataKey]);

  if (data.length === 0) {
    return <ChartEmpty height={height} />;
  }

  const gradientId = `net-worth-${dataKey}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.12} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          minTickGap={28}
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
          domain={axis?.domain}
          ticks={axis?.ticks}
          tickFormatter={(value: number) => money.formatAxis(value)}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <Tooltip
          cursor={{ stroke: "var(--border-subtle)" }}
          content={
            <ChartTooltipContent
              labelFormatter={(label) => formatDate(String(label))}
              valueFormatter={(value) => money.formatCurrency(value)}
            />
          }
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke="var(--chart-1)"
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={data.length === 1 ? { r: 3 } : false}
          activeDot={{ r: 3, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface BalancePoint {
  date: string;
  balanceCents: number;
}

/** Área de saldo de uma conta (série derivada do saldo atual e das transações). */
export function BalanceAreaChart({
  data,
  height = 220,
}: {
  data: BalancePoint[];
  height?: number;
}) {
  const money = useMoneyFormatter();
  const axis = useMemo(() => chartAxis(data.map((point) => point.balanceCents)), [data]);

  if (data.length === 0) {
    return <ChartEmpty height={height} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="account-balance-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.12} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          minTickGap={28}
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
          domain={axis?.domain}
          ticks={axis?.ticks}
          tickFormatter={(value: number) => money.formatAxis(value)}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <Tooltip
          cursor={{ stroke: "var(--border-subtle)" }}
          content={
            <ChartTooltipContent
              labelFormatter={(label) => formatDate(String(label))}
              valueFormatter={(value) => money.formatCurrency(value)}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="balanceCents"
          name="Saldo"
          stroke="var(--chart-1)"
          strokeWidth={1.5}
          fill="url(#account-balance-fill)"
          dot={data.length === 1 ? { r: 3 } : false}
          activeDot={{ r: 3, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
