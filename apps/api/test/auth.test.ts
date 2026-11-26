import { env, SELF } from "cloudflare:test";
import { sessions, users } from "@fd/database/schema";
import {
  apiErrorSchema,
  authProvidersResponse,
  logoutResponse,
  sessionResponse,
} from "@fd/contracts";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { hashSessionToken } from "../src/auth/sessions";
import {
  authedRequest,
  BASE_URL,
  createSessionCookie,
  createTestUser,
  CSRF_HEADERS,
  db,
  loginRequest,
  resetDatabase,
  sessionCookieFrom,
} from "./helpers";

const SETUP_BODY = {
  email: "cainan@example.com",
  name: "Cainan",
  password: "senha-super-segura",
};

function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return SELF.fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...CSRF_HEADERS, ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await resetDatabase();
});

describe("GET /api/auth/providers", () => {
  it("informa métodos habilitados e setup pendente", async () => {
    const response = await SELF.fetch(`${BASE_URL}/api/auth/providers`);

    expect(response.status).toBe(200);
    const body = authProvidersResponse.parse(await response.json());
    expect(body.password.enabled).toBe(true);
    expect(body.github.enabled).toBe(true);
    expect(body.github.loginUrl).toBe("/api/auth/github");
    expect(body.setupRequired).toBe(true);
  });

  it("deixa de exigir setup depois do primeiro usuário", async () => {
    await createTestUser();

    const response = await SELF.fetch(`${BASE_URL}/api/auth/providers`);
    const body = authProvidersResponse.parse(await response.json());
    expect(body.setupRequired).toBe(false);
  });

  it("não exige setup sem login por senha (produção cria o 1º usuário via GitHub)", async () => {
    const response = await createApp().request(`${BASE_URL}/api/auth/providers`, {}, {
      ...env,
      ENABLE_PASSWORD_LOGIN: "false",
    } as unknown as Env);

    const body = authProvidersResponse.parse(await response.json());
    expect(body.password.enabled).toBe(false);
    expect(body.setupRequired).toBe(false);
  });
});

describe("POST /api/auth/setup", () => {
  it("cria o primeiro usuário, seta o cookie e responde o usuário sem hash", async () => {
    const response = await post("/api/auth/setup", SETUP_BODY);

    expect(response.status).toBe(201);
    const body = sessionResponse.parse(await response.json());
    expect(body.user.email).toBe(SETUP_BODY.email);
    expect(body.user.githubLogin).toBeNull();
    expect(JSON.stringify(body)).not.toContain("passwordHash");

    const cookie = sessionCookieFrom(response);
    expect(cookie).not.toBeNull();
    const setCookie = response.headers
      .getSetCookie()
      .find((item) => item.startsWith("fd_session="));
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");

    const me = await SELF.fetch(`${BASE_URL}/api/auth/me`, { headers: { cookie: cookie! } });
    expect(me.status).toBe(200);
    expect(sessionResponse.parse(await me.json()).user.id).toBe(body.user.id);
  });

  it("recusa o segundo setup com 409", async () => {
    await createTestUser();

    const response = await post("/api/auth/setup", {
      ...SETUP_BODY,
      email: "outro@example.com",
    });

    expect(response.status).toBe(409);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("conflict");
  });

  it("setup concorrente cria exatamente um usuário (corrida no check-then-insert)", async () => {
    const [first, second] = await Promise.all([
      post("/api/auth/setup", SETUP_BODY),
      post("/api/auth/setup", { ...SETUP_BODY, email: "outro@example.com" }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("em produção o cookie de sessão tem Secure", async () => {
    const app = createApp();
    const user = await createTestUser({ email: "prod@example.com", password: "senha-correta" });
    const response = await app.request(
      `${BASE_URL}/api/auth/login`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...CSRF_HEADERS },
        body: JSON.stringify({ email: user.email, password: user.password }),
      },
      { ...env, APP_ENV: "production", ENABLE_PASSWORD_LOGIN: "true" } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const setCookie = response.headers
      .getSetCookie()
      .find((item) => item.startsWith("fd_session="));
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
  });

  it("valida o corpo com o schema de @fd/contracts", async () => {
    const response = await post("/api/auth/setup", {
      email: "inválido",
      name: "A",
      password: "123",
    });

    expect(response.status).toBe(400);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("validation_error");
  });

  it("retorna 403 quando o login por senha está desabilitado", async () => {
    const app = createApp();
    const response = await app.request(
      `${BASE_URL}/api/auth/setup`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...CSRF_HEADERS },
        body: JSON.stringify(SETUP_BODY),
      },
      { ...env, ENABLE_PASSWORD_LOGIN: "false" } as unknown as Env,
    );

    expect(response.status).toBe(403);
  });
});

describe("POST /api/auth/login", () => {
  it("autentica com a senha correta e guarda só o SHA-256 do token", async () => {
    const user = await createTestUser({ email: "login@example.com", password: "senha-correta" });

    const response = await loginRequest(user.email, "senha-correta");
    expect(response.status).toBe(200);
    sessionResponse.parse(await response.json());

    const cookie = sessionCookieFrom(response);
    const token = cookie!.replace("fd_session=", "");
    const expectedId = await hashSessionToken(token);
    const rows = await db.select().from(sessions).where(eq(sessions.userId, user.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(expectedId);
    expect(rows[0]!.id).not.toBe(token);
  });

  it("rejeita senha errada sem revelar se o e-mail existe", async () => {
    const user = await createTestUser({ email: "login@example.com", password: "senha-correta" });

    const wrongPassword = await loginRequest(user.email, "senha-errada");
    const unknownEmail = await loginRequest("nao-existe@example.com", "senha-correta");

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    const a = apiErrorSchema.parse(await wrongPassword.json());
    const b = apiErrorSchema.parse(await unknownEmail.json());
    expect(a.error.message).toBe(b.error.message);
    expect(a.error.code).toBe("unauthorized");
  });

  it("aplica rate limit por IP após 10 falhas", async () => {
    const user = await createTestUser({ email: "rate@example.com", password: "senha-correta" });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await loginRequest(user.email, "errada", { ip: "203.0.113.10" });
      expect(response.status).toBe(401);
    }

    const blocked = await loginRequest(user.email, "senha-correta", { ip: "203.0.113.10" });
    expect(blocked.status).toBe(429);
    const body = apiErrorSchema.parse(await blocked.json());
    expect(body.error.code).toBe("rate_limited");
  }, 30_000);

  it("mantém o rate limit separado por e-mail e IP", async () => {
    const user = await createTestUser({ email: "rate@example.com", password: "senha-correta" });
    const other = await createTestUser({ email: "outro@example.com", password: "senha-correta" });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await loginRequest(user.email, "errada", { ip: "203.0.113.10" });
    }

    const sameEmailOtherIp = await loginRequest(user.email, "senha-correta", {
      ip: "203.0.113.11",
    });
    expect(sameEmailOtherIp.status).toBe(429);

    const otherEmailOtherIp = await loginRequest(other.email, "senha-correta", {
      ip: "203.0.113.11",
    });
    expect(otherEmailOtherIp.status).toBe(200);
  }, 30_000);
});

describe("sessões", () => {
  it("GET /api/auth/me exige sessão válida", async () => {
    const response = await SELF.fetch(`${BASE_URL}/api/auth/me`);

    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("unauthorized");
  });

  it("sessão expirada não autentica e é removida do D1", async () => {
    const user = await createTestUser();
    const expired = await createSessionCookie(user.id, {
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const response = await authedRequest("/api/auth/me", expired.cookie);
    expect(response.status).toBe(401);

    const rows = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(rows).toHaveLength(0);
  });

  it("POST /api/auth/logout apaga a sessão e limpa o cookie", async () => {
    const user = await createTestUser();
    const { cookie, sessionId } = await createSessionCookie(user.id);

    const response = await authedRequest("/api/auth/logout", cookie, { method: "POST" });

    expect(response.status).toBe(200);
    logoutResponse.parse(await response.json());
    const setCookie = response.headers
      .getSetCookie()
      .find((item) => item.startsWith("fd_session="));
    expect(setCookie).toContain("Max-Age=0");

    const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    expect(rows).toHaveLength(0);

    const me = await authedRequest("/api/auth/me", cookie);
    expect(me.status).toBe(401);
  });
});

describe("proteção CSRF", () => {
  it("bloqueia POST sem Origin nem X-Requested-With", async () => {
    const response = await SELF.fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@example.com", password: "x" }),
    });

    expect(response.status).toBe(403);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
  });

  it("aceita Origin igual à origem do request", async () => {
    const response = await SELF.fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: BASE_URL,
      },
      body: JSON.stringify({ email: "a@example.com", password: "x" }),
    });

    expect(response.status).toBe(401);
  });

  it("bloqueia Origin de outra origem", async () => {
    const response = await SELF.fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
      },
      body: JSON.stringify({ email: "a@example.com", password: "x" }),
    });

    expect(response.status).toBe(403);
  });

  it("GET não exige CSRF", async () => {
    const response = await SELF.fetch(`${BASE_URL}/api/auth/providers`);
    expect(response.status).toBe(200);
  });

  it("não aceita X-Forwarded-Host como origem em produção", async () => {
    const app = createApp();
    const response = await app.request(
      `${BASE_URL}/api/auth/logout`,
      {
        method: "POST",
        headers: { origin: "https://evil.example", "x-forwarded-host": "evil.example" },
      },
      { ...env, APP_ENV: "production" } as unknown as Env,
    );

    expect(response.status).toBe(403);
  });
});

describe("limites de corpo e JSON malformado", () => {
  it("JSON malformado vira 400 com envelope padrão (nunca 500)", async () => {
    const response = await SELF.fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", ...CSRF_HEADERS },
      body: '{"email":',
    });

    expect(response.status).toBe(400);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("bad_request");
  });

  it("rejeita corpo acima de 32 KiB com 413", async () => {
    const response = await SELF.fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", ...CSRF_HEADERS },
      body: JSON.stringify({ email: "a@example.com", password: "x".repeat(40_000) }),
    });

    expect(response.status).toBe(413);
  });
});

describe("headers de segurança e erro padrão", () => {
  it("responde com headers de segurança e sem CORS", async () => {
    const response = await SELF.fetch(`${BASE_URL}/api/health`);

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("x-request-id")).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
  });

  it("não expõe stack no erro 500", async () => {
    const app = createApp();
    app.get("/api/boom", () => {
      throw new Error("segredo interno");
    });

    const response = await app.request(`${BASE_URL}/api/boom`, {}, env);
    expect(response.status).toBe(500);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error).toEqual({ code: "internal_error", message: "Erro interno" });
    expect(JSON.stringify(body)).not.toContain("segredo interno");
  });
});
