import type { CreditCard, UpcomingBill } from "@fd/contracts";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { DemoBadge } from "@/components/domain/demo-badge";
import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { MoneyText } from "@/components/domain/money-text";
import { dueLabel } from "@/lib/bills";
import { creditCardProductLabel, isDueSoon, limitUsage } from "@/lib/credit-cards";
import { formatDate, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CreditCardRowProps {
  card: CreditCard;
  /** Próxima fatura do cartão na janela de vencimentos, se houver. */
  nextBill: UpcomingBill | null;
}

/**
 * Cartão como linha tocável (mobile): fatura atual, vencimento (em `warning`
 * quando próximo) e uso do limite. O toque abre o detalhe do cartão
 * (`/credit-cards/$accountId`). Alvo bem acima de 44px.
 */
export function CreditCardRow({ card, nextBill }: CreditCardRowProps) {
  const institution = card.account.institutionName ?? card.account.name;
  const product = creditCardProductLabel(card);
  const usage = limitUsage(card);
  const ratio = usage?.ratio ?? null;
  const soon = nextBill ? isDueSoon(nextBill.daysUntilDue) : false;
  const details = [institution, product, card.account.numberMasked].filter(Boolean).join(" · ");

  return (
    <Link
      to="/credit-cards/$accountId"
      params={{ accountId: card.accountId }}
      search={(previous) => previous}
      data-slot="credit-card-row"
      className={cn(
        "flex min-h-11 flex-col gap-3 rounded-lg border border-border bg-card p-4",
        "transition-colors duration-150 active:bg-accent",
      )}
    >
      <span className="flex items-center gap-3">
        <InstitutionAvatar name={institution} size="sm" decorative />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm leading-5 font-medium text-foreground">
              {card.account.name}
            </span>
            {card.account.provider === "demo" ? <DemoBadge /> : null}
          </span>
          <span className="block truncate text-xs leading-4 text-muted-foreground">{details}</span>
        </span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-subtle-foreground" />
      </span>

      <span className="flex items-end justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-xs leading-4 font-medium text-muted-foreground">
            Fatura atual
          </span>
          <MoneyText
            valueCents={card.account.balanceCents}
            tone="neutral"
            size="lg"
            weight="semibold"
            className="block"
          />
        </span>
        <span className="min-w-0 text-right text-xs leading-4">
          {nextBill ? (
            <span
              data-slot="card-due"
              data-due-soon={soon || undefined}
              className={cn(
                "block truncate",
                soon ? "font-medium text-warning" : "text-muted-foreground",
              )}
            >
              Vence {formatDate(nextBill.dueDate)} · {dueLabel(nextBill.daysUntilDue)}
            </span>
          ) : (
            <span className="block truncate text-muted-foreground">
              {card.dueDay ? `Vence todo dia ${card.dueDay}` : "Vencimento não informado"}
            </span>
          )}
        </span>
      </span>

      <span className="space-y-1.5">
        <span className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">Uso do limite</span>
          <span className="font-medium text-foreground tabular-nums">
            {ratio === null
              ? "Limite não informado"
              : formatPercent(ratio, { maximumFractionDigits: 0 })}
          </span>
        </span>
        <span
          role="progressbar"
          aria-label={`Uso do limite do cartão ${card.account.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={ratio === null ? undefined : Math.round(ratio * 100)}
          aria-valuetext={
            ratio === null
              ? "Limite não informado"
              : `${formatPercent(ratio, { maximumFractionDigits: 0 })} do limite usado`
          }
          className="block h-1 w-full overflow-hidden rounded-full bg-border-subtle"
        >
          <span
            className={cn(
              "block h-full origin-left rounded-full",
              ratio !== null && ratio >= 0.8 ? "bg-warning" : "bg-primary",
            )}
            style={{ width: `${(ratio ?? 0) * 100}%` }}
          />
        </span>
      </span>
    </Link>
  );
}
