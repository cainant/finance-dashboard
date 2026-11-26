import { cn } from "@/lib/utils";

export interface ChartEmptyProps {
  height?: number;
  label?: string;
  className?: string;
}

/**
 * Estado vazio de gráfico: pílula "Sem dados" sobre uma onda cinza discreta.
 * Não depende dos tokens de série para continuar legível sem dados.
 */
export function ChartEmpty({ height = 220, label = "Sem dados", className }: ChartEmptyProps) {
  return (
    <div
      data-slot="chart-empty"
      style={{ height }}
      className={cn("flex w-full items-center justify-center", className)}
    >
      <div className="relative flex w-full items-center justify-center">
        <svg
          viewBox="0 0 300 56"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-14 w-full -translate-y-1/2 text-border-subtle"
        >
          <path
            d="M0 38 C 22 22, 46 48, 70 34 S 116 14, 142 30 S 190 50, 216 34 S 268 20, 300 30"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M0 46 C 26 32, 48 52, 74 42 S 122 26, 148 38 S 198 54, 224 42 S 272 30, 300 40"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="relative inline-flex h-5 items-center gap-1 rounded-full border border-border bg-card px-2 text-xs font-medium text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}
