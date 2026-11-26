import { Link } from "@tanstack/react-router";
import { ArrowRight, CreditCard, ReceiptText } from "lucide-react";

import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { MoneyText } from "@/components/domain/money-text";
import { Skeleton } from "@/components/ui/skeleton";
import { dueLabel, upcomingBillsEmptyCopy } from "@/lib/bills";
import { formatDate } from "@/lib/format";
import { periodOnlySearch } from "@/lib/overview-links";
import { cn } from "@/lib/utils";

import { RowChevron, SrDestination } from "./mobile-parts";
import { MOBILE_ROW_CLASS } from "./mobile-row-class";
import { OverviewCard } from "./overview-card";
import type { OverviewUpcomingBillsCardProps } from "./overview-upcoming-bills-card";

const MAX_BILLS = 4;

function BillsSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex min-h-14 items-center gap-3 px-4 py-2">
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
          <Skeleton className="h-3 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/**
 * Próximas faturas: cada linha abre Cartões já com o cartão e a fatura
 * selecionados (`?card=` e `?bill=`).
 */
export function MobileBillsCard({
  bills,
  hasCreditCards,
  days,
  isPending,
  isError,
  error,
  isFetching,
  onRetry,
}: OverviewUpcomingBillsCardProps) {
  return (
    <OverviewCard
      data-slot="overview-upcoming-bills"
      title="Próximas faturas"
      action={
        <Link
          to="/credit-cards"
          search={(previous) => periodOnlySearch(previous)}
          className="inline-flex min-h-11 items-center gap-1 rounded-sm px-1 text-[13px] font-medium text-muted-foreground active:text-foreground"
        >
          Ver cartões
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      }
    >
      {isPending ? (
        <BillsSkeleton />
      ) : isError ? (
        <ErrorState
          compact
          className="border-0 bg-transparent"
          title="Não foi possível carregar as próximas faturas"
          error={error}
          onRetry={onRetry}
          isRetrying={isFetching}
        />
      ) : bills.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="Sem faturas abertas"
          description={upcomingBillsEmptyCopy(hasCreditCards, days).description}
          compact
          className="border-0 bg-transparent"
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {bills.slice(0, MAX_BILLS).map((bill) => {
            const dueSoon = bill.daysUntilDue <= 7;

            return (
              <li key={bill.id}>
                <Link
                  to="/credit-cards/$accountId"
                  params={{ accountId: bill.accountId }}
                  search={(previous) => ({ ...periodOnlySearch(previous), bill: bill.id })}
                  data-slot="overview-bill-row"
                  className={MOBILE_ROW_CLASS}
                >
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-subtle-foreground"
                    aria-hidden="true"
                  >
                    <CreditCard className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm leading-5 font-medium text-foreground">
                      <SrDestination>Abrir fatura: </SrDestination>
                      {bill.accountName}
                      {bill.creditCardBrand ? ` · ${bill.creditCardBrand}` : ""}
                    </span>
                    <span
                      className={cn(
                        "truncate text-xs leading-4",
                        dueSoon ? "font-medium text-warning" : "text-muted-foreground",
                      )}
                    >
                      {formatDate(bill.dueDate, "short").slice(0, 5)} ·{" "}
                      {dueLabel(bill.daysUntilDue)}
                      {bill.estimated ? " · estimada" : ""}
                    </span>
                  </span>
                  <MoneyText
                    valueCents={bill.totalCents}
                    size="sm"
                    weight="medium"
                    tone="neutral"
                    className="shrink-0"
                  />
                  <RowChevron />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </OverviewCard>
  );
}
