import { describe, expect, it } from "vitest";

import {
  classifyGesture,
  EDGE_GUARD_PX,
  isSwipeArmed,
  startsInEdgeGuard,
  SWIPE_ARM_PX,
  SWIPE_MAX_PX,
  swipeOffset,
} from "./swipe-gesture";

describe("classifyGesture", () => {
  it("espera enquanto o movimento é menor que o limiar", () => {
    expect(classifyGesture(4, 3)).toBe("pending");
    expect(classifyGesture(-9, 0)).toBe("pending");
  });

  it("assume o gesto só quando o movimento é claramente horizontal", () => {
    expect(classifyGesture(-30, 4)).toBe("horizontal");
    expect(classifyGesture(30, -10)).toBe("horizontal");
  });

  it("deixa a rolagem vertical com a página", () => {
    expect(classifyGesture(2, 24)).toBe("vertical");
    expect(classifyGesture(0, -40)).toBe("vertical");
  });

  it("na diagonal ambígua cai em vertical", () => {
    // 20 contra 15: horizontal dominante, mas não o bastante.
    expect(classifyGesture(-20, 15)).toBe("vertical");
    expect(classifyGesture(-20, 20)).toBe("vertical");
  });
});

describe("swipeOffset", () => {
  it("só abre para a esquerda", () => {
    expect(swipeOffset(0)).toBe(0);
    expect(swipeOffset(40)).toBe(0);
    expect(swipeOffset(-40)).toBe(-40);
  });

  it("acompanha o dedo até o máximo e depois resiste", () => {
    expect(swipeOffset(-SWIPE_MAX_PX)).toBe(-SWIPE_MAX_PX);
    expect(swipeOffset(-(SWIPE_MAX_PX + 30))).toBe(-(SWIPE_MAX_PX + 10));
  });
});

describe("isSwipeArmed", () => {
  it("arma ao passar do limiar e desarma antes dele", () => {
    expect(isSwipeArmed(-(SWIPE_ARM_PX - 1))).toBe(false);
    expect(isSwipeArmed(-SWIPE_ARM_PX)).toBe(true);
    expect(isSwipeArmed(0)).toBe(false);
  });
});

describe("startsInEdgeGuard", () => {
  it("ignora toques colados nas bordas (voltar do sistema)", () => {
    expect(startsInEdgeGuard(4, 390)).toBe(true);
    expect(startsInEdgeGuard(390 - 4, 390)).toBe(true);
  });

  it("aceita toques fora da faixa", () => {
    expect(startsInEdgeGuard(EDGE_GUARD_PX, 390)).toBe(false);
    expect(startsInEdgeGuard(200, 390)).toBe(false);
  });
});
