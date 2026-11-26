import { Link } from "@tanstack/react-router";
import { ArrowRight, ReceiptText } from "lucide-react";

import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { MoneyText } from "@/components/domain/money-text";
import { Skeleton } from "@/components/ui/skeleton";
import { categoryColor } from "@/lib/category-icons";
import { formatPercentPoints } from "@/lib/format";
import { periodOnlySearch, transactionsLinkSearch } from "@/lib/overview-links";
import { cn } from "@/lib/utils";

import { RowChevron, SrDestination } from "./mobile-parts";
import { MOBILE_ROW_CLASS } from "./mobile-row-class";
import { OverviewCard } from "./overview-card";
import type { OverviewCategoriesCardProps } from "./overview-categories-card";

const MAX_CATEGORIES = 5;

function CategoriesSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: MAX_CATEGORIES }).map((_, index) => (
        <div key={index} className="flex min-h-14 flex-col justify-center gap-2 px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * "Para onde foi o dinheiro": cada categoria é um link para Transações com
 * `categoryId`, `type=expense` e o período atual; valor e percentual ficam na
 * própria linha e a barra mostra a proporção.
 */
export function MobileCategoriesCard({
  categories,
  isPending,
  isError,
  error,
  isFetching,
  onRetry,
}: OverviewCategoriesCardProps) {
  return (
    <OverviewCard
      data-slot="overview-categories"
      title="Para onde foi o dinheiro"
      action={
        <Link
          to="/analytics"
          search={(previous) => periodOnlySearch(previous)}
          className="inline-flex min-h-11 items-center gap-1 rounded-sm px-1 text-[13px] font-medium text-muted-foreground active:text-foreground"
        >
          Análises
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      }
    >
      {isPending ? (
        <CategoriesSkeleton />
      ) : isError ? (
        <ErrorState
          compact
          className="border-0 bg-transparent"
          title="Não foi possível carregar as categorias"
          error={error}
          onRetry={onRetry}
          isRetrying={isFetching}
        />
      ) : categories.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="Nenhuma despesa classificada"
          description="As categorias aparecem quando houver despesas no período."
          compact
          className="border-0 bg-transparent"
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {categories.slice(0, MAX_CATEGORIES).map((category) => {
            const color = categoryColor(category.color);

            return (
              <li key={category.slug}>
                <Link
                  to="/transactions"
                  search={(previous) =>
                    transactionsLinkSearch(previous, {
                      type: "expense",
                      categoryId: category.categoryId,
                    })
                  }
                  data-slot="overview-category-row"
                  className={cn(MOBILE_ROW_CLASS, "flex-col items-stretch justify-center gap-1.5")}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm leading-5 text-foreground">
                      <SrDestination>Ver transações de </SrDestination>
                      {category.name}
                    </span>
                    <MoneyText
                      valueCents={category.amountCents}
                      size="sm"
                      weight="medium"
                      tone="neutral"
                      className="shrink-0"
                    />
                    <span className="w-9 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {formatPercentPoints(category.percentage, { maximumFractionDigits: 0 })}
                    </span>
                    <RowChevron />
                  </span>
                  <span
                    className="block h-1.5 overflow-hidden rounded-full bg-border-subtle"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, category.percentage))}%`,
                        backgroundColor: color,
                      }}
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </OverviewCard>
  );
}
