import { formatCurrencyFromCents, formatPercentPoints, type CurrencyFormatOptions } from "./format";

/**
 * Regra única de variação entre dois períodos.
 *
 * Percentual sobre base minúscula ou de sinal trocado não informa nada ("↗
 * 5.946,3% vs. período anterior"). Por isso o delta só vira percentual quando
 * a base é comparável:
 *
 * - sem valor anterior → "—" (`none`);
 * - base zero, base abaixo de {@link MIN_COMPARABLE_BASE_CENTS}, sinais opostos
 *   ou |variação| acima de {@link MAX_INFORMATIVE_PERCENT} → diferença absoluta
 *   em reais ("+R$ 7.500,00");
 * - caso contrário → percentual em pontos, a convenção de `deltaPercent`
 *   (`2.9` → "2,9%").
 *
 * Use `describeDelta` para montar o delta e `formatDelta` para o texto; as três
 * telas (Visão geral, Análises e tabela mês a mês) passam por aqui.
 */

/**
 * Piso da base comparável (R$ 100,00). Abaixo disso o percentual é ruído:
 * R$ 0,50 → R$ 5,00 "vale" 900%, mas o que importa é "+R$ 4,50".
 */
export const MIN_COMPARABLE_BASE_CENTS = 10_000;

/**
 * Teto do percentual informativo (500%, ou seja, 5× a base). Acima disso a
 * variação já não é "quase o dobro": R$ 100 → R$ 1.050 vira "950%", mas o que
 * importa é "+R$ 950,00".
 */
export const MAX_INFORMATIVE_PERCENT = 500;

export type DeltaDirection = "up" | "down" | "flat";

/** Como o delta deve ser exibido. */
export type DeltaDisplay = "percent" | "amount" | "none";

/** Montantes comparados; `null`/`undefined` significa "sem base". */
export interface DeltaAmounts {
  currentCents: number | null | undefined;
  previousCents: number | null | undefined;
}

export interface DeltaDescriptor {
  display: DeltaDisplay;
  direction: DeltaDirection;
  /** Variação em pontos percentuais (só quando `display === "percent"`). */
  percent: number | null;
  /** Diferença em centavos (só quando `display === "amount"`). */
  deltaCents: number | null;
}

function isAmount(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function directionOf(value: number): DeltaDirection {
  if (value > 0) {
    return "up";
  }

  return value < 0 ? "down" : "flat";
}

function noDelta(): DeltaDescriptor {
  return { display: "none", direction: "flat", percent: null, deltaCents: null };
}

function absoluteDelta(deltaCents: number): DeltaDescriptor {
  return { display: "amount", direction: directionOf(deltaCents), percent: null, deltaCents };
}

/**
 * Decide como mostrar a variação entre `currentCents` e `previousCents`.
 * Aceita valores de qualquer sinal (resultado pode ser negativo).
 */
export function describeDelta(
  currentCents: number | null | undefined,
  previousCents: number | null | undefined,
): DeltaDescriptor {
  if (!isAmount(currentCents) || !isAmount(previousCents)) {
    return noDelta();
  }

  const deltaCents = currentCents - previousCents;

  if (previousCents === 0) {
    // Sem base não existe percentual; a diferença em reais ainda informa.
    return deltaCents === 0 ? noDelta() : absoluteDelta(deltaCents);
  }

  if (currentCents !== 0 && Math.sign(currentCents) !== Math.sign(previousCents)) {
    // Base de sinal oposto (ex.: resultado de negativo para positivo): o
    // percentual compara grandezas que não são a mesma coisa.
    return absoluteDelta(deltaCents);
  }

  if (Math.abs(previousCents) < MIN_COMPARABLE_BASE_CENTS) {
    // Base minúscula: R$ 0,50 → R$ 5,00 "vale" 900%, mas informa pouco.
    return absoluteDelta(deltaCents);
  }

  const percent = (deltaCents / Math.abs(previousCents)) * 100;

  if (Math.abs(percent) > MAX_INFORMATIVE_PERCENT) {
    return absoluteDelta(deltaCents);
  }

  return {
    display: "percent",
    // Variação que arredonda para 0,0% não tem direção: evita "↗ 0%".
    direction: Math.abs(percent) < 0.05 ? "flat" : directionOf(deltaCents),
    percent,
    deltaCents,
  };
}

/**
 * Descreve um percentual que já chega pronto (sem os montantes para aplicar a
 * regra). Mantido para chamadores que só têm o número — prefira `describeDelta`.
 */
export function describePercentDelta(percent: number | null | undefined): DeltaDescriptor {
  if (!isAmount(percent)) {
    return noDelta();
  }

  return {
    display: "percent",
    direction: Math.abs(percent) < 0.05 ? "flat" : directionOf(percent),
    percent,
    deltaCents: null,
  };
}

export interface DeltaFormatOptions {
  /** Casas decimais do percentual (padrão: 1). */
  precision?: number;
  /**
   * Sinal do valor absoluto: `always` (padrão, texto visível) ou `never`
   * (rótulos acessíveis, onde a seta/texto já diz o sentido).
   */
  signDisplay?: "always" | "never";
  /**
   * Formatter monetário. Injete o de `useMoneyFormatter` para respeitar a
   * preferência "Ocultar valores".
   */
  formatCurrency?: (cents: number, options?: CurrencyFormatOptions) => string;
}

/** Texto do delta: "2,9%", "+R$ 7.500,00" ou "—". */
export function formatDelta(delta: DeltaDescriptor, options: DeltaFormatOptions = {}): string {
  if (delta.display === "percent" && delta.percent !== null) {
    return formatPercentPoints(Math.abs(delta.percent), {
      maximumFractionDigits: options.precision ?? 1,
    });
  }

  if (delta.display === "amount" && delta.deltaCents !== null) {
    const formatCurrency = options.formatCurrency ?? formatCurrencyFromCents;
    return formatCurrency(delta.deltaCents, { signDisplay: options.signDisplay ?? "always" });
  }

  return "—";
}
