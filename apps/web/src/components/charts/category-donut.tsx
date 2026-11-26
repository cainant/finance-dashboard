import type { CategoryBreakdownItem } from "@fd/contracts";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { ChartEmpty } from "@/components/charts/chart-empty";
import { ChartTooltipContent } from "@/components/domain/chart-card";
import { MoneyText } from "@/components/domain/money-text";
import { useMoneyFormatter } from "@/components/privacy/privacy-context";
import { CategoryIcon, categoryColor } from "@/lib/category-icons";
import { formatPercent } from "@/lib/format";

export interface CategoryDonutProps {
  data: CategoryBreakdownItem[];
  totalCents: number;
  height?: number;
  maxItems?: number;
}

/**
 * Donut de despesas por categoria + lista com cor, ícone, participação e
 * valor. Categorias além de `maxItems` são agrupadas em "Outras".
 */
export function CategoryDonut({
  data,
  totalCents,
  height = 220,
  maxItems = 7,
}: CategoryDonutProps) {
  const money = useMoneyFormatter();

  if (data.length === 0) {
    return <ChartEmpty height={height} />;
  }

  const visible = data.slice(0, maxItems);
  const rest = data.slice(maxItems);

  const chartData =
    rest.length > 0
      ? [
          ...visible,
          {
            categoryId: null,
            name: "Outras",
            slug: "outras",
            icon: "CircleEllipsis",
            color: "#71717a",
            amountCents: rest.reduce((total, item) => total + item.amountCents, 0),
            percentage: rest.reduce((total, item) => total + item.percentage, 0),
            transactionCount: rest.reduce((total, item) => total + item.transactionCount, 0),
          } satisfies CategoryBreakdownItem,
        ]
      : visible;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative w-full max-w-[210px] shrink-0" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="amountCents"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {chartData.map((item) => (
                <Cell key={item.slug} fill={categoryColor(item.color)} />
              ))}
            </Pie>
            <Tooltip
              content={
                <ChartTooltipContent
                  hideLabel
                  valueFormatter={(value) => money.formatCurrency(value)}
                />
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="text-xs font-medium text-muted-foreground">Total</span>
          <MoneyText valueCents={totalCents} size="md" weight="semibold" tone="neutral" />
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2">
        {chartData.map((item) => (
          <li key={item.slug} className="flex min-h-7 items-center gap-2.5">
            <CategoryIcon name={item.icon} color={item.color} className="size-4" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{item.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatPercent(item.percentage / 100, { maximumFractionDigits: 0 })}
            </span>
            <MoneyText
              valueCents={item.amountCents}
              size="sm"
              tone="neutral"
              className="w-24 shrink-0 text-right"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
