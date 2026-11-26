import { MoneyText } from "@/components/domain/money-text";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountsSummary } from "@/lib/accounts";

export interface AccountsSummaryCardProps {
  summary: AccountsSummary;
  isLoading?: boolean;
  /** `/api/investments` falhou: o total é exibido sem as posições. */
  investmentsUnavailable?: boolean;
  onRetryInvestments?: () => void;
}

/**
 * Coluna lateral de Contas: patrimônio líquido (contas + posições de
 * investimento - faturas abertas). As posições vêm de `/api/investments` e
 * não são distribuídas pelos cards de instituição.
 */
export function AccountsSummaryCard({
  summary,
  isLoading = false,
  investmentsUnavailable = false,
  onRetryInvestments,
}: AccountsSummaryCardProps) {
  return (
    <Card data-slot="accounts-summary" className="min-w-0 p-4">
      <h2 className="text-sm leading-5 font-semibold text-foreground">Patrimônio</h2>
      <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
        Saldos das contas e posições de investimento menos as faturas abertas. As posições não
        entram nos cards por instituição.
      </p>

      {isLoading ? (
        <div className="mt-3 space-y-3" aria-hidden="true">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ) : (
        <>
          <MoneyText
            valueCents={summary.netWorthCents}
            tone={summary.netWorthCents < 0 ? "negative" : "neutral"}
            size="xl"
            weight="semibold"
            className="mt-3 block"
          />

          <dl className="mt-3">
            <SummaryRow label="Em contas" valueCents={summary.accountsCents} />
            <SummaryRow label="Investimentos" valueCents={summary.investmentsCents} />
            <SummaryRow label="Faturas abertas" valueCents={-Math.abs(summary.creditCardCents)} />
          </dl>

          {investmentsUnavailable ? (
            <p
              role="status"
              className="mt-3 rounded-md border border-border-subtle bg-muted/40 px-2.5 py-2 text-xs leading-4 text-muted-foreground"
            >
              Posições de investimento indisponíveis; o total não as inclui.
              {onRetryInvestments ? (
                <button
                  type="button"
                  onClick={onRetryInvestments}
                  className="ml-1 font-medium text-foreground underline underline-offset-2"
                >
                  Tentar de novo
                </button>
              ) : null}
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}

function SummaryRow({ label, valueCents }: { label: string; valueCents: number }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 border-b border-dashed border-border-subtle last:border-b-0">
      <dt className="min-w-0 truncate text-[13px] leading-5 text-muted-foreground">{label}</dt>
      <dd className="shrink-0">
        <MoneyText valueCents={valueCents} tone="neutral" size="sm" weight="medium" />
      </dd>
    </div>
  );
}
