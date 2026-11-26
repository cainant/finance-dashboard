import { describe, expect, it } from "vitest";

import { buildScrubGeometry, nearestIndex, pointerFraction } from "./chart-scrub";

const LAYOUT = { width: 100, height: 50, padX: 5, padTop: 5, padBottom: 5 };

describe("nearestIndex", () => {
  it("mapeia a fração da largura para o ponto mais próximo", () => {
    expect(nearestIndex(0, 5)).toBe(0);
    expect(nearestIndex(1, 5)).toBe(4);
    expect(nearestIndex(0.5, 5)).toBe(2);
    expect(nearestIndex(0.37, 5)).toBe(1);
    expect(nearestIndex(0.63, 5)).toBe(3);
  });

  it("limita a posição às pontas (arrastar para fora do gráfico)", () => {
    expect(nearestIndex(-3, 5)).toBe(0);
    expect(nearestIndex(9, 5)).toBe(4);
  });

  it("trata série vazia, de um ponto e entrada inválida", () => {
    expect(nearestIndex(0.7, 0)).toBe(0);
    expect(nearestIndex(0.7, 1)).toBe(0);
    expect(nearestIndex(Number.NaN, 5)).toBe(0);
  });
});

describe("pointerFraction", () => {
  it("normaliza e limita o clientX dentro do elemento", () => {
    expect(pointerFraction(150, 100, 200)).toBe(0.25);
    expect(pointerFraction(50, 100, 200)).toBe(0);
    expect(pointerFraction(999, 100, 200)).toBe(1);
  });

  it("não divide por zero", () => {
    expect(pointerFraction(10, 0, 0)).toBe(0);
  });
});

describe("buildScrubGeometry", () => {
  it("espalha os pontos pela largura útil e inverte o eixo Y", () => {
    const geometry = buildScrubGeometry([10, 20, 30], LAYOUT);

    expect(geometry.xs).toEqual([5, 50, 95]);
    // Maior valor fica mais alto (menor y) que o menor.
    expect(geometry.ys[2]!).toBeLessThan(geometry.ys[0]!);
    expect(geometry.ys.every((y) => y >= 5 && y <= 45)).toBe(true);
    expect(geometry.linePath.startsWith("M5.0,")).toBe(true);
    expect(geometry.areaPath.endsWith("Z")).toBe(true);
  });

  it("série constante fica numa linha horizontal no meio", () => {
    const geometry = buildScrubGeometry([7, 7, 7], LAYOUT);

    expect(new Set(geometry.ys).size).toBe(1);
    expect(geometry.ys[0]).toBeCloseTo(25, 5);
  });

  it("um ponto fica centralizado e série vazia não gera caminho", () => {
    expect(buildScrubGeometry([5], LAYOUT).xs).toEqual([50]);
    expect(buildScrubGeometry([], LAYOUT).linePath).toBe("");
  });
});
