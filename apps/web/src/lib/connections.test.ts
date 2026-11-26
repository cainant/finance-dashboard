import { describe, expect, it } from "vitest";

import {
  connectionStatusMeta,
  formatRelativeTime,
  formatRelativeTimeShort,
  hasLiveConnections,
  syncRunSummary,
} from "./connections";

describe("connectionStatusMeta", () => {
  it("traduz os status do contrato", () => {
    expect(connectionStatusMeta("active")).toMatchObject({ label: "Ativa", tone: "success" });
    expect(connectionStatusMeta("syncing")).toMatchObject({ label: "Sincronizando", pulse: true });
    expect(connectionStatusMeta("login_required")).toMatchObject({
      label: "Reconectar",
      tone: "warning",
    });
    expect(connectionStatusMeta("error").tone).toBe("danger");
    expect(connectionStatusMeta("disconnected").tone).toBe("neutral");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");

  it("formata minutos, horas e dias em pt-BR", () => {
    expect(formatRelativeTime("2026-11-10T11:55:00.000Z", now)).toBe("há 5 minutos");
    expect(formatRelativeTime("2026-11-10T09:00:00.000Z", now)).toBe("há 3 horas");
    expect(formatRelativeTime("2026-11-05T12:00:00.000Z", now)).toBe("há 5 dias");
  });

  it("trata valores ausentes e muito recentes", () => {
    expect(formatRelativeTime(null, now)).toBe("Nunca sincronizada");
    expect(formatRelativeTime("2026-11-10T11:59:45.000Z", now)).toBe("agora mesmo");
    expect(formatRelativeTime("data inválida", now)).toBe("Data inválida");
  });
});

describe("formatRelativeTimeShort", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");

  it("encurta as unidades para o rodapé da sidebar", () => {
    expect(formatRelativeTimeShort("2026-11-10T11:57:00.000Z", now)).toBe("há 3 min");
    expect(formatRelativeTimeShort("2026-11-10T10:00:00.000Z", now)).toBe("há 2 h");
    expect(formatRelativeTimeShort("2026-11-05T12:00:00.000Z", now)).toBe("há 5 d");
    expect(formatRelativeTimeShort("2026-09-10T12:00:00.000Z", now)).toBe("há 2 meses");
    expect(formatRelativeTimeShort("2025-11-10T12:00:00.000Z", now)).toBe("há 1 ano");
  });

  it("usa 'agora' para menos de um minuto", () => {
    expect(formatRelativeTimeShort("2026-11-10T11:59:45.000Z", now)).toBe("agora");
  });
});

describe("hasLiveConnections", () => {
  it("conta como viva qualquer conexão que não foi desconectada", () => {
    expect(hasLiveConnections([])).toBe(false);
    expect(hasLiveConnections([{ status: "disconnected" }])).toBe(false);
    expect(hasLiveConnections([{ status: "active" }])).toBe(true);
    // Reconectar/atualizar ainda é uma instituição na tela: não é estado vazio.
    expect(hasLiveConnections([{ status: "disconnected" }, { status: "login_required" }])).toBe(
      true,
    );
    expect(hasLiveConnections([{ status: "error" }])).toBe(true);
    expect(hasLiveConnections([{ status: "outdated" }])).toBe(true);
  });
});

describe("syncRunSummary", () => {
  it("resume os contadores relevantes", () => {
    expect(syncRunSummary({ transactions: 120, accounts: 3, bills: 2 })).toBe(
      "120 transações · 3 contas · 2 faturas",
    );
  });

  it("lida com stats ausentes ou vazios", () => {
    expect(syncRunSummary(null)).toBe("Sem estatísticas");
    expect(syncRunSummary({})).toBe("Sem estatísticas");
  });
});
