import type { CategoryBreakdownItem } from "@fd/contracts";
import { Link } from "@tanstack/react-router";
import { ReceiptText } from "lucide-react";

import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { categoryColor } from "@/lib/category-icons";
import { formatPercentPoints } from "@/lib/format";

import { OverviewCard } from "./overview-card";

const MAX_CATEGORIES = 5;

export interface OverviewCategoriesCardProps {
  categories: readonly CategoryBreakdownItem[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
}

function CategoriesSkeleton() {
  return (
    <div className="space-y-3 px-4 py-3" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-8" />
          </div>
          <Skeleton className="h-1 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Coluna lateral: despesas por categoria em barras horizontais. Cada categoria
 * é um link para Transações já filtrado por `categoryId`.
 */
export function OverviewCategoriesCard({
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
      title="Despesas por categoria"
      hint="Clique para filtrar"
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
        <ul className="px-2 py-1">
          {categories.slice(0, MAX_CATEGORIES).map((category) => {
            const color = categoryColor(category.color);

            return (
              <li key={category.slug}>
                <Link
                  to="/transactions"
                  search={(previous) =>
                    category.categoryId
                      ? { ...previous, categoryId: category.categoryId }
                      : previous
                  }
                  data-slot="overview-category-row"
                  className="block rounded-md px-2 py-2 transition-colors duration-150 hover:bg-accent/60"
                >
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-[13px] leading-5 text-foreground">
                        {category.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatPercentPoints(category.percentage, { maximumFractionDigits: 0 })}
                    </span>
                  </span>
                  <span
                    className="mt-2 block h-1 overflow-hidden rounded-full bg-border-subtle"
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
