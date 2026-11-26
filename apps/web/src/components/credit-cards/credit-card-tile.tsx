import type { CreditCard } from "@fd/contracts";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { DemoBadge } from "@/components/domain/demo-badge";
import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { MoneyText } from "@/components/domain/money-text";
import { creditCardProductLabel, limitUsage } from "@/lib/credit-cards";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CreditCardTileProps {
  card: CreditCard;
  selected: boolean;
  onSelect: (accountId: string) => void;
}

/**
 * Cartão visual no estilo da lista "Workers & Pages": cabeçalho de 44px com
 * avatar, nome e estado de seleção (a pill de demonstração fica na linha de
 * detalhes para não disputar o nome); corpo com limite, fatura e disponível;
 * barra de uso do limite (limite − disponível) com o valor comprometido;
 * rodapé de 40px com fechamento e vencimento. O elemento
 * inteiro é um botão com `aria-pressed`.
 */
export function CreditCardTile({ card, selected, onSelect }: CreditCardTileProps) {
  const institution = card.account.institutionName ?? card.account.name;
  const product = creditCardProductLabel(card);
  const usage = limitUsage(card);
  const ratio = usage?.ratio ?? null;
  const isDemo = card.account.provider === "demo";
  const details = [institution, product, card.account.numberMasked].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      data-slot="credit-card-tile"
      data-selected={selected || undefined}
      aria-pressed={selected}
      aria-label={`Cartão ${card.account.name} — ${details}`}
      onClick={() => onSelect(card.accountId)}
      className={cn(
        "group flex w-full min-w-0 flex-col rounded-lg border bg-card text-left",
        "transition-colors duration-150 hover:bg-accent/30",
        "focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none",
        selected ? "border-primary/60" : "border-border",
      )}
    >
      <span className="flex min-h-11 items-center gap-2.5 border-b border-border-subtle px-4 py-0.5">
        <InstitutionAvatar name={institution} size="sm" />

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="block min-w-0 flex-1 truncate text-sm leading-5 font-medium text-foreground">
              {card.account.name}
            </span>
            {selected ? (
              <span
                className="grid size-5 shrink-0 place-items-center rounded-full border border-primary/40 text-primary"
                title="Selecionado"
                aria-hidden="true"
              >
                <Check className="size-3" />
              </span>
            ) : null}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs leading-4 text-muted-foreground">{details}</span>
            {isDemo ? <DemoBadge /> : null}
          </span>
        </span>
      </span>

      <span className="flex flex-col gap-3 p-4">
        <span className="grid grid-cols-3 gap-2">
          <CardMetric label="Limite">
            <MoneyText valueCents={card.limitCents} tone="neutral" size="sm" weight="medium" />
          </CardMetric>
          <CardMetric label="Fatura">
            <MoneyText
              valueCents={card.account.balanceCents}
              tone="neutral"
              size="sm"
              weight="medium"
            />
          </CardMetric>
          <CardMetric label="Disponível">
            <MoneyText
              valueCents={card.availableLimitCents}
              tone="neutral"
              size="sm"
              weight="medium"
            />
          </CardMetric>
        </span>

        <span className="space-y-1.5">
          <span className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Uso do limite</span>
            <span className="font-medium tabular-nums text-foreground">
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
                "block h-full rounded-full transition-[width] duration-200",
                ratio !== null && ratio >= 0.8 ? "bg-warning" : "bg-primary",
              )}
              style={{ width: `${(ratio ?? 0) * 100}%` }}
            />
          </span>
          {usage?.basis === "available" ? (
            // A fatura aberta não conta as parcelas futuras; aqui o valor que
            // realmente consome o limite é limite − disponível.
            <span
              className="block text-xs leading-4 text-subtle-foreground"
              title="Inclui as parcelas futuras que já comprometem o limite"
            >
              <MoneyText
                valueCents={usage.committedCents}
                size="sm"
                weight="normal"
                className="text-xs"
              />{" "}
              comprometido
              <span className="sr-only"> do limite, incluindo parcelas futuras</span>
            </span>
          ) : null}
        </span>
      </span>

      <span className="flex h-10 items-center gap-2 rounded-b-[7px] border-t border-border bg-background px-4 text-xs text-muted-foreground">
        <span>Fecha dia {card.closingDay ?? "—"}</span>
        <span aria-hidden="true" className="text-subtle-foreground">
          ·
        </span>
        <span>Vence dia {card.dueDay ?? "—"}</span>
      </span>
    </button>
  );
}

function CardMetric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="block text-xs leading-4 font-medium text-muted-foreground">{label}</span>
      <span className="block truncate">{children}</span>
    </span>
  );
}
