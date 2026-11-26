import { describe, expect, it } from "vitest";

import { formatAxisAmountFromCents } from "../../lib/format";
import { chartAxis, type ChartAxis } from "./chart-domain";

/** Ticks igualmente espaçados, começando e terminando nas pontas do domínio. */
function expectEvenTicks({ domain, ticks }: ChartAxis): void {
  expect(ticks.length).toBeGreaterThan(1);
  expect(ticks[0]).toBe(domain[0]);
  expect(ticks.at(-1)).toBe(domain[1]);

  const step = ticks[1]! - ticks[0]!;
  for (let index = 2; index < ticks.length; index += 1) {
    expect(ticks[index]! - ticks[index - 1]!).toBe(step);
  }

  // O eixo mostra reais inteiros abaixo de R$ 1.000 e 1 casa decimal em
  // "mil"/"mi": ticks vizinhos não podem repetir o mesmo rótulo.
  const labels = ticks.map((tick) => formatAxisAmountFromCents(tick));
  expect(new Set(labels).size).toBe(labels.length);
}

describe("chartAxis", () => {
  it("não começa em zero quando isso achataria a linha", () => {
    const axis = chartAxis([7_200_000, 7_400_000, 7_600_000])!;
    const [min, max] = axis.domain;

    expect(min).toBeGreaterThan(0);
    expect(min).toBeLessThan(7_200_000);
    expect(max).toBeGreaterThan(7_600_000);
    expect(axis.ticks[0]).toBe(min);
    expectEvenTicks(axis);
  });

  it("mantém o zero quando os dados chegam perto dele", () => {
    const axis = chartAxis([0, 1_000, 5_000])!;

    expect(axis.domain[0]).toBe(0);
    expect(axis.ticks[0]).toBe(0);
    expectEvenTicks(axis);
  });

  it("dá folga dos dois lados numa série que cruza o zero", () => {
    const [min, max] = chartAxis([-1_000, 500, 2_000])!.domain;

    expect(min).toBeLessThan(-1_000);
    expect(max).toBeGreaterThan(2_000);
  });

  it("fecha no zero uma série negativa que chega perto dele", () => {
    const axis = chartAxis([-5_000, -100])!;

    expect(axis.domain[1]).toBe(0);
    expect(axis.ticks.at(-1)).toBe(0);
    expectEvenTicks(axis);
  });

  it("arredonda os limites para fora", () => {
    const [min, max] = chartAxis([2_500_000, 2_700_000, 2_900_000])!.domain;

    expect(min).toBeLessThanOrEqual(2_500_000);
    expect(max).toBeGreaterThanOrEqual(2_900_000);
    expect(min % 1_000).toBe(0);
    expect(max % 1_000).toBe(0);
  });

  it("cria uma faixa mínima para série constante", () => {
    expect(chartAxis([0, 0])!.domain).toEqual([0, 1_000]);
    expect(chartAxis([5_000])!.domain).toEqual([4_400, 5_600]);
  });

  it("devolve undefined sem valores finitos", () => {
    expect(chartAxis([])).toBeUndefined();
    expect(chartAxis([Number.NaN])).toBeUndefined();
  });

  it("devolve undefined quando o domínio estoura a precisão", () => {
    expect(chartAxis([Number.MAX_VALUE])).toBeUndefined();
    expect(chartAxis([-Number.MAX_VALUE, Number.MAX_VALUE])).toBeUndefined();
  });

  it("alinhada ao passo dos ticks numa série constante negativa (-R$ 513,12)", () => {
    // Caso real da Visão geral: patrimônio parado em -R$ 513,12. Antes o
    // domínio saía [-56443,2, -46180,8] e o Recharts desenhava
    // -462, -474, -504, -534, -564.
    const axis = chartAxis(Array.from({ length: 12 }, () => -51_312))!;

    expect(axis.domain).toEqual([-60_000, -45_000]);
    expect(axis.ticks).toEqual([-60_000, -55_000, -50_000, -45_000]);
    expectEvenTicks(axis);
  });

  it("alinhada ao passo dos ticks numa série constante positiva", () => {
    const axis = chartAxis([51_312, 51_312, 51_312])!;

    expect(axis.domain).toEqual([45_000, 60_000]);
    expect(axis.ticks).toEqual([45_000, 50_000, 55_000, 60_000]);
    expectEvenTicks(axis);
  });

  it("não repete rótulos numa série constante em zero", () => {
    const axis = chartAxis([0, 0, 0])!;

    expect(axis.domain).toEqual([0, 1_000]);
    expectEvenTicks(axis);
  });

  it("espaça igualmente os ticks de uma série que cruza o zero", () => {
    const axis = chartAxis([-1_000, 500, 2_000])!;

    expect(axis.domain).toEqual([-2_000, 3_000]);
    expectEvenTicks(axis);
  });

  it("não repete rótulos perto de R$ 1.000 (arredonda em mil)", () => {
    // 900 | 950 | 1 mil | 1 mil | 1,1 mil antes de subir o passo.
    const axis = chartAxis(Array.from({ length: 30 }, () => 100_000))!;

    expect(axis.domain).toEqual([90_000, 110_000]);
    expect(axis.ticks).toEqual([90_000, 100_000, 110_000]);
    expectEvenTicks(axis);
  });

  it("não repete rótulos perto de R$ 1 milhão (arredonda em mi)", () => {
    // 900 mil | 950 mil | 1 mi | 1 mi | 1,1 mi antes de subir o passo.
    const axis = chartAxis([100_000_000, 100_000_000])!;

    expect(axis.domain).toEqual([90_000_000, 110_000_000]);
    expect(axis.ticks).toEqual([90_000_000, 100_000_000, 110_000_000]);
    expectEvenTicks(axis);
  });

  it("não repete rótulos numa faixa estreita de milhares", () => {
    // -3150 | -3140 | -3130 | -3120 | -3110 viram -3,1 mil repetido.
    const axis = chartAxis([-314_482, -311_499])!;

    expect(axis.domain).toEqual([-320_000, -310_000]);
    expect(axis.ticks).toEqual([-320_000, -310_000]);
    expectEvenTicks(axis);
  });

  it("não cruza o zero numa série constante positiva de R$ 1,00", () => {
    const axis = chartAxis([100, 100, 100])!;

    expect(axis.domain).toEqual([0, 600]);
    expect(axis.ticks).toEqual([0, 200, 400, 600]);
    expectEvenTicks(axis);
  });

  it("não cruza o zero numa série constante negativa de -R$ 3,00", () => {
    const axis = chartAxis([-300, -300, -300])!;

    expect(axis.domain).toEqual([-800, 0]);
    expect(axis.ticks).toEqual([-800, -600, -400, -200, 0]);
    expectEvenTicks(axis);
  });
});
