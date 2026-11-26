import { describe, expect, it } from "vitest";

import {
  asProviderError,
  isProviderError,
  ProviderError,
  providerErrorFromStatus,
  sanitizeProviderMessage,
} from "../src";

describe("ProviderError", () => {
  it("aplica retryable padrão por código e permite sobrescrever", () => {
    expect(new ProviderError("unavailable", "x").retryable).toBe(true);
    expect(new ProviderError("rate_limited", "x").retryable).toBe(true);
    expect(new ProviderError("auth_failed", "x").retryable).toBe(false);
    expect(new ProviderError("login_required", "x").retryable).toBe(false);
    expect(new ProviderError("not_found", "x").retryable).toBe(false);
    expect(new ProviderError("invalid_response", "x").retryable).toBe(false);
    expect(new ProviderError("not_found", "x", { retryable: true }).retryable).toBe(true);
  });

  it("carrega status, retryAfterMs, details e cause", () => {
    const cause = new Error("original");
    const error = new ProviderError("rate_limited", "Tente depois.", {
      status: 429,
      retryAfterMs: 1_500,
      details: { codeDescription: "RATE_LIMIT" },
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ProviderError");
    expect(error.status).toBe(429);
    expect(error.retryAfterMs).toBe(1_500);
    expect(error.details).toEqual({ codeDescription: "RATE_LIMIT" });
    expect(error.cause).toBe(cause);
  });

  it("normaliza exceções desconhecidas e preserva ProviderError", () => {
    const typed = new ProviderError("auth_failed", "sem credencial");
    expect(asProviderError(typed)).toBe(typed);

    const fallback = asProviderError(new Error("boom"));
    expect(fallback.code).toBe("unavailable");
    expect(fallback.retryable).toBe(true);
    expect(fallback.cause).toBeInstanceOf(Error);

    const abort = new Error("aborted");
    abort.name = "AbortError";
    const aborted = asProviderError(abort);
    expect(aborted.code).toBe("unavailable");
    expect(aborted.retryable).toBe(false);
    expect(isProviderError(aborted)).toBe(true);
  });

  it("mapeia status HTTP para códigos de domínio", () => {
    expect(providerErrorFromStatus(401)).toMatchObject({
      code: "auth_failed",
      retryable: false,
      status: 401,
    });
    expect(providerErrorFromStatus(403).code).toBe("auth_failed");
    expect(providerErrorFromStatus(404).code).toBe("not_found");
    expect(providerErrorFromStatus(429)).toMatchObject({
      code: "rate_limited",
      retryable: true,
    });
    expect(providerErrorFromStatus(400).code).toBe("invalid_response");
    expect(providerErrorFromStatus(409).code).toBe("invalid_response");
    expect(providerErrorFromStatus(503)).toMatchObject({
      code: "unavailable",
      retryable: true,
    });
  });

  it("sanitiza mensagens sem vazar credenciais", () => {
    expect(sanitizeProviderMessage("  falha\n interna  ", "fallback")).toBe("falha interna");
    expect(sanitizeProviderMessage("x-api-key: super-secret", "fallback")).toBe(
      "x-api-key: [redacted]",
    );
    expect(sanitizeProviderMessage("Authorization: Bearer abc.def.ghi", "fallback")).toBe(
      "Authorization: Bearer [redacted]",
    );
    expect(sanitizeProviderMessage("   ", "fallback")).toBe("fallback");
    expect(sanitizeProviderMessage(undefined, "fallback")).toBe("fallback");

    const long = "a".repeat(500);
    expect(sanitizeProviderMessage(long, "fallback")).toHaveLength(240);
  });
});
