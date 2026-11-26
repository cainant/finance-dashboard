import type { UpcomingBill } from "@fd/contracts";
import { Plus, ReceiptText } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { MoneyText } from "@/components/domain/money-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { billStatusMeta, dueLabel, upcomingBillsEmptyCopy } from "@/lib/bills";
import { formatDate } from "@/lib/format";

export interface UpcomingBillsCardProps {
  bills: readonly UpcomingBill[];
  /**
   * Já existe cartão na página: o vazio não deve pedir para conectar outro.
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

/** Card de vencimentos futuros (`GET /api/bills/upcoming`). */
export function UpcomingBillsCard({
  bills,
  hasCreditCards,
  days,
  isPending,
  isError,
  error,
  isFetching,
  onRetry,
}: UpcomingBillsCardProps) {
  const emptyCopy = upcomingBillsEmptyCopy(hasCreditCards, days);

  return (
    <Card data-slot="upcoming-bills" className="gap-0">
      <CardHeader className="flex h-11 flex-row items-center justify-between gap-2">
        <CardTitle>Próximas faturas</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/connections" search={(previous) => previous}>
            <Plus aria-hidden="true" />
            Conectar
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {isPending ? (
          <div className="space-y-3 px-4 py-4" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between gap-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            compact
            className="border-0 bg-transparent px-0"
            title="Não foi possível carregar as próximas faturas"
            error={error}
            onRetry={onRetry}
            isRetrying={isFetching}
          />
        ) : bills.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="Sem faturas a vencer"
            description={emptyCopy.description}
            compact
            className="border-0 bg-transparent px-0 py-6"
            action={
              emptyCopy.showConnect ? (
                <Button asChild variant="outline" size="sm">
                  <Link to="/connections" search={(previous) => previous}>
                    <Plus aria-hidden="true" />
                    Conectar instituição
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {bills.map((bill) => {
              const status = billStatusMeta(bill.status);

              return (
                <li
                  key={bill.id}
                  className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm leading-5 font-medium text-foreground">
                      {bill.accountName}
                      {bill.creditCardBrand ? ` · ${bill.creditCardBrand}` : ""}
                    </p>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {bill.estimated ? <Badge variant="secondary">estimada</Badge> : null}
                  <MoneyText
                    valueCents={bill.totalCents}
                    size="sm"
                    weight="medium"
                    tone="neutral"
                    className="shrink-0"
                  />
                  <p className="basis-full text-xs leading-4 text-muted-foreground tabular-nums">
                    {formatDate(bill.dueDate)} · {dueLabel(bill.daysUntilDue)}
                    {bill.estimated ? " · valor estimado" : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
