import type { ReserveStatus } from "@fd/contracts";

import { MoneyText } from "@/components/domain/money-text";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ReserveStatusViewProps {
  reserve: ReserveStatus;
  /** Lista os cartões que guardam nesta reserva (a página Cartões mostra; o detalhe não). */
  showCards?: boolean;
  className?: string;
}

/**
 * Situação de uma reserva: guardado × a cobrar, quanto falta e o gasto no
 * crédito desde o último depósito.
 */
export function ReserveStatusView({
  reserve,
  showCards = false,
  className,
}: ReserveStatusViewProps) {
  const covered = reserve.gapCents === 0;
  const fill =
    reserve.neededCents <= 0
      ? 1
      : Math.min(1, Math.max(0, reserve.reservedCents) / reserve.neededCents);
  const sourceLabel = [reserve.source.name, reserve.source.institutionName]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      data-slot="reserve-status"
      data-covered={covered || undefined}
      className={cn("space-y-2", className)}
    >
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="min-w-0 truncate font-medium text-foreground">{sourceLabel}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          <MoneyText valueCents={reserve.reservedCents} size="sm" weight="medium" tone="neutral" />{" "}
          de <MoneyText valueCents={reserve.neededCents} size="sm" tone="neutral" />
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`Guardado em ${reserve.source.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill * 100)}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", covered ? "bg-positive" : "bg-warning")}
          style={{ width: `${fill * 100}%` }}
        />
      </div>
      <p className={cn("text-[13px]", covered ? "text-muted-foreground" : "text-warning")}>
        {covered ? (
          "A reserva cobre as faturas."
        ) : (
          <>
            Guarde mais{" "}
            <MoneyText valueCents={reserve.gapCents} size="sm" weight="semibold" tone="neutral" />{" "}
            para cobrir as faturas.
          </>
        )}
      </p>
      {reserve.spentSinceDepositCents && reserve.lastDepositDate ? (
        <p className="text-xs text-muted-foreground">
          Você gastou{" "}
          <MoneyText valueCents={reserve.spentSinceDepositCents} size="sm" tone="neutral" /> no
          crédito desde o último depósito na reserva ({formatDate(reserve.lastDepositDate)}).
        </p>
      ) : null}
      {showCards && reserve.cards.length > 0 ? (
        <ul className="space-y-1 pt-1">
          {reserve.cards.map((card) => (
            <li
              key={card.accountId}
              className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
            >
              <span className="min-w-0 truncate">{card.name}</span>
              <MoneyText valueCents={card.neededCents} size="sm" tone="neutral" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
