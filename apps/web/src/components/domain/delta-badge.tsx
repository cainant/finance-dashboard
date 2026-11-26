import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type * as React from "react";

import { useMoneyFormatter } from "@/components/privacy/privacy-context";
import { describeDelta, describePercentDelta, formatDelta, type DeltaAmounts } from "@/lib/delta";
import { cn } from "@/lib/utils";

interface DeltaBadgeBaseProps extends Omit<React.ComponentProps<"span">, "children"> {
  /** Inverte a leitura de sentimento: em despesas, subir é ruim. */
  invert?: boolean;
  /** Texto auxiliar após o delta ("vs. período anterior"). */
  label?: string;
  precision?: number;
  showIcon?: boolean;
  size?: "sm" | "md";
}

/**
 * O badge recebe **ou** os montantes comparados **ou** um percentual já pronto
 * — nunca os dois. Com `amounts`, a regra única de `describeDelta` decide entre
 * percentual e diferença em reais.
 */
export type DeltaBadgeProps = DeltaBadgeBaseProps &
  (
    | {
        /**
         * Variação em **pontos percentuais**, a convenção de `deltaPercent` da
         * API: `2.9` → "2,9%". `null` exibe "—".
         */
        value: number | null | undefined;
        amounts?: never;
      }
    | {
        /** Montantes comparados (atual e anterior) para a regra única. */
        amounts: DeltaAmounts | null;
        value?: never;
      }
  );

/**
 * Variação com seta e cor: verde para melhora, vermelho para piora.
 * Sem pílula — o sinal é comunicado pela cor e pela seta, não por um fundo.
 */
export function DeltaBadge({
  value,
  amounts,
  invert = false,
  label,
  precision = 1,
  showIcon = true,
  size = "sm",
  className,
  ...props
}: DeltaBadgeProps) {
  const money = useMoneyFormatter();
  const delta = amounts
    ? describeDelta(amounts.currentCents, amounts.previousCents)
    : describePercentDelta(value);
  const hasValue = delta.display !== "none";
  const isFlat = delta.direction === "flat";
  const isUp = delta.direction === "up";
  const isPositive = isFlat ? false : invert ? !isUp : isUp;
  const formatted = formatDelta(delta, { precision, formatCurrency: money.formatCurrency });
  // O rótulo acessível usa a direção + magnitude: "+" no texto visível e seta
  // se duplicariam no leitor de tela ("Aumento de +R$ ...").
  const magnitude = formatDelta(delta, {
    precision,
    signDisplay: "never",
    formatCurrency: money.formatCurrency,
  });
  const directionLabel = isFlat ? "Sem variação" : isUp ? "Aumento" : "Queda";
  const suffix = label ? ` ${label}` : "";
  const spoken = !hasValue
    ? "Variação indisponível"
    : money.hidden && delta.display === "amount"
      ? `${directionLabel} · ${money.ariaLabel ?? "Valor oculto"}${suffix}`
      : `${directionLabel} de ${magnitude}${suffix}`;

  const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      data-slot="delta-badge"
      className={cn("inline-flex items-baseline gap-1.5", className)}
      {...props}
    >
      <span
        aria-label={spoken}
        title={spoken}
        data-tone={isFlat ? "neutral" : isPositive ? "positive" : "negative"}
        className={cn(
          "inline-flex items-center gap-0.5 font-medium whitespace-nowrap tabular-nums",
          size === "md" ? "text-sm" : "text-[13px]",
          isFlat ? "text-muted-foreground" : isPositive ? "text-positive" : "text-negative",
        )}
      >
        {showIcon ? <Icon aria-hidden="true" className="size-3.5" strokeWidth={2} /> : null}
        <span>{formatted}</span>
      </span>
      {label ? <span className="text-xs text-muted-foreground">{label}</span> : null}
    </span>
  );
}
