import { describe, expect, it } from "vitest";

import { historyIndex, NavTrail, screenLabel } from "./nav-trail";

const at = (pathname: string, index?: number) => ({
  pathname,
  state: index === undefined ? {} : { __TSR_index: index },
});

describe("NavTrail", () => {
  it("lembra a tela anterior de uma navegação por push", () => {
    const trail = new NavTrail();
    trail.record(at("/accounts", 3), at("/accounts/abc", 4));

    expect(trail.previousOf(4)).toBe("/accounts");
  });

  it("não inventa uma entrada anterior desconhecida (reload, deep link)", () => {
    const trail = new NavTrail();
    trail.record(null, at("/accounts/abc", 4));

    expect(trail.previousOf(4)).toBeNull();
    expect(trail.previousOf(0)).toBeNull();
    expect(trail.previousOf(null)).toBeNull();
  });

  it("sobrescreve a entrada quando um novo push ocupa o mesmo índice", () => {
    const trail = new NavTrail();
    trail.record(at("/accounts", 3), at("/accounts/abc", 4));
    trail.record(at("/", 3), at("/transactions", 4));

    expect(trail.previousOf(4)).toBe("/");
  });

  it("ignora localizações sem índice de histórico", () => {
    const trail = new NavTrail();
    trail.record(at("/accounts"), at("/accounts/abc"));

    expect(trail.previousOf(1)).toBeNull();
  });
});

describe("historyIndex", () => {
  it("lê o índice do estado do router", () => {
    expect(historyIndex(at("/", 2))).toBe(2);
    expect(historyIndex(at("/"))).toBeNull();
    expect(historyIndex(null)).toBeNull();
  });
});

describe("screenLabel", () => {
  it("nomeia as telas principais e herda o nome das rotas filhas", () => {
    expect(screenLabel("/")).toBe("Visão geral");
    expect(screenLabel("/accounts")).toBe("Contas");
    expect(screenLabel("/accounts/abc")).toBe("Contas");
    expect(screenLabel("/credit-cards")).toBe("Cartões");
    expect(screenLabel("/transactions")).toBe("Transações");
    expect(screenLabel("/more")).toBe("Mais");
  });

  it("cai em 'Voltar' para caminhos desconhecidos", () => {
    expect(screenLabel("/desconhecido")).toBe("Voltar");
  });
});
