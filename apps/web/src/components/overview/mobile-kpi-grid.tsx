import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { DeltaBadge } from "@/components/domain/delta-badge";
import { MoneyText } from "@/components/domain/money-text";
import { useMoneyFormatter } from "@/components/privacy/privacy-context";
import { Skeleton } from "@/components/ui/skeleton";
import type { DeltaAmounts } from "@/lib/delta";
import { formatPercent } from "@/lib/format";
import { transactionsLinkSearch, periodOnlySearch } from "@/lib/overview-links";
import { cn } from "@/lib/utils";

import { kpiValueSizeClass } from "@/lib/kpi-value-size";
import { RowChevron, SrDestination } from "./mobile-parts";

const TILE_CLASS = cn(
  "flex min-h-[92px] min-w-0 flex-col gap-1 rounded-lg border border-border bg-card p-3",
  "transition-colors duration-150 active:bg-accent",
  "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
);

function TileBody({
  label,
  destination,
  value,
  delta,
}: {
  label: string;
  /** Texto só para leitor de tela: para onde o link leva. */
  destination: string;
  value: ReactNode;
  delta: ReactNode;
}) {
  return (
    <>
      <span className="flex min-w-0 items-center justify-between gap-1">
        <span className="truncate text-xs leading-4 font-medium text-muted-foreground">
          {label}
        </span>
        <RowChevron className="size-3.5" />
      </span>
      {value}
      <span className="flex min-h-5 min-w-0 items-center">{delta}</span>
      <SrDestination>{destination}</SrDestination>
    </>
  );
}

function MoneyValue({ cents }: { cents: number }) {
  const money = useMoneyFormatter();

  return (
    <MoneyText
      valueCents={cents}
      weight="semibold"
      tone="neutral"
      className={cn(
        "block max-w-full min-w-0 tracking-[-0.02em] whitespace-nowrap",
        kpiValueSizeClass(money.formatCurrency(cents)),
      )}
    />
  );
}

export interface MobileKpiGridProps {
  kpis:
    | {
        income: DeltaAmounts & { currentCents: number };
        expenses: DeltaAmounts & { currentCents: number };
        result: DeltaAmounts & { currentCents: number };
      }
    | undefined;
  /** Taxa de poupança (fração 0–1) ou `null` sem receita. */
  savingsRateValue: number | null;
  isPending: boolean;
}

/** Skeleton com a mesma altura dos tiles, para a grade não pular ao carregar. */
export function MobileKpiGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className={cn(TILE_CLASS, "gap-2")}>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

/**
 * Resumo do período em grade 2×2. Cada tile é um link: Receitas e Despesas
 * abrem Transações filtradas por tipo; Resultado e Poupança abrem Análises. O
 * período vem da URL e é repassado a todos os destinos.
 */
export function MobileKpiGrid({ kpis, savingsRateValue, isPending }: MobileKpiGridProps) {
  if (isPending || !kpis) {
    return <MobileKpiGridSkeleton />;
  }

  return (
    <div data-slot="overview-kpis" className="grid grid-cols-2 gap-3">
      <Link
        to="/transactions"
        search={(previous) => transactionsLinkSearch(previous, { type: "income" })}
        data-slot="kpi-link"
        className={TILE_CLASS}
      >
        <TileBody
          label="Receitas"
          destination="Ver entradas em Transações"
          value={<MoneyValue cents={kpis.income.currentCents} />}
          delta={<DeltaBadge amounts={kpis.income} />}
        />
      </Link>

      <Link
        to="/transactions"
        search={(previous) => transactionsLinkSearch(previous, { type: "expense" })}
        data-slot="kpi-link"
        className={TILE_CLASS}
      >
        <TileBody
          label="Despesas"
          destination="Ver saídas em Transações"
          value={<MoneyValue cents={kpis.expenses.currentCents} />}
          delta={<DeltaBadge amounts={kpis.expenses} invert />}
        />
      </Link>

      <Link
        to="/analytics"
        search={(previous) => periodOnlySearch(previous)}
        data-slot="kpi-link"
        className={TILE_CLASS}
      >
        <TileBody
          label="Resultado"
          destination="Ver Análises"
          value={<MoneyValue cents={kpis.result.currentCents} />}
          delta={<DeltaBadge amounts={kpis.result} />}
        />
      </Link>

      <Link
        to="/analytics"
        search={(previous) => periodOnlySearch(previous)}
        data-slot="kpi-link"
        className={TILE_CLASS}
      >
        <TileBody
          label="Poupança"
          destination="Ver Análises"
          value={
            <span
              className={cn(
                "block max-w-full min-w-0 text-xl leading-7 font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums",
                savingsRateValue === null && "text-muted-foreground",
              )}
            >
              {savingsRateValue === null ? "—" : formatPercent(savingsRateValue)}
            </span>
          }
          delta={
            <span className="truncate text-xs leading-4 text-muted-foreground">
              da receita guardada
            </span>
          }
        />
      </Link>
    </div>
  );
}
