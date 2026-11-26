import { describe, expect, it } from "vitest";

import {
  createCategoryBody,
  createConnectionBody,
  loginBody,
  setupBody,
  updateSettingsBody,
  updateTransactionBody,
} from "../index";

describe("loginBody", () => {
  it("aceita email e senha", () => {
    expect(loginBody.parse({ email: "demo@finance.local", password: "demo1234" })).toEqual({
      email: "demo@finance.local",
      password: "demo1234",
    });
  });

  it("rejeita email inválido e senha vazia", () => {
    expect(loginBody.safeParse({ email: "demo", password: "demo1234" }).success).toBe(false);
    expect(loginBody.safeParse({ email: "demo@finance.local", password: "" }).success).toBe(false);
  });
});

describe("setupBody", () => {
  it("exige senha com ao menos 8 caracteres", () => {
    expect(
      setupBody.safeParse({ email: "eu@exemplo.com", name: "Cainan", password: "1234567" }).success,
    ).toBe(false);
    expect(
      setupBody.safeParse({ email: "eu@exemplo.com", name: "Cainan", password: "12345678" })
        .success,
    ).toBe(true);
  });
});

describe("updateTransactionBody", () => {
  it("aceita categoryId e notes, inclusive null", () => {
    expect(updateTransactionBody.parse({ categoryId: "cat_1" })).toEqual({ categoryId: "cat_1" });
    expect(updateTransactionBody.parse({ categoryId: null, notes: null })).toEqual({
      categoryId: null,
      notes: null,
    });
  });

  it("rejeita corpo vazio", () => {
    expect(updateTransactionBody.safeParse({}).success).toBe(false);
  });

  it("rejeita notes acima de 2000 caracteres", () => {
    expect(updateTransactionBody.safeParse({ notes: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("createCategoryBody", () => {
  const valid = {
    name: "Mercado",
    icon: "ShoppingCart",
    color: "#22c55e",
    kind: "expense",
  };

  it("aceita categoria válida", () => {
    expect(createCategoryBody.parse(valid)).toEqual(valid);
  });

  it("rejeita cor fora do formato #RRGGBB e kind desconhecido", () => {
    expect(createCategoryBody.safeParse({ ...valid, color: "22c55e" }).success).toBe(false);
    expect(createCategoryBody.safeParse({ ...valid, kind: "savings" }).success).toBe(false);
  });

  it("rejeita slug inválido", () => {
    expect(createCategoryBody.safeParse({ ...valid, slug: "Mercado Livre" }).success).toBe(false);
  });
});

describe("createConnectionBody", () => {
  it("aceita provider demo sem campos extras", () => {
    expect(createConnectionBody.parse({ provider: "demo" })).toEqual({ provider: "demo" });
  });

  it("exige itemId para pluggy", () => {
    expect(createConnectionBody.safeParse({ provider: "pluggy" }).success).toBe(false);
    expect(createConnectionBody.safeParse({ provider: "pluggy", itemId: "item_1" }).success).toBe(
      true,
    );
  });

  it("rejeita provider desconhecido", () => {
    expect(createConnectionBody.safeParse({ provider: "belvo" }).success).toBe(false);
  });
});

describe("updateSettingsBody", () => {
  it("aceita atualização parcial", () => {
    expect(updateSettingsBody.parse({ theme: "light" })).toEqual({ theme: "light" });
  });

  it("rejeita corpo vazio e tema inválido", () => {
    expect(updateSettingsBody.safeParse({}).success).toBe(false);
    expect(updateSettingsBody.safeParse({ theme: "blue" }).success).toBe(false);
  });
});
