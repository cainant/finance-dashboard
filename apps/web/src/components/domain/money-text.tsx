import type * as React from "react";

import { useMoneyFormatter } from "@/components/privacy/privacy-context";
import type { SignDisplay } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MoneyTone = "auto" | "neutral" | "positive" | "negative";

const SIZE_CLASS: Record<NonNullable<MoneyTextProps["size"]>, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
  xl: "text-2xl",
  "2xl": "text-3xl",
};

const WEIGHT_CLASS: Record<NonNullable<MoneyTextProps["weight"]>, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
};

const TONE_CLASS: Record<Exclude<MoneyTone, "auto">, string> = {
  neutral: "text-foreground",
  positive: "text-positive",
  negative: "text-negative",
};

export interface MoneyTextProps extends Omit<React.ComponentProps<"span">, "children"> {
  /** Valor inteiro em centavos; `null`/`undefined` renderiza "—". */
  valueCents: number | null | undefined;
  currency?: string;
  /**
   * Cor do valor. O padrão é `neutral`: saldos e KPIs são neutros e só o delta
   * carrega cor. `auto` colore pelo sinal (use apenas onde o sinal é o próprio
   * significado, como resultado/saldo total).
   */
  tone?: MoneyTone;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  weight?: "normal" | "medium" | "semibold" | "bold";
  signDisplay?: SignDisplay;
  compact?: boolean;
  /** Texto exibido quando não há valor. */
  emptyLabel?: string;
  /** Sobrescreve o `title`; por padrão mostra o valor completo (útil com truncate). */
  title?: string;
}

/**
 * Valor monetário em BRL (a partir de centavos), com tabular-nums. Por padrão
 * é neutro (`foreground`); `tone="auto"` colore pelo sinal quando a cor é
 * significado (resultado negativo), e `positive`/`negative` são explícitos.
 * O componente não busca dados: apenas formata o que recebe.
 */
export function MoneyText({
  valueCents,
  currency,
  tone = "neutral",
  size = "md",
  weight = "medium",
  signDisplay = "auto",
  compact = false,
  emptyLabel = "—",
  title,
  className,
  ...props
}: MoneyTextProps) {
  const money = useMoneyFormatter();
  const { "aria-label": ariaLabel, ...rest } = props;
  const hasValue = typeof valueCents === "number" && Number.isFinite(valueCents);
  const resolvedTone: Exclude<MoneyTone, "auto"> = !hasValue
    ? "neutral"
    : tone !== "auto"
      ? tone
      : valueCents > 0
        ? "positive"
        : valueCents < 0
          ? "negative"
          : "neutral";
  const formatted = hasValue
    ? money.formatCurrency(valueCents, { currency, signDisplay, compact })
    : emptyLabel;

  return (
    <span
      data-slot="money"
      data-empty={!hasValue || undefined}
      data-hidden={money.hidden || undefined}
      title={money.hidden ? undefined : (title ?? formatted)}
      aria-label={money.hidden ? money.ariaLabel : ariaLabel}
      className={cn(
        "tabular-nums tracking-tight",
        SIZE_CLASS[size],
        WEIGHT_CLASS[weight],
        hasValue ? TONE_CLASS[resolvedTone] : "text-muted-foreground",
        className,
      )}
      {...rest}
    >
      {formatted}
    </span>
  );
}
