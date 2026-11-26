import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, ReceiptText } from "lucide-react";

import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { MoneyText } from "@/components/domain/money-text";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "@/lib/category-icons";
import { formatDate } from "@/lib/format";
import { billTransactionsQueryOptions } from "@/lib/queries";
import { cn } from "@/lib/utils";

export interface BillTransactionsPanelProps {
  billId: string | null;
  /** Rótulo curto da fatura selecionada (ex.: "vencimento 05/12"). */
  billLabel?: string;
}

/**
 * Lançamentos da fatura selecionada (`GET /api/bills/:id/transactions`).
 * O painel cuida do próprio carregamento/erro/vazio para a página ficar enxuta.
 */
export function BillTransactionsPanel({ billId, billLabel }: BillTransactionsPanelProps) {
  const transactionsQuery = useQuery({
    ...billTransactionsQueryOptions(billId ?? ""),
    enabled: Boolean(billId),
  });

  const transactions = transactionsQuery.data?.data ?? [];

  return (
    <Card data-slot="bill-transactions" className="gap-0">
      <CardHeader className="flex h-11 flex-row items-center justify-between gap-3">
        <CardTitle>Lançamentos da fatura</CardTitle>
        <span className="truncate text-xs text-muted-foreground">
          {billLabel ? `Fatura de ${billLabel}` : "Selecione uma fatura"}
        </span>
      </CardHeader>

      <CardContent className="p-0">
        {!billId ? (
          <EmptyState
            icon={ReceiptText}
            title="Nenhuma fatura selecionada"
            description="Escolha uma fatura na lista para abrir os lançamentos que a compõem."
            compact
            className="border-0 bg-transparent px-0 py-6"
          />
        ) : transactionsQuery.isPending ? (
          <div className="space-y-3 px-4 py-4" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2.5 w-1/3" />
                </div>
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ) : transactionsQuery.isError ? (
          <ErrorState
            compact
            className="border-0 bg-transparent px-0"
            title="Não foi possível carregar os lançamentos"
            error={transactionsQuery.error}
            onRetry={() => void transactionsQuery.refetch()}
            isRetrying={transactionsQuery.isFetching}
          />
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="Fatura sem lançamentos"
            description="A fatura existe, mas nenhuma transação foi vinculada a ela na sincronização."
            compact
            className="border-0 bg-transparent px-0 py-6"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {transactions.map((transaction, index) => (
              <li
                key={transaction.id}
                className={cn(
                  "flex min-h-11 items-center gap-3 px-4 py-2 transition-colors duration-150 hover:bg-accent/60",
                  index === transactions.length - 1 && "rounded-b-[7px]",
                )}
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-subtle-foreground"
                  aria-hidden="true"
                >
                  {transaction.category ? (
                    <CategoryIcon
                      name={transaction.category.icon}
                      color={transaction.category.color}
                    />
                  ) : (
                    <ArrowLeftRight className="size-4" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm leading-5 font-medium text-foreground">
                    {transaction.description}
                  </p>
                  <p className="truncate text-xs leading-4 text-muted-foreground">
                    {formatDate(transaction.date)} · {transaction.category?.name ?? "Sem categoria"}
                  </p>
                </div>

                <MoneyText
                  valueCents={transaction.amountCents}
                  signDisplay="always"
                  size="sm"
                  weight="medium"
                  tone={transaction.amountCents > 0 ? "positive" : "neutral"}
                  className="shrink-0 text-right"
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
