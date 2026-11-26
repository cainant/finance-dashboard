import { env, SELF } from "cloudflare:test";
import { users } from "@fd/database/schema";
import { sessionResponse } from "@fd/contracts";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import { BASE_URL, db, oauthStateCookieFrom, resetDatabase, sessionCookieFrom } from "./helpers";

interface GithubMockOptions {
  login?: string;
  name?: string | null;
  email?: string | null;
  emails?: Array<{ email: string; primary: boolean; verified: boolean }>;
  tokenStatus?: number;
  userStatus?: number;
}

function githubFetch(options: GithubMockOptions = {}): typeof fetch {
  const login = options.login ?? "cainan";
  return (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url === "https://github.com/login/oauth/access_token") {
      if (options.tokenStatus && options.tokenStatus >= 400) {
        return new Response("erro", { status: options.tokenStatus });
      }
      return Response.json({ access_token: "gho_test_token" });
    }

    if (url === "https://api.github.com/user") {
      if (options.userStatus && options.userStatus >= 400) {
        return new Response("erro", { status: options.userStatus });
      }
      return Response.json({
        login,
        name: options.name === undefined ? "Cainan Teste" : options.name,
        email: options.email === undefined ? "cainan@example.com" : options.email,
        avatar_url: "https://avatars.githubusercontent.com/u/1",
      });
    }

    if (url === "https://api.github.com/user/emails") {
      return Response.json(
        options.emails ?? [{ email: "principal@example.com", primary: true, verified: true }],
      );
    }

    throw new Error(`fetch inesperado: ${url}`);
  }) as typeof fetch;
}

async function startGithubFlow(): Promise<{ state: string; stateCookie: string }> {
  const response = await SELF.fetch(`${BASE_URL}/api/auth/github`, { redirect: "manual" });
  expect(response.status).toBe(302);

  const location = response.headers.get("location");
  expect(location).not.toBeNull();
  const url = new URL(location!);
  expect(url.origin).toBe("https://github.com");
  expect(url.searchParams.get("client_id")).toBe("test-client-id");
  expect(url.searchParams.get("redirect_uri")).toBe(`${BASE_URL}/api/auth/github/callback`);

  const state = url.searchParams.get("state");
  const stateCookie = oauthStateCookieFrom(response);
  expect(state).not.toBeNull();
  expect(stateCookie).not.toBeNull();

  return { state: state!, stateCookie: stateCookie! };
}

function callback(state: string, stateCookie: string): Promise<Response> {
  return SELF.fetch(
    `${BASE_URL}/api/auth/github/callback?code=abc123&state=${encodeURIComponent(state)}`,
    {
      headers: { cookie: stateCookie },
      redirect: "manual",
    },
  );
}

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHub OAuth", () => {
  it("faz o callback, cria a sessão e permite /me", async () => {
    vi.stubGlobal("fetch", githubFetch());
    const { state, stateCookie } = await startGithubFlow();

    const response = await callback(state, stateCookie);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${BASE_URL}/`);

    const cookie = sessionCookieFrom(response);
    expect(cookie).not.toBeNull();

    const me = await SELF.fetch(`${BASE_URL}/api/auth/me`, { headers: { cookie: cookie! } });
    expect(me.status).toBe(200);
    const body = sessionResponse.parse(await me.json());
    expect(body.user.githubLogin).toBe("cainan");
    expect(body.user.email).toBe("cainan@example.com");
    expect(body.user.name).toBe("Cainan Teste");
  });

  it("é idempotente: dois logins do mesmo GitHub não duplicam o usuário", async () => {
    vi.stubGlobal("fetch", githubFetch());

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { state, stateCookie } = await startGithubFlow();
      const response = await callback(state, stateCookie);
      expect(response.status).toBe(302);
    }

    const rows = await db.select().from(users).where(eq(users.githubLogin, "cainan"));
    expect(rows).toHaveLength(1);
  });

  it("bloqueia login fora da allowlist", async () => {
    vi.stubGlobal("fetch", githubFetch({ login: "intruso" }));
    const { state, stateCookie } = await startGithubFlow();

    const response = await callback(state, stateCookie);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${BASE_URL}/login?error=github_not_allowed`);
    expect(sessionCookieFrom(response)).toBeNull();
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("rejeita state inválido sem chamar o GitHub", async () => {
    const fetchMock = vi.fn(githubFetch());
    vi.stubGlobal("fetch", fetchMock);
    const { stateCookie } = await startGithubFlow();

    const response = await SELF.fetch(
      `${BASE_URL}/api/auth/github/callback?code=abc&state=state-errado`,
      { headers: { cookie: stateCookie }, redirect: "manual" },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${BASE_URL}/login?error=github_state`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redireciona para /login?error=github_error quando a troca do code falha", async () => {
    vi.stubGlobal("fetch", githubFetch({ tokenStatus: 500 }));
    const { state, stateCookie } = await startGithubFlow();

    const response = await callback(state, stateCookie);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${BASE_URL}/login?error=github_error`);
  });

  it("usa /user/emails quando o perfil não expõe e-mail", async () => {
    vi.stubGlobal(
      "fetch",
      githubFetch({
        email: null,
        emails: [
          { email: "nao-verificado@example.com", primary: false, verified: false },
          { email: "verificado@example.com", primary: false, verified: true },
        ],
      }),
    );
    const { state, stateCookie } = await startGithubFlow();

    const response = await callback(state, stateCookie);
    const cookie = sessionCookieFrom(response);
    const me = await SELF.fetch(`${BASE_URL}/api/auth/me`, { headers: { cookie: cookie! } });
    const body = sessionResponse.parse(await me.json());
    expect(body.user.email).toBe("verificado@example.com");
  });

  it("ignora e-mails não verificados e cai no noreply do GitHub", async () => {
    vi.stubGlobal(
      "fetch",
      githubFetch({
        email: null,
        emails: [{ email: "nao-verificado@example.com", primary: true, verified: false }],
      }),
    );
    const { state, stateCookie } = await startGithubFlow();

    const response = await callback(state, stateCookie);
    const cookie = sessionCookieFrom(response);
    const me = await SELF.fetch(`${BASE_URL}/api/auth/me`, { headers: { cookie: cookie! } });
    const body = sessionResponse.parse(await me.json());
    expect(body.user.email).toBe("cainan@users.noreply.github.com");
  });

  it("nega login quando a allowlist está vazia (fail-closed)", async () => {
    vi.stubGlobal("fetch", githubFetch({ login: "qualquer" }));
    const app = createApp();
    const restrictedEnv = { ...env, ALLOWED_GITHUB_LOGINS: "" } as unknown as Env;

    const start = await app.request(
      `${BASE_URL}/api/auth/github`,
      { redirect: "manual" },
      restrictedEnv,
    );
    const location = start.headers.get("location");
    expect(location).not.toBeNull();
    const state = new URL(location!).searchParams.get("state")!;
    const stateCookie = oauthStateCookieFrom(start)!;

    const response = await app.request(
      `${BASE_URL}/api/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`,
      { headers: { cookie: stateCookie }, redirect: "manual" },
      restrictedEnv,
    );

    expect(response.headers.get("location")).toBe(`${BASE_URL}/login?error=github_not_allowed`);
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("não troca e-mail de usuário existente que já tem conta", async () => {
    vi.stubGlobal("fetch", githubFetch());
    const { state, stateCookie } = await startGithubFlow();
    await callback(state, stateCookie);

    // Simula o GitHub passando a devolver outro e-mail para o mesmo login.
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", githubFetch({ email: "outro@example.com" }));
    const second = await startGithubFlow();
    await callback(second.state, second.stateCookie);

    const [row] = await db.select().from(users).where(eq(users.githubLogin, "cainan"));
    expect(row?.email).toBe("cainan@example.com");
  });
});
