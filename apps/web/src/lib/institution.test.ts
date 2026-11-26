import { describe, expect, it } from "vitest";

import { getInitials, institutionTone, isLightHexColor } from "./institution";

describe("getInitials", () => {
  it("usa as iniciais das duas primeiras palavras significativas", () => {
    expect(getInitials("Banco Aurora")).toBe("BA");
    expect(getInitials("Cooperativa Horizonte de Crédito")).toBe("CH");
  });

  it("usa duas letras para nomes de uma palavra", () => {
    expect(getInitials("Nuvem")).toBe("NU");
    expect(getInitials("  itaú  ")).toBe("IT");
  });

  it("devolve interrogação para entrada vazia", () => {
    expect(getInitials("")).toBe("?");
    expect(getInitials("   ")).toBe("?");
  });
});

describe("institutionTone", () => {
  it("é determinística para o mesmo nome", () => {
    expect(institutionTone("Banco Aurora")).toEqual(institutionTone("Banco Aurora"));
  });

  it("varia entre nomes diferentes", () => {
    const backgrounds = ["Banco Aurora", "Nuvem Bank", "Cooperativa Horizonte"].map(
      (name) => institutionTone(name).background,
    );

    expect(new Set(backgrounds).size).toBeGreaterThan(1);
  });
});

describe("isLightHexColor", () => {
  it("detecta cores claras e escuras", () => {
    expect(isLightHexColor("#ffffff")).toBe(true);
    expect(isLightHexColor("#facc15")).toBe(true);
    expect(isLightHexColor("#0f172a")).toBe(false);
    expect(isLightHexColor("#fff")).toBe(true);
  });

  it("considera inválidas como escuras (texto claro)", () => {
    expect(isLightHexColor("not-a-color")).toBe(false);
  });
});
