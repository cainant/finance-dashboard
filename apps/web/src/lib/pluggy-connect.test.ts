import { describe, expect, it } from "vitest";

import {
  PLUGGY_CONNECT_SCRIPT_URL,
  isPluggyWidgetEnabled,
  normalizePluggyItemId,
  readPluggyItemId,
  widgetErrorMessage,
} from "./pluggy-connect";

const ITEM_ID = "e062ab2b-4d4f-4b9d-9f7f-8f6a5d4c3b2a";

describe("Pluggy Connect", () => {
  it("fixa a versão oficial do script no CDN", () => {
    expect(PLUGGY_CONNECT_SCRIPT_URL).toBe(
      "https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js",
    );
  });
});

describe("normalizePluggyItemId", () => {
  it("remove espaços, aspas e delimitadores ao redor", () => {
    expect(normalizePluggyItemId(`  ${ITEM_ID}  `)).toBe(ITEM_ID);
    expect(normalizePluggyItemId(`"${ITEM_ID}"`)).toBe(ITEM_ID);
    expect(normalizePluggyItemId(`<${ITEM_ID}>`)).toBe(ITEM_ID);
    expect(normalizePluggyItemId("`e062ab2b`")).toBe("e062ab2b");
  });

  it("aceita URL do Dashboard e parâmetro itemId", () => {
    expect(normalizePluggyItemId(`https://dashboard.pluggy.ai/items/${ITEM_ID}`)).toBe(ITEM_ID);
    expect(
      normalizePluggyItemId(`https://dashboard.pluggy.ai/items?itemId=${ITEM_ID}&tab=accounts`),
    ).toBe(ITEM_ID);
    expect(normalizePluggyItemId(`itemId=${ITEM_ID}&tab=accounts`)).toBe(ITEM_ID);
  });

  it("rejeita valores vazios ou que não parecem um id", () => {
    expect(normalizePluggyItemId("")).toBeNull();
    expect(normalizePluggyItemId("   ")).toBeNull();
    expect(normalizePluggyItemId("dois valores")).toBeNull();
    expect(normalizePluggyItemId("https://dashboard.pluggy.ai/items/")).toBeNull();
    expect(normalizePluggyItemId("https://dashboard.pluggy.ai/items")).toBeNull();
    expect(normalizePluggyItemId("%E0%A4%A")).toBeNull();
  });
});

describe("readPluggyItemId", () => {
  it("lê o item do payload do widget", () => {
    expect(readPluggyItemId({ item: { id: ITEM_ID } })).toBe(ITEM_ID);
    expect(readPluggyItemId({ itemId: ITEM_ID })).toBe(ITEM_ID);
  });

  it("devolve null quando o payload não traz um id válido", () => {
    expect(readPluggyItemId(null)).toBeNull();
    expect(readPluggyItemId({})).toBeNull();
    expect(readPluggyItemId({ item: { id: "" } })).toBeNull();
    expect(readPluggyItemId({ item: { id: "id inválido" } })).toBeNull();
  });
});

describe("widgetErrorMessage", () => {
  it("traduz o erro do widget para pt-BR e preserva a mensagem útil", () => {
    expect(widgetErrorMessage({ message: "Invalid credentials" })).toBe(
      "O Pluggy Connect encontrou um erro: Invalid credentials",
    );
    expect(widgetErrorMessage(null)).toContain("Feche a janela e tente novamente");
    expect(widgetErrorMessage({})).toContain("Feche a janela e tente novamente");
  });
});

describe("isPluggyWidgetEnabled", () => {
  const pluggy = {
    id: "pluggy" as const,
    configured: true,
    supportsConnectWidget: true,
  };

  it("exige provider configurado e com suporte ao widget", () => {
    expect(isPluggyWidgetEnabled([pluggy])).toBe(true);
    expect(isPluggyWidgetEnabled([{ ...pluggy, configured: false }])).toBe(false);
    expect(isPluggyWidgetEnabled([{ ...pluggy, supportsConnectWidget: false }])).toBe(false);
    expect(isPluggyWidgetEnabled([{ ...pluggy, id: "demo" as const }])).toBe(false);
  });

  it("trata listas ausentes", () => {
    expect(isPluggyWidgetEnabled(null)).toBe(false);
    expect(isPluggyWidgetEnabled(undefined)).toBe(false);
    expect(isPluggyWidgetEnabled([])).toBe(false);
  });
});
