import { describe, expect, it } from "vitest";

import {
  DEMO_CONNECTION_EXTERNAL_IDS,
  createProviderRegistry,
  type ProviderRegistryEnv,
} from "../src";

const NOW = new Date("2026-11-10T15:00:00.000Z");

describe("createProviderRegistry", () => {
  it("não registra nada quando não há credenciais nem demo", () => {
    const registry = createProviderRegistry({}, { now: () => NOW });

    expect(registry.get("demo")).toBeUndefined();
    expect(registry.get("pluggy")).toBeUndefined();
    // Demo desabilitado não aparece nem como "não configurado": a UI não pode
    // oferecer nenhum CTA de demonstração em produção.
    expect(registry.list()).toEqual([
      {
        id: "pluggy",
        name: "Pluggy",
        configured: false,
        capabilities: {
          supportsManualRefresh: true,
          supportsWebhooks: true,
          supportsCreditCards: true,
          supportsInvestments: true,
        },
      },
    ]);
    expect(() => registry.require("pluggy")).toThrowError(
      expect.objectContaining({ code: "not_found" }),
    );
  });

  it("registra demo somente quando habilitado", async () => {
    const disabled = createProviderRegistry({ ENABLE_DEMO_PROVIDER: "false" }, { now: () => NOW });
    expect(disabled.get("demo")).toBeUndefined();
    expect(disabled.list().map((item) => item.id)).toEqual(["pluggy"]);

    const registry = createProviderRegistry({ ENABLE_DEMO_PROVIDER: "true" }, { now: () => NOW });
    const demo = registry.require("demo");
    expect(demo.id).toBe("demo");
    expect(registry.demo).toBeInstanceOf(Object);

    const accounts = await demo.getAccounts(DEMO_CONNECTION_EXTERNAL_IDS.aurora);
    expect(accounts.length).toBeGreaterThan(0);
    expect(registry.list().find((item) => item.id === "demo")?.configured).toBe(true);
  });

  it("só registra Pluggy com clientId e clientSecret preenchidos", () => {
    const missingSecret: ProviderRegistryEnv = { PLUGGY_CLIENT_ID: "client-id" };
    expect(createProviderRegistry(missingSecret).get("pluggy")).toBeUndefined();

    const blankSecret: ProviderRegistryEnv = {
      PLUGGY_CLIENT_ID: "client-id",
      PLUGGY_CLIENT_SECRET: "   ",
    };
    expect(createProviderRegistry(blankSecret).get("pluggy")).toBeUndefined();

    const registry = createProviderRegistry(
      {
        PLUGGY_CLIENT_ID: "client-id",
        PLUGGY_CLIENT_SECRET: "client-secret",
        PLUGGY_BASE_URL: "https://pluggy.example.test",
      },
      { now: () => NOW },
    );
    const pluggy = registry.require("pluggy");
    expect(pluggy.id).toBe("pluggy");
    expect(pluggy.capabilities.supportsManualRefresh).toBe(true);
    expect(registry.pluggy).toBeDefined();
    expect(registry.list().find((item) => item.id === "pluggy")?.configured).toBe(true);
  });

  it("registra os dois providers quando ambos estão habilitados", () => {
    const registry = createProviderRegistry(
      {
        ENABLE_DEMO_PROVIDER: true,
        PLUGGY_CLIENT_ID: "client-id",
        PLUGGY_CLIENT_SECRET: "client-secret",
      },
      { now: () => NOW },
    );

    expect(registry.list().map((item) => [item.id, item.configured])).toEqual([
      ["demo", true],
      ["pluggy", true],
    ]);
    expect(registry.get("demo")?.id).toBe("demo");
    expect(registry.get("pluggy")?.id).toBe("pluggy");
  });

  it("aceita cache e fetch injetados sem tocar na rede", () => {
    const calls: string[] = [];
    const fakeFetch: typeof fetch = async () => {
      calls.push("fetch");
      throw new Error("não deveria chamar a rede");
    };
    const registry = createProviderRegistry(
      {
        PLUGGY_CLIENT_ID: "client-id",
        PLUGGY_CLIENT_SECRET: "client-secret",
      },
      { fetch: fakeFetch, now: () => NOW },
    );

    expect(registry.require("pluggy").id).toBe("pluggy");
    expect(calls).toEqual([]);
  });
});
