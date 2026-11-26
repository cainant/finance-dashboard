import type { Category, Transaction } from "@fd/contracts";
import { ArrowLeftRight } from "lucide-react";
import type { ReactNode } from "react";

import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { MoneyText } from "@/components/domain/money-text";
import { CategoryIcon } from "@/lib/category-icons";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TransactionListProps {
  transactions: readonly Transaction[];
  categories: readonly Category[];
  /** Mostra instituição/conta no subtítulo (visão consolidada). */
  showAccount?: boolean;
  empty?: ReactNode;
  className?: string;
}

/** Lista compacta de transações usada na visão geral e no detalhe da conta. */
export function TransactionList({
  transactions,
  categories,
  showAccount = false,
  empty,
  className,
}: TransactionListProps) {
  if (transactions.length === 0) {
    return <>{empty}</>;
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return (
    <ul data-slot="transaction-list" className={cn("divide-y divide-border-subtle", className)}>
      {transactions.map((transaction) => {
        const category =
          transaction.category ??
          (transaction.categoryId ? categoryById.get(transaction.categoryId) : undefined) ??
          null;

        const institutionName = showAccount ? (transaction.account?.institutionName ?? null) : null;
        const accountLabel = showAccount
          ? (institutionName ?? transaction.account?.name ?? null)
          : null;

        return (
          <li
            key={transaction.id}
            className="flex min-h-11 items-center gap-3 py-2 transition-colors duration-150 hover:bg-accent/60"
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

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm leading-5 font-medium text-foreground">
                {transaction.description}
              </p>
              <p className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
                <span className="truncate">
                  {formatDate(transaction.date)} · {category?.name ?? "Sem categoria"}
                </span>
                {accountLabel ? (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span aria-hidden="true">·</span>
                    {institutionName ? (
                      <InstitutionAvatar
                        name={institutionName}
                        size="xs"
                        decorative
                        className="size-4 rounded-[4px] text-[8px]"
                      />
                    ) : null}
                    <span className="truncate">{accountLabel}</span>
                  </span>
                ) : null}
              </p>
            </div>

            <MoneyText
              valueCents={transaction.amountCents}
              signDisplay="always"
              tone={transaction.amountCents > 0 ? "positive" : "neutral"}
              size="sm"
              weight="medium"
              className="shrink-0 text-right"
            />
          </li>
        );
      })}
    </ul>
  );
}
