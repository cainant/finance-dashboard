import type { Budget, Category } from "@fd/contracts";
import { useMemo } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { categoryGroupMap } from "@/lib/budget";
import { CategoryIcon } from "@/lib/category-icons";
import { useUpdateBudgetCategoryMutation } from "@/lib/mutations";

import { BudgetGroupSelect } from "./budget-group-select";

export interface CategoryGroupsCardProps {
  budget: Budget;
  categories: readonly Category[];
}

/**
 * Grupo padrão de cada categoria de despesa. Salva na hora; uma transação
 * específica pode ter outro grupo pelo detalhe da transação.
 */
export function CategoryGroupsCard({ budget, categories }: CategoryGroupsCardProps) {
  const mutation = useUpdateBudgetCategoryMutation();
  const map = useMemo(() => categoryGroupMap(budget), [budget]);
  const expenseCategories = useMemo(
    () =>
      categories
        .filter((category) => category.kind === "expense")
        .toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [categories],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categorias por grupo</CardTitle>
        <CardDescription>
          Compras e parcelas entram no grupo da categoria; dá para trocar uma transação no detalhe
          dela.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="grid grid-cols-1 divide-y divide-border-subtle md:grid-cols-2 md:divide-y-0">
          {expenseCategories.map((category) => (
            <li
              key={category.id}
              data-slot="category-group-row"
              className="flex min-h-12 items-center gap-3 border-border-subtle px-4 py-2 md:border-b"
            >
              <CategoryIcon name={category.icon} color={category.color} className="size-4" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {category.name}
              </span>
              <BudgetGroupSelect
                groups={budget.groups}
                value={map.get(category.id) ?? null}
                noneLabel="Sem grupo"
                disabled={mutation.isPending && mutation.variables?.categoryId === category.id}
                onChange={(groupId) => mutation.mutate({ categoryId: category.id, groupId })}
                aria-label={`Grupo de ${category.name}`}
                className="w-40 shrink-0 sm:w-48"
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
