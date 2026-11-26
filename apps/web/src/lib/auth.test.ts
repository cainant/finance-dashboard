import { describe, expect, it } from "vitest";

import { loginErrorMessage, safeRedirect, userInitials } from "./auth";

describe("safeRedirect", () => {
  it("aceita caminhos internos", () => {
    expect(safeRedirect("/transactions?period=90d")).toBe("/transactions?period=90d");
    expect(safeRedirect("/")).toBe("/");
  });

  it("bloqueia open redirect", () => {
    expect(safeRedirect("//evil.com")).toBe("/");
    expect(safeRedirect("https://evil.com")).toBe("/");
    expect(safeRedirect("/\\evil.com")).toBe("/");
    expect(safeRedirect(undefined)).toBe("/");
  });

  it("usa fallback customizado", () => {
    expect(safeRedirect(undefined, "/accounts")).toBe("/accounts");
  });
});

describe("userInitials", () => {
  it("usa primeira e última iniciais", () => {
    expect(userInitials("Cainan Silva")).toBe("CS");
    expect(userInitials("Ana Paula de Souza")).toBe("AS");
  });

  it("lida com nome único e vazio", () => {
    expect(userInitials("Demo")).toBe("DE");
    expect(userInitials("  ")).toBe("?");
  });
});

describe("loginErrorMessage", () => {
  it("mapeia códigos conhecidos para mensagens amigáveis", () => {
    expect(loginErrorMessage("github_not_allowed")).toContain("GitHub");
    expect(loginErrorMessage("access_denied")).toContain("cancelada");
  });

  it("tem mensagem genérica e nulo sem código", () => {
    expect(loginErrorMessage("desconhecido")).toContain("Não foi possível");
    expect(loginErrorMessage(undefined)).toBeNull();
  });
});
