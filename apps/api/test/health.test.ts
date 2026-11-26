import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("responde ok com o ambiente configurado", async () => {
    const response = await SELF.fetch("https://example.com/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", env: "development" });
  });

  it("responde 404 no formato de erro padrão", async () => {
    const response = await SELF.fetch("https://example.com/api/nao-existe");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "not_found", message: "Rota não encontrada" },
    });
  });
});
