import { describe, expect, it } from "vitest";

import {
  consumeNavigationOrigin,
  isDetailPath,
  markProgrammaticBack,
  PROGRAMMATIC_BACK_TTL_MS,
  recordPopState,
  shouldSkipForSystemBack,
  transitionTypeFor,
} from "./view-transitions";

describe("transitionTypeFor", () => {
  it("empurra ao entrar num detalhe", () => {
    expect(transitionTypeFor("/accounts", "/accounts/abc")).toBe("nav-forward");
    expect(transitionTypeFor("/credit-cards", "/credit-cards/abc")).toBe("nav-forward");
    expect(transitionTypeFor("/", "/accounts/abc")).toBe("nav-forward");
  });

  it("volta ao sair de um detalhe", () => {
    expect(transitionTypeFor("/accounts/abc", "/accounts")).toBe("nav-back");
    expect(transitionTypeFor("/credit-cards/abc", "/")).toBe("nav-back");
  });

  it("troca de aba é instantânea", () => {
    expect(transitionTypeFor("/", "/transactions")).toBe(false);
    expect(transitionTypeFor("/accounts", "/credit-cards")).toBe(false);
    expect(transitionTypeFor("/accounts", "/more")).toBe(false);
  });

  it("não anima quando só os search params mudam ou não há origem", () => {
    expect(transitionTypeFor("/accounts/abc", "/accounts/abc")).toBe(false);
    expect(transitionTypeFor(undefined, "/accounts/abc")).toBe(false);
  });

  it("não anima entre dois detalhes (nada no app liga um ao outro)", () => {
    expect(transitionTypeFor("/accounts/a", "/accounts/b")).toBe(false);
  });
});

describe("isDetailPath", () => {
  it("reconhece só as telas de detalhe", () => {
    expect(isDetailPath("/accounts/abc")).toBe(true);
    expect(isDetailPath("/accounts/abc/")).toBe(true);
    expect(isDetailPath("/credit-cards/abc")).toBe(true);
    expect(isDetailPath("/accounts")).toBe(false);
    expect(isDetailPath("/transactions/abc")).toBe(false);
  });
});

describe("shouldSkipForSystemBack", () => {
  const base = { now: 1_000, origin: { lastPopAt: 900, programmatic: false }, isIosWebKit: true };

  it("pula a transição no iOS quando o voltar veio do sistema", () => {
    expect(shouldSkipForSystemBack(base)).toBe(true);
  });

  it("mantém a transição no botão voltar do app", () => {
    expect(
      shouldSkipForSystemBack({ ...base, origin: { lastPopAt: 900, programmatic: true } }),
    ).toBe(false);
  });

  it("mantém a transição fora do iOS (Android não anima o voltar sozinho)", () => {
    expect(shouldSkipForSystemBack({ ...base, isIosWebKit: false })).toBe(false);
  });

  it("ignora um popstate antigo e a ausência dele", () => {
    expect(shouldSkipForSystemBack({ ...base, now: 10_000 })).toBe(false);
    expect(
      shouldSkipForSystemBack({ ...base, origin: { lastPopAt: null, programmatic: false } }),
    ).toBe(false);
  });
});

describe("origem da navegação (voltar programático)", () => {
  it("o voltar do botão vale para a navegação que o consome e depois zera", () => {
    consumeNavigationOrigin(0);
    markProgrammaticBack(1_000);
    recordPopState(1_005);

    expect(consumeNavigationOrigin(1_010)).toEqual({ lastPopAt: 1_005, programmatic: true });
    expect(consumeNavigationOrigin(1_020)).toEqual({ lastPopAt: null, programmatic: false });
  });

  it("history.back() sem navegação: a marca expira e não contamina a próxima", () => {
    consumeNavigationOrigin(0);
    markProgrammaticBack(1_000);

    // Nenhum popstate; uma navegação qualquer bem depois (ex.: gesto do sistema).
    const later = 1_000 + PROGRAMMATIC_BACK_TTL_MS + 1;
    recordPopState(later);

    expect(consumeNavigationOrigin(later + 5)).toEqual({ lastPopAt: later, programmatic: false });
  });

  it("a marca expirada não faz o iOS tratar o gesto do sistema como botão do app", () => {
    consumeNavigationOrigin(0);
    markProgrammaticBack(0);
    const popAt = PROGRAMMATIC_BACK_TTL_MS + 100;
    recordPopState(popAt);

    expect(
      shouldSkipForSystemBack({
        now: popAt + 5,
        origin: consumeNavigationOrigin(popAt + 5),
        isIosWebKit: true,
      }),
    ).toBe(true);
  });
});
