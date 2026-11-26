import type * as React from "react";

import { ChartEmpty } from "@/components/charts/chart-empty";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ChartTooltipItem {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

export interface ChartTooltipContentProps {
  active?: boolean;
  payload?: readonly ChartTooltipItem[];
  label?: string | number;
  labelFormatter?: (label: string | number) => string;
  valueFormatter?: (value: number, name: string) => string;
  hideLabel?: boolean;
  className?: string;
}

/** Tooltip padrão dos gráficos Recharts, no padrão popover do design system. */
export function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  hideLabel = false,
  className,
}: ChartTooltipContentProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div
      data-slot="chart-tooltip"
      className={cn(
        "min-w-36 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-popover",
        className,
      )}
    >
      {!hideLabel && label !== undefined && label !== null ? (
        <p className="mb-1.5 font-medium text-foreground">
          {labelFormatter ? labelFormatter(label) : String(label)}
        </p>
      ) : null}
      <div className="grid gap-1">
        {payload.map((item, index) => {
          const name = String(item.name ?? item.dataKey ?? "");
          const numeric = typeof item.value === "number" ? item.value : Number(item.value);
          const value = Number.isFinite(numeric)
            ? valueFormatter
              ? valueFormatter(numeric, name)
              : formatNumber(numeric)
            : String(item.value ?? "—");

          return (
            <div key={`${name}-${index}`} className="flex items-center gap-2">
              <span
                className="size-1.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.color ?? "var(--chart-1)" }}
                aria-hidden="true"
              />
              <span className="text-muted-foreground">{name}</span>
              <span className="ml-auto font-medium tabular-nums text-foreground">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface ChartCardProps extends Omit<React.ComponentProps<"div">, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  isLoading?: boolean;
  /** Sem dados: mostra `empty` (ou o estado "Sem dados" padrão) no lugar do gráfico. */
  isEmpty?: boolean;
  empty?: React.ReactNode;
  contentClassName?: string;
  children: React.ReactNode;
}

/**
 * Wrapper de gráfico: cabeçalho de 44px, divisória, estados de carregamento/
 * vazio e espaço consistente para Recharts. O tooltip fica em
 * `ChartTooltipContent`.
 */
export function ChartCard({
  title,
  description,
  actions,
  footer,
  isLoading = false,
  isEmpty = false,
  empty,
  contentClassName,
  className,
  children,
  ...props
}: ChartCardProps) {
  return (
    <Card data-slot="chart-card" className={cn("gap-0", className)} {...props}>
      <div className="flex h-11 items-center justify-between gap-4 border-b border-border-subtle px-4">
        <div className="min-w-0">
          <p className="truncate text-sm leading-5 font-medium text-foreground">{title}</p>
          {description ? (
            <p className="truncate text-xs leading-4 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <CardContent className={cn("px-4 pt-4 pb-4", contentClassName)}>
        {isLoading ? (
          <div className="space-y-3" aria-hidden="true">
            <Skeleton className="h-52 w-full rounded-md" />
            <div className="flex gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ) : isEmpty ? (
          (empty ?? <ChartEmpty />)
        ) : (
          children
        )}
      </CardContent>
      {footer ? (
        <div className="border-t border-border-subtle px-4 py-2.5 text-xs text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}
