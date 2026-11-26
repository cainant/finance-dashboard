import type { LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";

import { DeltaBadge } from "@/components/domain/delta-badge";
import { MoneyText, type MoneyTone } from "@/components/domain/money-text";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DeltaAmounts } from "@/lib/delta";
import { describeDelta, describePercentDelta } from "@/lib/delta";
import { formatDate, formatNumber, formatPercent, formatPercentPoints } from "@/lib/format";
import { cn } from "@/lib/utils";

type SparklineTone = "primary" | "positive" | "negative" | "neutral";

const SPARKLINE_TONE: Record<SparklineTone, string> = {
  primary: "text-chart-1",
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-subtle-foreground",
};

interface SparklineProps {
  data: readonly number[];
  tone?: SparklineTone;
  className?: string;
}

function Sparkline({ data, tone = "primary", className }: SparklineProps) {
  const rawId = useId();
  const gradientId = `spark-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  if (data.length < 2) {
    return null;
  }

  const width = 100;
  const height = 40;
  const padding = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / span) * (height - padding * 2);
    return { x, y };
  });

  const line = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = `M ${points[0]!.x.toFixed(2)} ${height} L ${line.replaceAll(",", " ")} L ${points[points.length - 1]!.x.toFixed(2)} ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block h-12 w-full", SPARKLINE_TONE[tone], className)}
      role="img"
      aria-label="Tendência do período"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.12" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export interface KpiCardProps {
  label: string;
  /** Valor em centavos; `null` mostra "—" (aguardando dados). */
  valueCents?: number | null;
  /**
   * Formato do KPI. `currency` (padrão) usa `valueCents`; os demais usam
   * `value` (percent: ver `percentScale`; date: ISO/timestamp; number: número
   * puro).
   */
  format?: "currency" | "percent" | "number" | "date";
  value?: number | string | null;
  /**
   * Como interpretar `value` quando `format="percent"`.
   * - `ratio` (padrão): fração 0–1 calculada no web (`0.124` → 12,4%);
   * - `points`: pontos percentuais da API (`2.9` → 2,9%).
   */
  percentScale?: "ratio" | "points";
  /**
   * Variação em **pontos percentuais**, a convenção de `deltaPercent` da API:
   * `2.9` → 2,9%.
   */
  delta?: number | null;
  /**
   * Montantes do KPI (atual e anterior). Quando informado, tem precedência
   * sobre `delta` e aplica a regra única de `describeDelta` — base zero, sinais
   * opostos ou percentual absurdo viram diferença absoluta em reais.
   */
  deltaAmounts?: DeltaAmounts | null;
  deltaLabel?: string;
  /** Em despesas, subir é ruim. */
  invertDelta?: boolean;
  /**
   * Cor do valor monetário. O padrão é `neutral`: o KPI não colore o valor;
   * só o delta carrega sentimento. Props explícitas continuam valendo.
   */
  tone?: MoneyTone;
  /** Aceito por compatibilidade; o redesign não usa ícone decorativo em caixa. */
  icon?: LucideIcon;
  hint?: ReactNode;
  sparkline?: readonly number[];
  /** Alias semântico de `sparkline` (série usada no sparkline). */
  series?: readonly number[];
  sparklineTone?: SparklineTone;
  isLoading?: boolean;
  className?: string;
  footer?: ReactNode;
}

const KPI_VALUE_CLASS =
  "block min-w-0 max-w-full truncate text-2xl leading-8 font-semibold tracking-[-0.02em]";

function KpiValue({
  format,
  percentScale,
  value,
}: {
  format: Exclude<NonNullable<KpiCardProps["format"]>, "currency">;
  percentScale: NonNullable<KpiCardProps["percentScale"]>;
  value: KpiCardProps["value"];
}) {
  if (value === null || value === undefined || value === "") {
    return <span className={cn(KPI_VALUE_CLASS, "text-muted-foreground")}>—</span>;
  }

  switch (format) {
    case "percent":
      return (
        <span className={cn(KPI_VALUE_CLASS, "tabular-nums")}>
          {percentScale === "points"
            ? formatPercentPoints(Number(value))
            : formatPercent(Number(value))}
        </span>
      );
    case "date":
      return <span className={KPI_VALUE_CLASS}>{formatDate(value)}</span>;
    case "number":
      return (
        <span className={cn(KPI_VALUE_CLASS, "tabular-nums")}>{formatNumber(Number(value))}</span>
      );
  }
}

/**
 * Cartão de KPI: rótulo 12px, valor 24px/600 em `foreground`, variação 13px com
 * seta (única cor semântica) sempre em linha própria abaixo do valor — assim o
 * selo fica na mesma altura em todos os cards, independente do tamanho do
 * valor — e sparkline em área colada à base quando houver série. A linha do
 * selo é reservada mesmo em card sem delta (`kpi-delta` com altura mínima),
 * para a legenda não subir e desalinhar dos vizinhos. A legenda (contexto do
 * delta ou `hint`) quebra em até duas linhas, sem reticências.
 * A altura mínima de 148px só vale quando há sparkline; o conteúdo já passa
 * disso nos cards com selo + legenda, então ela só evita o card colapsar
 * enquanto carrega ou quando não há série nem legenda. Recebe dados via props
 * (sem fetch).
 */
export function KpiCard({
  label,
  valueCents,
  format = "currency",
  value,
  percentScale = "ratio",
  delta,
  deltaAmounts,
  deltaLabel = "vs. período anterior",
  invertDelta = false,
  tone,
  icon: Icon,
  hint,
  sparkline,
  series,
  sparklineTone = "primary",
  isLoading = false,
  className,
  footer,
}: KpiCardProps) {
  const chartData = series ?? sparkline;
  // A regra única decide se há delta: base 0 com valor 0 cai em "none" e o
  // card volta a mostrar o hint (como antes de existir o selo).
  const deltaDescriptor = deltaAmounts
    ? describeDelta(deltaAmounts.currentCents, deltaAmounts.previousCents)
    : describePercentDelta(delta);
  const hasDelta = deltaDescriptor.display !== "none";
  const hasSparkline = Boolean(chartData && chartData.length > 1);
  const legend = hasDelta ? deltaLabel : hint;
  const legendTitle = typeof legend === "string" ? legend : undefined;

  return (
    <Card
      data-slot="kpi-card"
      aria-busy={isLoading || undefined}
      className={cn(
        "@container relative min-w-0 gap-0",
        hasSparkline && "min-h-[148px]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1 p-4 pb-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {Icon ? (
            <Icon aria-hidden="true" className="size-3.5 shrink-0 text-subtle-foreground" />
          ) : null}
          <span className="truncate text-xs leading-4 font-medium text-muted-foreground">
            {label}
          </span>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-1 pt-1" aria-hidden="true">
            <Skeleton className="h-8 w-32" />
            {/* Linha do selo: reservada para o card não encolher ao carregar. */}
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : (
          <>
            <div data-slot="kpi-value" className="min-w-0">
              {format === "currency" ? (
                <MoneyText
                  valueCents={valueCents ?? null}
                  weight="semibold"
                  tone={tone}
                  className={KPI_VALUE_CLASS}
                />
              ) : (
                <KpiValue format={format} percentScale={percentScale} value={value} />
              )}
            </div>
            {hasDelta || legend ? (
              <>
                <div
                  data-slot="kpi-delta"
                  aria-hidden={hasDelta ? undefined : true}
                  className="flex min-h-5 min-w-0 items-center self-start"
                >
                  {hasDelta ? (
                    deltaAmounts ? (
                      <DeltaBadge amounts={deltaAmounts} invert={invertDelta} />
                    ) : (
                      <DeltaBadge value={delta} invert={invertDelta} />
                    )
                  ) : null}
                </div>
                {legend ? (
                  <span
                    data-slot="kpi-caption"
                    title={legendTitle}
                    className="line-clamp-2 text-xs leading-4 text-muted-foreground"
                  >
                    {legend}
                  </span>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>

      {chartData && chartData.length > 1 ? (
        <Sparkline data={chartData} tone={sparklineTone} className="mt-auto" />
      ) : null}

      {footer ? (
        <div className="border-t border-border-subtle px-4 py-2.5 text-xs text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}
