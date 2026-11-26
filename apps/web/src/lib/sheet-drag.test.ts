import { describe, expect, it } from "vitest";

import {
  clampDragDistance,
  dragVelocity,
  keyboardInset,
  scrimOpacityForDrag,
  shouldDismissSheet,
} from "./sheet-drag";

describe("shouldDismissSheet", () => {
  it("fecha ao passar da distância mesmo devagar", () => {
    expect(shouldDismissSheet({ distance: 120, velocity: 0 })).toBe(true);
    expect(shouldDismissSheet({ distance: 119, velocity: 0 })).toBe(false);
  });

  it("fecha num arremesso rápido com pouca distância", () => {
    expect(shouldDismissSheet({ distance: 40, velocity: 0.6 })).toBe(true);
    expect(shouldDismissSheet({ distance: 40, velocity: 0.54 })).toBe(false);
  });

  it("ignora arremesso de um toque trêmulo (distância mínima)", () => {
    expect(shouldDismissSheet({ distance: 4, velocity: 2 })).toBe(false);
  });

  it("não fecha ao subir (velocidade negativa)", () => {
    expect(shouldDismissSheet({ distance: 30, velocity: -1 })).toBe(false);
  });
});

describe("dragVelocity", () => {
  it("calcula px/ms entre as duas últimas amostras", () => {
    expect(dragVelocity({ y: 100, time: 1000 }, { y: 130, time: 1030 })).toBeCloseTo(1);
  });

  it("zera quando o dedo parou antes de soltar", () => {
    const previous = { y: 100, time: 1000 };
    const last = { y: 160, time: 1020 };

    expect(dragVelocity(previous, last, 1200)).toBe(0);
    expect(dragVelocity(previous, last, 1060)).toBeGreaterThan(0);
  });

  it("não divide por zero com amostras no mesmo instante", () => {
    expect(Number.isFinite(dragVelocity({ y: 0, time: 5 }, { y: 10, time: 5 }))).toBe(true);
  });
});

describe("clampDragDistance e scrim", () => {
  it("não deixa o sheet subir além da posição aberta", () => {
    expect(clampDragDistance(-40)).toBe(0);
    expect(clampDragDistance(55)).toBe(55);
  });

  it("clareia o scrim proporcionalmente à altura", () => {
    expect(scrimOpacityForDrag(0, 500)).toBe(1);
    expect(scrimOpacityForDrag(500, 500)).toBe(0);
    expect(scrimOpacityForDrag(100, 500)).toBeCloseTo(0.72);
    expect(scrimOpacityForDrag(10, 0)).toBe(1);
  });
});

describe("keyboardInset", () => {
  it("mede o teclado pela diferença entre layout e visual viewport", () => {
    expect(keyboardInset({ layoutHeight: 800, visualHeight: 500, visualOffsetTop: 0 })).toBe(300);
  });

  it("desconta o offset do visual viewport rolado", () => {
    expect(keyboardInset({ layoutHeight: 800, visualHeight: 500, visualOffsetTop: 100 })).toBe(200);
  });

  it("sem teclado (ruído de subpixel) é zero", () => {
    expect(keyboardInset({ layoutHeight: 800, visualHeight: 799.5, visualOffsetTop: 0 })).toBe(0);
  });
});
