/**
 * Rotas públicas de autenticação (`/api/auth/*`).
 *
 * - `GET  /providers`: métodos habilitados e se o setup é necessário;
 * - `POST /login`: senha (somente dev/teste) com rate limit;
 * - `POST /setup`: cria o primeiro usuário (somente sem usuários);
 * - `POST /logout`: apaga a sessão atual;
 * - `GET  /me`: usuário da sessão (protegida);
 * - `GET  /github` + `GET /github/callback`: OAuth com allowlist.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  apiRoutes,
  loginBody,
  setupBody,
  type AuthProvidersResponse,
  type LogoutResponse,
  type SessionResponse,
} from "@fd/contracts";

import {
  allowedGithubLogins,
  githubOAuthConfig,
  isPasswordLoginEnabled,
  isProduction,
  type AppEnv,
} from "../env";
import { AppError, forbidden } from "../http/errors";
import { jsonBody } from "../http/validate";
import { currentUser, requireAuth } from "./middleware";
import {
  assertGithubLoginAllowed,
  authenticateWithPassword,
  countUsers,
  createOAuthState,
  exchangeGithubCode,
  fetchGithubProfile,
  githubAuthorizeUrl,
  isValidOAuthState,
  setupFirstUser,
  upsertGithubUser,
} from "./service";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  readSessionToken,
  setSessionCookie,
  toApiUser,
} from "./sessions";

const OAUTH_STATE_COOKIE = "fd_oauth_state";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export const authRoutes = new Hono<AppEnv>();

authRoutes.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

authRoutes.get("/providers", async (c) => {
  const totalUsers = await countUsers(c.get("db"));
  const passwordEnabled = isPasswordLoginEnabled(c.env);
  const body: AuthProvidersResponse = {
    password: { enabled: passwordEnabled },
    github: {
      enabled: githubOAuthConfig(c.env) !== null,
      loginUrl: apiRoutes.auth.github,
    },
    // O /setup cria o primeiro usuário com senha. Sem login por senha (produção),
    // o primeiro usuário nasce no callback do GitHub OAuth (allowlist), então
    // não há setup a fazer e a UI deve mostrar o login.
    setupRequired: totalUsers === 0 && passwordEnabled,
  };
  return c.json(body);
});

authRoutes.post("/login", jsonBody(loginBody), async (c) => {
  if (!isPasswordLoginEnabled(c.env)) {
    throw forbidden("Login por senha está desabilitado neste ambiente.");
  }

  const user = await authenticateWithPassword(c.get("db"), c.req.valid("json"), {
    ip: clientIp(c),
  });
  const { token } = await createSession(c.get("db"), user.id, c.req.header("user-agent") ?? null);
  setSessionCookie(c, token);

  const body: SessionResponse = { user: toApiUser(user) };
  return c.json(body);
});

authRoutes.post("/setup", jsonBody(setupBody), async (c) => {
  if (!isPasswordLoginEnabled(c.env)) {
    throw forbidden("Login por senha está desabilitado neste ambiente.");
  }

  const user = await setupFirstUser(c.get("db"), c.req.valid("json"));
  const { token } = await createSession(c.get("db"), user.id, c.req.header("user-agent") ?? null);
  setSessionCookie(c, token);

  const body: SessionResponse = { user: toApiUser(user) };
  return c.json(body, 201);
});

authRoutes.post("/logout", async (c) => {
  const token = readSessionToken(c);
  if (token) await deleteSession(c.get("db"), token);
  clearSessionCookie(c);

  const body: LogoutResponse = { ok: true };
  return c.json(body);
});

authRoutes.get("/me", requireAuth, (c) => {
  const body: SessionResponse = { user: currentUser(c) };
  return c.json(body);
});

authRoutes.get("/github", (c) => {
  const config = githubOAuthConfig(c.env);
  if (!config) return loginRedirect(c, "github_not_configured");

  const state = createOAuthState();
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "Lax",
    secure: isProduction(c.env),
    path: "/",
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });

  return c.redirect(githubAuthorizeUrl(config, requestOrigin(c), state));
});

authRoutes.get("/github/callback", async (c) => {
  const url = new URL(c.req.url);
  const expectedState = getCookie(c, OAUTH_STATE_COOKIE);
  deleteOAuthStateCookie(c);

  if (url.searchParams.get("error")) return loginRedirect(c, "github_denied");

  const state = url.searchParams.get("state") ?? undefined;
  if (!isValidOAuthState(expectedState, state)) {
    return loginRedirect(c, "github_state");
  }

  const config = githubOAuthConfig(c.env);
  if (!config) return loginRedirect(c, "github_not_configured");

  const code = url.searchParams.get("code");
  if (!code) return loginRedirect(c, "github_denied");

  try {
    const accessToken = await exchangeGithubCode(
      config,
      code,
      `${requestOrigin(c)}${apiRoutes.auth.githubCallback}`,
    );
    const profile = await fetchGithubProfile(accessToken);
    await assertGithubLoginAllowed(profile.login, allowedGithubLogins(c.env));

    const user = await upsertGithubUser(c.get("db"), profile);
    const { token } = await createSession(c.get("db"), user.id, c.req.header("user-agent") ?? null);
    setSessionCookie(c, token);

    return c.redirect(new URL("/", requestOrigin(c)).toString());
  } catch (error) {
    if (error instanceof AppError && error.code === "forbidden") {
      return loginRedirect(c, "github_not_allowed");
    }
    console.error(
      JSON.stringify({
        event: "github_oauth_failed",
        requestId: c.get("requestId"),
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return loginRedirect(c, "github_error");
  }
});

function requestOrigin(c: Context<AppEnv>): string {
  return new URL(c.req.url).origin;
}

function loginRedirect(c: Context<AppEnv>, code: string) {
  return c.redirect(
    new URL(`/login?error=${encodeURIComponent(code)}`, requestOrigin(c)).toString(),
  );
}

function clientIp(c: Context<AppEnv>): string {
  const cfIp = c.req.header("cf-connecting-ip");
  if (cfIp) return cfIp;
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

function deleteOAuthStateCookie(c: Context<AppEnv>): void {
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });
}
