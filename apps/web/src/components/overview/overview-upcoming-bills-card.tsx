import type { UpcomingBill } from "@fd/contracts";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CreditCard, ReceiptText } from "lucide-react";

import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { MoneyText } from "@/components/domain/money-text";
import { Skeleton } from "@/components/ui/skeleton";
import { dueLabel, upcomingBillsEmptyCopy } from "@/lib/bills";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { OverviewCard } from "./overview-card";

const MAX_BILLS = 4;

/** "2026-11-12" → "12/11": a data curta deixa "vence em N dias" inteiro. */
function formatDueDayMonth(isoDate: string): string {
  return formatDate(isoDate, "short").slice(0, 5);
}

export interface OverviewUpcomingBillsCardProps {
  bills: readonly UpcomingBill[];
  /**
   * Já existe cartão conectado: o vazio não deve pedir para conectar outro.
   * `null` enquanto os cartões carregam.
   */
  hasCreditCards: boolean | null;
  /** Janela de dias da consulta (`days`), usada no texto do vazio. */
  days?: number;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
}

function BillsSkeleton() {
  return (
    <div className="space-y-1 px-4 py-2" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex min-h-11 items-center gap-3">
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

/** Coluna lateral: próximas faturas dos cartões, com vencimento e valor. */
export function OverviewUpcomingBillsCard({
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
          search={(previous) => previous}
          className="inline-flex items-center gap-1 rounded-sm text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
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
              <li key={bill.id} className="flex min-h-11 items-center gap-3 px-4 py-2">
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-subtle-foreground"
                  aria-hidden="true"
                >
                  <CreditCard className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm leading-5 font-medium text-foreground">
                    {bill.accountName}
                    {bill.creditCardBrand ? ` · ${bill.creditCardBrand}` : ""}
                  </p>
                  <p
                    className={cn(
                      "truncate text-xs leading-4",
                      dueSoon ? "font-medium text-warning" : "text-muted-foreground",
                    )}
                    title={`${formatDate(bill.dueDate)} · ${dueLabel(bill.daysUntilDue)}${
                      bill.estimated ? " · valor estimado pelos lançamentos do ciclo" : ""
                    }`}
                  >
                    {formatDueDayMonth(bill.dueDate)} · {dueLabel(bill.daysUntilDue)}
                    {bill.estimated ? " · estimada" : ""}
                  </p>
                </div>

                <MoneyText
                  valueCents={bill.totalCents}
                  size="sm"
                  weight="medium"
                  tone="neutral"
                  className="shrink-0"
                />
              </li>
            );
          })}
        </ul>
      )}
    </OverviewCard>
  );
}
