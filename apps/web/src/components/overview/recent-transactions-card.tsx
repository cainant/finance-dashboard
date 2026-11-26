import type { Category, Transaction } from "@fd/contracts";
import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, ArrowRight, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { MoneyText } from "@/components/domain/money-text";
import { useCategoryOrigins } from "@/components/transactions/category-origins";
import { TransactionDetailSheet } from "@/components/transactions/transaction-detail-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { transactionAccountParts } from "@/lib/accounts";
import { CategoryIcon } from "@/lib/category-icons";
import { formatDate } from "@/lib/format";

import { OverviewCard } from "./overview-card";

export interface RecentTransactionsCardProps {
  transactions: readonly Transaction[];
  categories: readonly Category[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
}

function RecentTransactionsSkeleton() {
  return (
    <div className="space-y-1 px-4 py-2" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex min-h-11 items-center gap-3">
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="h-3 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/**
 * Lista enxuta de lançamentos recentes; cada linha abre o painel lateral ali
 * mesmo, com Anterior/Próxima percorrendo a lista sem sair da Visão geral.
 */
export function RecentTransactionsCard({
  transactions,
  categories,
  isPending,
  isError,
  error,
  isFetching,
  onRetry,
}: RecentTransactionsCardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // O painel também troca categoria: a origem de outra natureza fica fixada no
  // seletor para a troca ser reversível (ver `useCategoryOrigins`).
  const { origins: categoryOrigins, remember: rememberCategoryOrigin } =
    useCategoryOrigins(categories);
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const selectedIndex = selectedId
    ? transactions.findIndex((transaction) => transaction.id === selectedId)
    : -1;
  const selectedTransaction = selectedIndex >= 0 ? (transactions[selectedIndex] ?? null) : null;
  const previousTransaction = selectedIndex > 0 ? transactions[selectedIndex - 1] : undefined;
  const nextTransaction = selectedIndex >= 0 ? transactions[selectedIndex + 1] : undefined;
  const selectedAccountLabel = selectedTransaction
    ? transactionAccountParts({
        institutionName: selectedTransaction.account?.institutionName ?? null,
        name: selectedTransaction.account?.name ?? null,
        numberMasked: selectedTransaction.account?.numberMasked ?? null,
      }).label
    : null;

  return (
    <OverviewCard
      data-slot="overview-recent-transactions"
      title="Transações recentes"
      action={
        <Link
          to="/transactions"
          search={(previous) => previous}
          className="inline-flex items-center gap-1 rounded-sm text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          Ver todas
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      }
    >
      {isPending ? (
        <RecentTransactionsSkeleton />
      ) : isError ? (
        <ErrorState
          compact
          className="border-0 bg-transparent"
          title="Não foi possível carregar as transações recentes"
          error={error}
          onRetry={onRetry}
          isRetrying={isFetching}
        />
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="Nada por aqui ainda"
          description="As transações sincronizadas aparecem nesta lista, com categoria e instituição."
          compact
          className="border-0 bg-transparent"
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {transactions.map((transaction) => {
            const category =
              transaction.category ??
              (transaction.categoryId ? categoryById.get(transaction.categoryId) : undefined) ??
              null;
            const parts = transactionAccountParts({
              institutionName: transaction.account?.institutionName ?? null,
              name: transaction.account?.name ?? null,
              numberMasked: transaction.account?.numberMasked ?? null,
            });
            const account = parts.institutionName ?? parts.accountName;

            return (
              <li key={transaction.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(transaction.id)}
                  aria-label={`Abrir detalhes de ${transaction.description}`}
                  data-slot="overview-transaction-row"
                  data-tx={transaction.id}
                  className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-150 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
                >
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-subtle-foreground"
                    aria-hidden="true"
                  >
                    {category ? (
                      <CategoryIcon name={category.icon} color={category.color} />
                    ) : (
                      <ArrowLeftRight className="size-4" />
                    )}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm leading-5 font-medium text-foreground">
                      {transaction.description}
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
                      <span className="truncate">
                        {formatDate(transaction.date)} · {category?.name ?? "Sem categoria"}
                      </span>
                      {account ? (
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span aria-hidden="true">·</span>
                          {parts.institutionName ? (
                            <InstitutionAvatar
                              name={parts.institutionName}
                              size="xs"
                              decorative
                              className="size-4 rounded-[4px] text-[8px]"
                            />
                          ) : null}
                          <span className="truncate">{account}</span>
                        </span>
                      ) : null}
                    </span>
                  </span>

                  <MoneyText
                    valueCents={transaction.amountCents}
                    tone={transaction.amountCents > 0 ? "positive" : "neutral"}
                    signDisplay="always"
                    size="sm"
                    weight="medium"
                    className="shrink-0 text-right"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <TransactionDetailSheet
        transaction={selectedTransaction}
        open={selectedTransaction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
          }
        }}
        onPrevious={previousTransaction ? () => setSelectedId(previousTransaction.id) : undefined}
        onNext={nextTransaction ? () => setSelectedId(nextTransaction.id) : undefined}
        categories={categories}
        categoryOrigins={categoryOrigins}
        onCategoryOriginChange={rememberCategoryOrigin}
        accountLabel={selectedAccountLabel}
      />
    </OverviewCard>
  );
}
