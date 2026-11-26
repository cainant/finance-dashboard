import { describe, expect, it } from "vitest";

import {
  describeDelta,
  formatDelta,
  MIN_COMPARABLE_BASE_CENTS,
  MAX_INFORMATIVE_PERCENT,
} from "./delta";

/** Normaliza o espaço não separável que o Intl usa entre "R$" e o número. */
function text(value: string): string {
  return value.replace(/\u00a0/g, " ");
}

describe("describeDelta", () => {
  it("mantém o percentual quando a base é comparável", () => {
    expect(describeDelta(150_000, 100_000)).toMatchObject({
      display: "percent",
      percent: 50,
      deltaCents: 50_000,
      direction: "up",
    });
    expect(describeDelta(50_000, 100_000)).toMatchObject({
      display: "percent",
      percent: -50,
      direction: "down",
    });
    expect(describeDelta(100_000, 100_000)).toMatchObject({ display: "percent", percent: 0 });
  });

  it("mostra a diferença absoluta quando a base anterior é zero", () => {
    expect(describeDelta(750_000, 0)).toMatchObject({
      display: "amount",
      deltaCents: 750_000,
      direction: "up",
    });
    expect(describeDelta(-750_000, 0)).toMatchObject({
      display: "amount",
      deltaCents: -750_000,
      direction: "down",
    });
  });

  it("mostra a diferença absoluta quando os sinais são opostos", () => {
    expect(describeDelta(140_000, -100_000)).toMatchObject({
      display: "amount",
      deltaCents: 240_000,
      direction: "up",
    });
    expect(describeDelta(-140_000, 100_000)).toMatchObject({
      display: "amount",
      deltaCents: -240_000,
      direction: "down",
    });
  });

  it("mantém o percentual de negativo para negativo (mesma direção)", () => {
    expect(describeDelta(-50_000, -100_000)).toMatchObject({ display: "percent", percent: 50 });
    expect(describeDelta(-150_000, -100_000)).toMatchObject({ display: "percent", percent: -50 });
  });

  it("troca percentual absurdo pela diferença absoluta acima do teto", () => {
    // R$ 1.000,00 -> R$ 7.000,00 é 600%: já não é um percentual informativo.
    expect(describeDelta(700_000, 100_000)).toMatchObject({
      display: "amount",
      deltaCents: 600_000,
    });
    // 240,6% de -R$ 2.000,00 para +R$ 2.812,00: base de sinal oposto.
    expect(describeDelta(281_200, -200_000)).toMatchObject({
      display: "amount",
      deltaCents: 481_200,
    });
  });

  it("troca percentual absurdo de negativo para negativo acima do teto", () => {
    // -R$ 152,27 -> -R$ 2.398,48 é -1.475,1% (mesmo sinal, base comparável).
    expect(describeDelta(-239_848, -15_227)).toMatchObject({
      display: "amount",
      deltaCents: -224_621,
      direction: "down",
    });
  });

  it("usa a base mínima comparável (R$ 100,00) nas duas bordas", () => {
    const min = MIN_COMPARABLE_BASE_CENTS;

    expect(describeDelta((min - 1) * 2, min - 1)).toMatchObject({ display: "amount" });
    expect(describeDelta(min * 2, min)).toMatchObject({ display: "percent", percent: 100 });
    // R$ 0,50 -> R$ 5,00 "vale" 900%, mas o piso da base manda em reais.
    expect(describeDelta(500, 50)).toMatchObject({ display: "amount", deltaCents: 450 });
  });

  it("aceita o teto exato como percentual e recusa um centavo acima", () => {
    const base = 100_000;
    const limit = base + (base * MAX_INFORMATIVE_PERCENT) / 100;

    expect(describeDelta(limit, base)).toMatchObject({
      display: "percent",
      percent: MAX_INFORMATIVE_PERCENT,
    });
    expect(describeDelta(limit + 1, base)).toMatchObject({ display: "amount" });
  });

  it("não dá direção a variação que arredonda para 0%", () => {
    expect(describeDelta(100_004, 100_000)).toMatchObject({
      display: "percent",
      direction: "flat",
    });
  });

  it("não inventa base quando não há comparação", () => {
    expect(describeDelta(100_000, null)).toEqual({
      display: "none",
      direction: "flat",
      percent: null,
      deltaCents: null,
    });
    expect(describeDelta(100_000, undefined)).toMatchObject({ display: "none" });
    expect(describeDelta(null, 100_000)).toMatchObject({ display: "none" });
    // Base zero e valor zero: não há percentual nem diferença a mostrar.
    expect(describeDelta(0, 0)).toMatchObject({ display: "none" });
  });
});

describe("formatDelta", () => {
  it("formata a diferença absoluta em reais com sinal explícito", () => {
    expect(text(formatDelta(describeDelta(750_000, 0)))).toBe("+R$ 7.500,00");
    expect(text(formatDelta(describeDelta(-750_000, 0)))).toBe("-R$ 7.500,00");
  });

  it("formata a magnitude sem sinal para rótulos acessíveis", () => {
    expect(text(formatDelta(describeDelta(-750_000, 0), { signDisplay: "never" }))).toBe(
      "R$ 7.500,00",
    );
  });

  it("formata o percentual em pontos, sem multiplicar por 100", () => {
    expect(formatDelta(describeDelta(150_000, 100_000))).toBe("50%");
    expect(formatDelta(describeDelta(102_900, 100_000), { precision: 1 })).toBe("2,9%");
  });

  it("mostra 0% para variação que arredonda para zero", () => {
    expect(formatDelta(describeDelta(100_004, 100_000))).toBe("0%");
  });

  it("usa travessão quando não há base", () => {
    expect(formatDelta(describeDelta(100_000, null))).toBe("—");
  });
});
