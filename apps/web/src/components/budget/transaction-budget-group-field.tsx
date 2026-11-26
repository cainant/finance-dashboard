import type { Transaction } from "@fd/contracts";
import { useQuery } from "@tanstack/react-query";
import { useId, useMemo } from "react";

import { categoryGroupMap } from "@/lib/budget";
import { useUpdateTransactionMutation } from "@/lib/mutations";
import { budgetQueryOptions } from "@/lib/queries";
import { cn } from "@/lib/utils";

import { BudgetGroupSelect } from "./budget-group-select";

export interface TransactionBudgetGroupFieldProps {
  transaction: Transaction;
  className?: string;
  triggerClassName?: string;
}

/**
 * Grupo de metas da transação: "Da categoria" (sem exceção) ou um grupo fixo
 * só para este lançamento. Some enquanto as metas não carregam (o campo é
 * secundário no detalhe).
 */
export function TransactionBudgetGroupField({
  transaction,
  className,
  triggerClassName,
}: TransactionBudgetGroupFieldProps) {
  const labelId = useId();
  const budgetQuery = useQuery(budgetQueryOptions);
  const mutation = useUpdateTransactionMutation();
  const budget = budgetQuery.data?.data;

  const categoryGroupName = useMemo(() => {
    if (!budget || !transaction.categoryId) return null;
    const groupId = categoryGroupMap(budget).get(transaction.categoryId);
    return budget.groups.find((group) => group.id === groupId)?.name ?? null;
  }, [budget, transaction.categoryId]);

  if (!budget) return null;

  return (
    <div data-slot="transaction-budget-group" className={cn("space-y-2", className)}>
      <p id={labelId} className="text-xs font-medium text-muted-foreground">
        Grupo de metas
      </p>
      <BudgetGroupSelect
        groups={budget.groups}
        value={transaction.budgetGroupId}
        noneLabel={`Da categoria: ${categoryGroupName ?? "sem grupo"}`}
        disabled={mutation.isPending}
        onChange={(budgetGroupId) => {
          if (budgetGroupId === transaction.budgetGroupId) return;
          mutation.mutate({ id: transaction.id, budgetGroupId });
        }}
        aria-label="Grupo de metas"
        className={cn("w-full", triggerClassName)}
      />
    </div>
  );
}
