import { describe, expect, it } from "vitest";

import {
  currencyLabel,
  defaultPeriodLabel,
  isSessionUnavailable,
  localeLabel,
  parseDefaultPeriod,
  resolveDefaultPeriod,
  settingsSummary,
  themeLabel,
} from "./settings-view";

describe("parseDefaultPeriod", () => {
  it("aceita apenas presets válidos", () => {
    expect(parseDefaultPeriod("7d")).toBe("7d");
    expect(parseDefaultPeriod("90d")).toBe("90d");
    expect(parseDefaultPeriod("ytd")).toBe("ytd");
  });

  it("rejeita custom, lixo e valores ausentes", () => {
    expect(parseDefaultPeriod("custom")).toBeNull();
    expect(parseDefaultPeriod("2w")).toBeNull();
    expect(parseDefaultPeriod("")).toBeNull();
    expect(parseDefaultPeriod(null)).toBeNull();
    expect(parseDefaultPeriod(undefined)).toBeNull();
  });
});

describe("resolveDefaultPeriod", () => {
  it("cai no padrão do app quando não há preferência válida", () => {
    expect(resolveDefaultPeriod(null)).toBe("30d");
    expect(resolveDefaultPeriod("inválido")).toBe("30d");
    expect(resolveDefaultPeriod("12m")).toBe("12m");
  });
});

describe("defaultPeriodLabel", () => {
  it("usa o rótulo de PERIOD_OPTIONS", () => {
    expect(defaultPeriodLabel("30d")).toBe("Últimos 30 dias");
    expect(defaultPeriodLabel("ytd")).toBe("Este ano");
  });
});

describe("settingsSummary", () => {
  it("resume tema, idioma e moeda em pt-BR, sem código técnico", () => {
    expect(settingsSummary({ theme: "dark", locale: "pt-BR", currency: "BRL" })).toBe(
      "Escuro · Português (Brasil) · Real",
    );
    expect(settingsSummary({ theme: "system", locale: "pt-BR", currency: "BRL" })).toBe(
      "Sistema · Português (Brasil) · Real",
    );
  });

  it("mantém o valor original quando o locale ou a moeda são desconhecidos", () => {
    expect(localeLabel("en-US")).toBe("en-US");
    expect(currencyLabel("USD")).toBe("USD");
  });

  it("explica quando a API não devolveu settings", () => {
    expect(settingsSummary(null)).toBe("Preferências da conta indisponíveis");
  });
});

describe("themeLabel", () => {
  it("traduz os três temas do contrato", () => {
    expect(themeLabel("dark")).toBe("Escuro");
    expect(themeLabel("light")).toBe("Claro");
    expect(themeLabel("system")).toBe("Sistema");
  });
});

describe("isSessionUnavailable", () => {
  it("trata 401 e 404 como sessão indisponível", () => {
    expect(isSessionUnavailable({ status: 401, message: "Sessão expirada" })).toBe(true);
    expect(isSessionUnavailable({ status: 404, message: "Rota não encontrada" })).toBe(true);
  });

  it("não esconde outros erros", () => {
    expect(isSessionUnavailable({ status: 500, message: "Erro interno" })).toBe(false);
    expect(isSessionUnavailable(new Error("rede"))).toBe(false);
    expect(isSessionUnavailable(null)).toBe(false);
  });
});
