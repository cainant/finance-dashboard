/**
 * Domínio e ticks do eixo Y para gráficos de área.
 *
 * Área começa em zero por padrão, mas quando a série tem variação pequena em
 * relação ao seu nível (ex.: patrimônio entre R$ 72 mil e R$ 76 mil) o zero
 * achata a linha. Aqui o domínio ganha ~10% de folga e é arredondado para fora
 * no passo dos ticks; o zero só é mantido quando os dados de fato chegam perto
 * dele.
 *
 * O domínio e os ticks saem juntos da mesma função de propósito: o Recharts
 * recalcula ticks "bonitos" a partir do domínio e, num domínio desalinhado,
 * produzia um tick colado na ponta (ex.: série constante em -R$ 513,12 virava
 * -462, -474, -504, ...). Com o passo calculado aqui e os ticks explícitos, o
 * espaçamento é sempre uniforme.
 */

import { formatAxisAmountFromCents } from "@/lib/format";

export interface ChartAxisOptions {
  /** Folga em cada ponta, proporcional ao intervalo dos dados. */
  paddingRatio?: number;
  /** Distância do zero (em fração do intervalo) que conta como "perto". */
  nearZeroRatio?: number;
  /** Ticks desejados no eixo; o arredondamento pode devolver um a mais. */
  maxTicks?: number;
}

export interface ChartAxis {
  domain: [number, number];
  ticks: number[];
}

/**
 * Menor passo entre ticks, em centavos (R$ 1,00), para o eixo não ganhar ticks
 * fracionários. Faixas estreitas em relação ao nível (patrimônio parado, por
 * exemplo) podem ficar com 2 ticks, porque o passo cresce até a resolução do
 * rótulo separar os textos.
 */
const MIN_TICK_STEP = 100;

/** Faixa mínima de uma série constante (R$ 10,00), para o eixo não nascer vazio. */
const MIN_CONSTANT_SPAN = 1_000;

/** Passo "bonito" (1, 2, 5 ou 10 × potência de 10) para caber em `maxTicks`. */
function niceStep(span: number, maxTicks: number): number {
  const intervals = Math.max(maxTicks - 1, 1);
  const target = span / intervals;
  const exponent = Math.floor(Math.log10(target));
  const magnitude = 10 ** exponent;
  const normalized = target / magnitude;
  const fraction = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

  return Math.max(fraction * magnitude, MIN_TICK_STEP);
}

/**
 * Passos "bonitos" crescentes a partir de `from`, para a busca por rótulos
 * únicos. `10 × 10^n` é o mesmo que `1 × 10^(n+1)`, então só 1, 2 e 5 entram.
 */
function niceStepsFrom(from: number): number[] {
  const steps: number[] = [];
  const exponent = Math.floor(Math.log10(from));

  for (let current = exponent; current <= exponent + 8; current += 1) {
    for (const fraction of [1, 2, 5]) {
      const step = fraction * 10 ** current;

      if (step >= from) {
        steps.push(step);
      }
    }
  }

  return steps;
}

function ticksForStep(lower: number, upper: number, step: number): number[] {
  const intervals = Math.round((upper - lower) / step);

  return Array.from({ length: intervals + 1 }, (_, index) => lower + index * step);
}

/**
 * O eixo só serve se cada tick virar um rótulo diferente: `formatAxis` trunca
 * em 1 casa em "mil"/"mi" e arredonda para reais inteiros abaixo de R$ 1.000,
 * então passos pequenos demais repetem texto (ex.: R$ 1 mil e R$ 1,05 mil).
 */
function hasUniqueLabels(ticks: readonly number[]): boolean {
  const labels = ticks.map((tick) => formatAxisAmountFromCents(tick));

  return new Set(labels).size === labels.length;
}

/**
 * Devolve `{ domain, ticks }` com folga e arredondamento para fora no passo dos
 * ticks, ou `undefined` quando não há valores finitos. As pontas do domínio são
 * sempre ticks, então o eixo fica igualmente espaçado; o passo cresce até todos
 * os ticks terem rótulos distintos.
 */
export function chartAxis(
  values: readonly number[],
  { paddingRatio = 0.1, nearZeroRatio = 0.2, maxTicks = 6 }: ChartAxisOptions = {},
): ChartAxis | undefined {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) {
    return undefined;
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);

  let lower: number;
  let upper: number;

  if (min === max) {
    // Série constante: cria uma faixa mínima legível (e não desenha um eixo
    // negativo para uma série que é toda zero).
    const halfSpan = Math.max(Math.abs(min) * paddingRatio, MIN_CONSTANT_SPAN / 2);

    lower = min === 0 ? 0 : min - halfSpan;
    upper = min === 0 ? MIN_CONSTANT_SPAN : max + halfSpan;
  } else {
    const span = max - min;
    const pad = span * paddingRatio;
    lower = min - pad;
    upper = max + pad;

    // Série positiva que quase toca o zero: mantém o zero como base.
    if (min >= 0 && min <= span * nearZeroRatio) {
      lower = 0;
    }

    if (max <= 0 && Math.abs(max) <= span * nearZeroRatio) {
      upper = 0;
    }
  }

  const start = niceStep(upper - lower, maxTicks);

  // Estouro de precisão (ex.: `Number.MAX_VALUE`): sem domínio finito não há
  // eixo; o gráfico fica no automático do Recharts.
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || !Number.isFinite(start) || start <= 0) {
    return undefined;
  }

  let axis: ChartAxis | undefined;

  for (const step of niceStepsFrom(start)) {
    let low = Math.floor(lower / step) * step;
    let high = Math.ceil(upper / step) * step;

    if (low === high) {
      high = low + step;
    }

    // Arredondar (ou aumentar o passo) não pode cruzar o zero de uma série que
    // não tem valores lá — inclusive na série constante em R$ 1,00 ou -R$ 3,00,
    // cuja folga mínima passaria para o outro lado.
    if (min > 0 && low < 0) {
      low = 0;
    }

    if (max < 0 && high > 0) {
      high = 0;
    }

    const ticks = ticksForStep(low, high, step);
    axis = { domain: [low, high], ticks };

    if (hasUniqueLabels(ticks)) {
      return axis;
    }
  }

  return axis;
}
