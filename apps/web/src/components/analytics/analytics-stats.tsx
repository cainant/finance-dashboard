import type { Transaction } from "@fd/contracts";
import { ReceiptText } from "lucide-react";

import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { MoneyText } from "@/components/domain/money-text";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "@/lib/category-icons";
import { formatDate } from "@/lib/format";

export interface StatisticsCardProps {
  /** Meses considerados na média. */
  months: number;
  incomeCents: number;
  expenseCents: number;
  resultCents: number;
  ticketCents: number | null;
  expenseCount: number;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
}

/** Médias mensais e ticket médio das despesas do período. */
export function StatisticsCard({
  months,
  incomeCents,
  expenseCents,
  resultCents,
  ticketCents,
  expenseCount,
  isPending,
  isError,
  error,
  isFetching,
  onRetry,
}: StatisticsCardProps) {
  return (
    <Card className="min-w-0 gap-0">
      <CardHeader>
        <CardTitle>Estatísticas do período</CardTitle>
        <CardDescription>
          Médias mensais da série de {months} {months === 1 ? "mês" : "meses"} e ticket médio das
          despesas classificadas.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-4">
        {isPending ? (
          <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-2.5 w-32" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            compact
            className="border-0 bg-transparent px-0"
            title="Não foi possível calcular as estatísticas"
            error={error}
            onRetry={onRetry}
            isRetrying={isFetching}
          />
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            <StatTile
              label="Média de receitas"
              valueCents={incomeCents}
              hint={`por mês, em ${months} ${months === 1 ? "mês" : "meses"}`}
            />
            <StatTile
              label="Média de despesas"
              valueCents={expenseCents}
              hint={`por mês, em ${months} ${months === 1 ? "mês" : "meses"}`}
            />
            <StatTile
              label="Média de resultado"
              valueCents={resultCents}
              hint="receitas − despesas por mês"
            />
            <StatTile
              label="Ticket médio"
              valueCents={ticketCents}
              hint={`${expenseCount.toLocaleString("pt-BR")} ${
                expenseCount === 1 ? "despesa classificada" : "despesas classificadas"
              }`}
            />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function StatTile({
  label,
  valueCents,
  hint,
}: {
  label: string;
  valueCents: number | null;
  hint: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs leading-4 font-medium text-muted-foreground">{label}</dt>
      <dd className="space-y-1">
        <MoneyText
          valueCents={valueCents}
          size="lg"
          weight="semibold"
          tone={(valueCents ?? 0) < 0 ? "negative" : "neutral"}
        />
        <p className="text-xs leading-4 text-muted-foreground">{hint}</p>
      </dd>
    </div>
  );
}

export interface TopExpensesCardProps {
  transactions: Transaction[];
  periodLabel: string;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
}

/** As 5 maiores despesas do período (`sort=amount_asc`). */
export function TopExpensesCard({
  transactions,
  periodLabel,
  isPending,
  isError,
  error,
  isFetching,
  onRetry,
}: TopExpensesCardProps) {
  return (
    <Card className="min-w-0 gap-0">
      <CardHeader>
        <CardTitle>Maiores despesas</CardTitle>
        <CardDescription>As 5 maiores saídas · {periodLabel}</CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        {isPending ? (
          <div className="space-y-3 p-4" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-7 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2.5 w-1/3" />
                </div>
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-4">
            <ErrorState
              compact
              className="border-0 bg-transparent px-0"
              title="Não foi possível carregar as maiores despesas"
              error={error}
              onRetry={onRetry}
              isRetrying={isFetching}
            />
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={ReceiptText}
              title="Sem despesas no período"
              description="As maiores saídas aparecem quando houver transações de saída no recorte."
              compact
              className="border-0 bg-transparent px-0 py-6"
            />
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {transactions.map((transaction) => {
              const account = transaction.account?.institutionName ?? transaction.account?.name;

              return (
                <li key={transaction.id} className="flex h-11 items-center gap-3 px-4">
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-md border border-border-subtle bg-surface-2"
                    aria-hidden="true"
                  >
                    {transaction.category ? (
                      <CategoryIcon
                        name={transaction.category.icon}
                        color={transaction.category.color}
                        className="size-3.5"
                      />
                    ) : (
                      <ReceiptText className="size-3.5 text-subtle-foreground" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm leading-5 font-medium text-foreground">
                      {transaction.description}
                    </p>
                    <p className="truncate text-xs leading-4 text-muted-foreground">
                      {formatDate(transaction.date)} ·{" "}
                      {transaction.category?.name ?? "Sem categoria"}
                      {account ? ` · ${account}` : ""}
                    </p>
                  </div>

                  <MoneyText
                    valueCents={transaction.amountCents}
                    signDisplay="always"
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
      </CardContent>
    </Card>
  );
}
