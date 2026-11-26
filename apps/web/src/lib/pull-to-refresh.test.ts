import { describe, expect, it } from "vitest";

import {
  canStartPull,
  classifyPull,
  isPullArmed,
  isTextEntryActive,
  PULL_MAX,
  PULL_SLOP,
  PULL_THRESHOLD,
  pullDistance,
  pullProgress,
} from "./pull-to-refresh";

describe("classifyPull", () => {
  it("espera enquanto o dedo mal se moveu", () => {
    expect(classifyPull(0, 0)).toBe("undecided");
    expect(classifyPull(2, PULL_SLOP)).toBe("undecided");
  });

  it("reconhece um puxão vertical para baixo", () => {
    expect(classifyPull(3, PULL_SLOP + 1)).toBe("pull");
    expect(classifyPull(-8, 60)).toBe("pull");
  });

  it("abandona a rolagem para cima", () => {
    expect(classifyPull(0, -6)).toBe("abort");
  });

  it("abandona gestos mais horizontais que verticais", () => {
    expect(classifyPull(40, 20)).toBe("abort");
    expect(classifyPull(-40, 30)).toBe("abort");
  });

  it("tolera um desvio horizontal pequeno diante de um puxão claro", () => {
    expect(classifyPull(25, 80)).toBe("pull");
  });
});

describe("pullDistance", () => {
  it("é zero até a folga inicial", () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(PULL_SLOP)).toBe(0);
    expect(pullDistance(-50)).toBe(0);
  });

  it("cresce com resistência: cada px a mais rende menos", () => {
    const first = pullDistance(PULL_SLOP + 50) - pullDistance(PULL_SLOP);
    const later = pullDistance(PULL_SLOP + 150) - pullDistance(PULL_SLOP + 100);

    expect(first).toBeGreaterThan(later);
  });

  it("nunca passa do máximo", () => {
    expect(pullDistance(10_000)).toBeLessThanOrEqual(PULL_MAX);
    expect(pullDistance(10_000)).toBeGreaterThan(PULL_MAX - 1);
  });

  it("alcança o limiar com cerca de 115px de dedo, não antes de 90", () => {
    expect(pullDistance(90)).toBeLessThan(PULL_THRESHOLD);
    expect(pullDistance(130)).toBeGreaterThanOrEqual(PULL_THRESHOLD);
  });
});

describe("isPullArmed / pullProgress", () => {
  it("arma no limiar exato", () => {
    expect(isPullArmed(PULL_THRESHOLD - 0.1)).toBe(false);
    expect(isPullArmed(PULL_THRESHOLD)).toBe(true);
  });

  it("limita o progresso entre 0 e 1", () => {
    expect(pullProgress(-5)).toBe(0);
    expect(pullProgress(PULL_THRESHOLD / 2)).toBeCloseTo(0.5);
    expect(pullProgress(PULL_MAX)).toBe(1);
  });
});

describe("canStartPull", () => {
  const base = { scrollY: 0, touchCount: 1, blocked: false, insideExcludedRegion: false };

  it("ativa só com a página no topo, um dedo e livre", () => {
    expect(canStartPull(base)).toBe(true);
  });

  it("não ativa com a página rolada", () => {
    expect(canStartPull({ ...base, scrollY: 1 })).toBe(false);
  });

  it("não ativa com dois dedos (zoom)", () => {
    expect(canStartPull({ ...base, touchCount: 2 })).toBe(false);
  });

  it("não ativa quando a página está bloqueada ou em região excluída", () => {
    expect(canStartPull({ ...base, blocked: true })).toBe(false);
    expect(canStartPull({ ...base, insideExcludedRegion: true })).toBe(false);
  });
});

describe("isTextEntryActive", () => {
  const keyboardOpen = { viewportHeight: 500, windowHeight: 844 };
  const keyboardClosed = { viewportHeight: 844, windowHeight: 844 };

  it("campos de texto com teclado aberto bloqueiam", () => {
    for (const inputType of ["text", "search", "email", "number", "tel", "url", "password"]) {
      expect(isTextEntryActive({ focused: { tagName: "INPUT", inputType }, ...keyboardOpen })).toBe(
        true,
      );
    }
    expect(isTextEntryActive({ focused: { tagName: "TEXTAREA" }, ...keyboardOpen })).toBe(true);
    expect(
      isTextEntryActive({
        focused: { tagName: "DIV", isContentEditable: true },
        ...keyboardOpen,
      }),
    ).toBe(true);
  });

  it("checkbox, radio, range, botões e outros elementos não bloqueiam", () => {
    for (const inputType of ["checkbox", "radio", "range", "button", "submit", "file", "color"]) {
      expect(isTextEntryActive({ focused: { tagName: "INPUT", inputType }, ...keyboardOpen })).toBe(
        false,
      );
    }
    expect(isTextEntryActive({ focused: { tagName: "BUTTON" }, ...keyboardOpen })).toBe(false);
    expect(isTextEntryActive({ focused: null, ...keyboardOpen })).toBe(false);
  });

  it("campo focado com o teclado fechado (voltar no Android) não bloqueia", () => {
    expect(
      isTextEntryActive({ focused: { tagName: "INPUT", inputType: "search" }, ...keyboardClosed }),
    ).toBe(false);
  });

  it("sem visualViewport, o foco no campo basta", () => {
    expect(
      isTextEntryActive({
        focused: { tagName: "INPUT", inputType: "text" },
        windowHeight: 844,
      }),
    ).toBe(true);
  });
});
