import { env } from "cloudflare:test";
import { apiErrorSchema, providersResponse } from "@fd/contracts";
import { connections } from "@fd/database/schema";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import {
  BASE_URL,
  createSessionCookie,
  createTestUser,
  CSRF_HEADERS,
  db,
  resetDatabase,
} from "./helpers";

/** Env de produção: demo desligado e Pluggy configurado. */
function productionEnv(): Env {
  return {
    ...env,
    APP_ENV: "production",
    ENABLE_DEMO_PROVIDER: "false",
    PLUGGY_CLIENT_ID: "test-pluggy-client",
    PLUGGY_CLIENT_SECRET: "test-pluggy-secret",
  } as unknown as Env;
}

async function session(): Promise<string> {
  const user = await createTestUser();
  const { cookie } = await createSessionCookie(user.id);
  return cookie;
}

function getProviders(cookie: string, target: Env) {
  return createApp().request(`${BASE_URL}/api/providers`, { headers: { cookie } }, target);
}

function createDemo(cookie: string, target: Env) {
  return createApp().request(
    `${BASE_URL}/api/connections`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie, ...CSRF_HEADERS },
      body: JSON.stringify({ provider: "demo" }),
    },
    target,
  );
}

beforeEach(async () => {
  await resetDatabase();
});

describe("demonstração fora da produção", () => {
  it("não lista o provider demo quando ENABLE_DEMO_PROVIDER=false", async () => {
    const cookie = await session();
    const response = await getProviders(cookie, productionEnv());

    expect(response.status).toBe(200);
    const body = providersResponse.parse(await response.json());
    expect(body.data.map((provider) => provider.id)).toEqual(["pluggy"]);
    expect(body.data[0]?.configured).toBe(true);
  });

  it("rejeita POST /api/connections demo com mensagem clara", async () => {
    const cookie = await session();
    const response = await createDemo(cookie, productionEnv());

    expect(response.status).toBe(400);
    const error = apiErrorSchema.parse(await response.json());
    expect(error.error.code).toBe("bad_request");
    expect(error.error.message).toContain("MeuPluggy");

    const rows = await db.select().from(connections).where(eq(connections.provider, "demo"));
    expect(rows).toHaveLength(0);
  });

  it("mantém o demo disponível em desenvolvimento/teste", async () => {
    const cookie = await session();

    const providers = await getProviders(cookie, env);
    expect(providers.status).toBe(200);
    const body = providersResponse.parse(await providers.json());
    expect(body.data.map((provider) => provider.id)).toContain("demo");

    const created = await createDemo(cookie, env);
    expect(created.status).toBe(201);
    const rows = await db.select().from(connections).where(eq(connections.provider, "demo"));
    expect(rows).toHaveLength(3);
  });
});
