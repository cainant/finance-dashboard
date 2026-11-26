import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { BudgetPlanner } from "@/components/budget/budget-planner";
import { BudgetProgressCard } from "@/components/budget/budget-progress-card";
import { CategoryGroupsCard } from "@/components/budget/category-groups-card";
import { ReferenceIncomeCard } from "@/components/budget/reference-income-card";
import { ErrorState } from "@/components/domain/error-state";
import { PageHeader } from "@/components/domain/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { budgetQueryOptions, categoriesQueryOptions } from "@/lib/queries";

export const Route = createFileRoute("/_app/budget")({
  staticData: { title: "Metas" },
  component: BudgetPage,
});

function BudgetPage() {
  const budgetQuery = useQuery(budgetQueryOptions);
  const categoriesQuery = useQuery(categoriesQueryOptions);
  const budget = budgetQuery.data?.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metas"
        description="Distribua a renda de referência entre grupos, acompanhe o realizado e escolha o grupo de cada categoria."
      />

      {budgetQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar as metas"
          error={budgetQuery.error}
          onRetry={() => void budgetQuery.refetch()}
          isRetrying={budgetQuery.isFetching}
        />
      ) : !budget ? (
        <BudgetSkeleton />
      ) : (
        <>
          {/* `key`: remonta com o valor salvo quando a resposta da API chega. */}
          <ReferenceIncomeCard
            key={`income:${budget.referenceIncomeCents ?? "none"}`}
            incomeCents={budget.referenceIncomeCents}
          />
          <BudgetPlanner
            key={budget.groups
              .map((group) => `${group.id}:${group.name}:${group.color}:${group.targetBps}`)
              .join("|")}
            groups={budget.groups}
            incomeCents={budget.referenceIncomeCents}
          />
          <BudgetProgressCard groups={budget.groups} />
          {categoriesQuery.isError ? (
            <ErrorState
              compact
              title="Não foi possível carregar as categorias"
              error={categoriesQuery.error}
              onRetry={() => void categoriesQuery.refetch()}
            />
          ) : categoriesQuery.data ? (
            <CategoryGroupsCard budget={budget} categories={categoriesQuery.data.data} />
          ) : (
            <Skeleton className="h-64 w-full rounded-lg" />
          )}
        </>
      )}
    </div>
  );
}

function BudgetSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando metas">
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-9 w-64 rounded-lg" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Skeleton className="h-96 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    </div>
  );
}
