import type { BudgetGroup, BudgetGroupProgress } from "@fd/contracts";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { ErrorState } from "@/components/domain/error-state";
import { useMoneyFormatter } from "@/components/privacy/privacy-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { budgetUsage, shiftMonth, usageFill, type BudgetUsage } from "@/lib/budget";
import { formatMonthLong } from "@/lib/format";
import { currentMonthInAppTimeZone } from "@/lib/period";
import { budgetProgressQueryOptions } from "@/lib/queries";
import { cn } from "@/lib/utils";

export interface BudgetProgressCardProps {
  groups: readonly BudgetGroup[];
}

/**
 * Realizado × meta por grupo num mês. Despesas (efetivadas e pendentes) pela
 * data da transação: cada parcela do cartão conta no mês em que cai.
 */
export function BudgetProgressCard({ groups }: BudgetProgressCardProps) {
  const currentMonth = currentMonthInAppTimeZone();
  const [month, setMonth] = useState(currentMonth);
  const query = useQuery(budgetProgressQueryOptions(month));
  const progress = query.data?.data;
  const money = useMoneyFormatter();
  const byId = new Map(progress?.groups.map((item) => [item.groupId, item]));
  const longMonth = formatMonthLong(month);
  // "novembro de 2026" → "Novembro de 2026" (o `capitalize` do CSS subiria o "de").
  const monthLabel = longMonth.charAt(0).toUpperCase() + longMonth.slice(1);

  return (
    <Card data-slot="budget-progress">
      <CardHeader>
        <CardTitle>Realizado no mês</CardTitle>
        <CardDescription>
          Despesas e parcelas pela data em que caem, contra a meta de cada grupo.
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Mês anterior"
            onClick={() => setMonth((value) => shiftMonth(value, -1))}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span
            aria-live="polite"
            className="min-w-32 text-center text-[13px] font-medium text-foreground"
          >
            {monthLabel}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Próximo mês"
            disabled={month >= currentMonth}
            onClick={() => setMonth((value) => shiftMonth(value, 1))}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {query.isError ? (
          <ErrorState
            compact
            title="Não foi possível carregar o realizado"
            error={query.error}
            onRetry={() => void query.refetch()}
            className="m-4"
          />
        ) : !progress ? (
          <div className="space-y-3 p-4">
            {groups.map((group) => (
              <Skeleton key={group.id} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            {progress.referenceIncomeCents === null ? (
              <p className="border-b border-border-subtle px-4 py-3 text-[13px] text-muted-foreground">
                Defina a renda de referência para comparar o gasto com as metas.
              </p>
            ) : null}
            <ul
              className={cn(
                "divide-y divide-border-subtle transition-opacity",
                query.isPlaceholderData && "opacity-60",
              )}
            >
              {groups.map((group) => (
                <ProgressRow
                  key={group.id}
                  group={group}
                  progress={byId.get(group.id)}
                  formatMoney={money.formatCurrency}
                />
              ))}
              {progress.unassigned.transactionCount > 0 ? (
                <li
                  data-slot="budget-progress-unassigned"
                  className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-[13px]"
                >
                  <span className="text-muted-foreground">
                    Sem grupo · {progress.unassigned.transactionCount}{" "}
                    {progress.unassigned.transactionCount === 1 ? "lançamento" : "lançamentos"}
                  </span>
                  <span className="font-medium text-foreground tabular-nums">
                    {money.formatCurrency(progress.unassigned.spentCents)}
                  </span>
                </li>
              ) : null}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const USAGE_TEXT: Record<BudgetUsage, string> = {
  untracked: "text-muted-foreground",
  ok: "text-muted-foreground",
  near: "text-warning",
  over: "text-negative",
};

function ProgressRow({
  group,
  progress,
  formatMoney,
}: {
  group: BudgetGroup;
  progress: BudgetGroupProgress | undefined;
  formatMoney: (cents: number) => string;
}) {
  const spent = progress?.spentCents ?? 0;
  const target = progress?.targetCents ?? null;
  const usage = budgetUsage(spent, target);
  const fill = usageFill(spent, target);

  let status: string;
  if (target === null) {
    const count = progress?.transactionCount ?? 0;
    status = `${count} ${count === 1 ? "lançamento" : "lançamentos"}`;
  } else if (usage === "over") {
    status = `${formatMoney(spent - target)} acima`;
  } else {
    status = `Restam ${formatMoney(target - spent)}`;
  }

  return (
    <li data-slot="budget-progress-row" data-usage={usage} className="space-y-1.5 px-4 py-3">
      <div className="flex items-center gap-2 text-[13px]">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: group.color }}
        />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{group.name}</span>
        <span className="shrink-0 text-foreground tabular-nums">
          {formatMoney(spent)}
          {target !== null ? (
            <span className="text-muted-foreground"> de {formatMoney(target)}</span>
          ) : null}
        </span>
      </div>
      {target !== null ? (
        <div
          role="progressbar"
          aria-label={`Consumo de ${group.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fill * 100)}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn("h-full rounded-full", usage === "over" && "bg-negative")}
            style={{
              width: `${fill * 100}%`,
              ...(usage === "over" ? {} : { backgroundColor: group.color }),
            }}
          />
        </div>
      ) : null}
      <p className={cn("text-right text-xs tabular-nums", USAGE_TEXT[usage])}>{status}</p>
    </li>
  );
}
