/**
 * Regras de autenticação (setup, senha e GitHub OAuth).
 *
 * Separado das rotas para manter a camada HTTP fina e permitir testes diretos
 * das regras (rate limit, allowlist, upsert de usuário).
 */
import type { Database, User as UserRow } from "@fd/database";
import { users } from "@fd/database/schema";
import type { LoginBody, SetupBody } from "@fd/contracts";
import { count, eq, sql } from "drizzle-orm";

import { conflict, forbidden, providerError, unauthorized } from "../http/errors";
import { hashPassword, timingSafeEqual, verifyPassword } from "./password";
import {
  assertLoginAllowed,
  clearLoginFailures,
  emailRateLimitKey,
  ipRateLimitKey,
  recordLoginFailure,
} from "./rate-limit";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function countUsers(db: Database): Promise<number> {
  const [row] = await db.select({ total: count() }).from(users);
  return row?.total ?? 0;
}

export async function setupFirstUser(
  db: Database,
  body: SetupBody,
  now: Date = new Date(),
): Promise<UserRow> {
  const passwordHash = await hashPassword(body.password);
  const row: UserRow = {
    id: crypto.randomUUID(),
    email: normalizeEmail(body.email),
    name: body.name.trim(),
    passwordHash,
    githubLogin: null,
    avatarUrl: null,
    createdAt: now.toISOString(),
  };

  // Check-then-insert não é atômico: dois POSTs concorrentes poderiam criar
  // dois usuários. O INSERT ... SELECT ... WHERE NOT EXISTS resolve a corrida
  // no próprio SQLite (uma única escrita condicional).
  const result = await db.run(sql`
    INSERT INTO users (id, email, name, password_hash, github_login, avatar_url, created_at)
    SELECT ${row.id}, ${row.email}, ${row.name}, ${row.passwordHash}, NULL, NULL, ${row.createdAt}
    WHERE NOT EXISTS (SELECT 1 FROM users)
  `);

  if ((result.meta.changes ?? 0) === 0) {
    throw conflict("Já existe um usuário cadastrado; use o login.");
  }

  return row;
}

export interface LoginContext {
  ip: string;
  now?: Date;
}

/**
 * Valida e-mail/senha com rate limit por IP e por e-mail.
 * Lança `rate_limited` (429) ou `unauthorized` (401) sem revelar qual campo
 * está errado.
 */
export async function authenticateWithPassword(
  db: Database,
  body: LoginBody,
  context: LoginContext,
): Promise<UserRow> {
  const now = context.now ?? new Date();
  const email = normalizeEmail(body.email);
  const keys = [ipRateLimitKey(context.ip), await emailRateLimitKey(email)];

  await assertLoginAllowed(db, keys, now);

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const valid = await verifyPassword(body.password, user?.passwordHash ?? null);

  if (!user || !valid) {
    await recordLoginFailure(db, keys, now);
    throw unauthorized("E-mail ou senha inválidos");
  }

  await clearLoginFailures(db, keys[1]!);
  return user;
}

/* -------------------------------------------------------------------------- */
/* GitHub OAuth                                                               */
/* -------------------------------------------------------------------------- */

export interface GithubProfile {
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface GithubOAuthEnv {
  clientId: string;
  clientSecret: string;
}

export function githubAuthorizeUrl(config: GithubOAuthEnv, origin: string, state: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/github/callback`);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  return url.toString();
}

export function createOAuthState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function isValidOAuthState(
  expected: string | undefined,
  received: string | undefined,
): boolean {
  if (!expected || !received) return false;
  const encoder = new TextEncoder();
  return timingSafeEqual(encoder.encode(expected), encoder.encode(received));
}

interface GithubTokenResponse {
  access_token?: string;
  error?: string;
}

interface GithubUserResponse {
  login?: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

interface GithubEmailResponse {
  email?: string;
  primary?: boolean;
  verified?: boolean;
}

const GITHUB_JSON_HEADERS = {
  Accept: "application/json",
  "User-Agent": "lumen-finance-api",
} as const;

export async function exchangeGithubCode(
  config: GithubOAuthEnv,
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { ...GITHUB_JSON_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw providerError("Falha ao trocar o código do GitHub.", { status: response.status });
  }

  const payload = (await response.json()) as GithubTokenResponse;
  if (!payload.access_token) {
    throw providerError("GitHub não retornou um token de acesso.");
  }
  return payload.access_token;
}

export async function fetchGithubProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubProfile> {
  const headers = {
    ...GITHUB_JSON_HEADERS,
    Authorization: `Bearer ${accessToken}`,
  };

  const userResponse = await fetchImpl("https://api.github.com/user", { headers });
  if (!userResponse.ok) {
    throw providerError("Falha ao ler o perfil do GitHub.", { status: userResponse.status });
  }

  const user = (await userResponse.json()) as GithubUserResponse;
  const login = user.login?.trim();
  if (!login) {
    throw providerError("Perfil do GitHub sem login.");
  }

  let email = user.email?.trim() || null;
  if (!email) {
    email = await fetchGithubPrimaryEmail(headers, fetchImpl);
  }

  return {
    login,
    name: user.name?.trim() || login,
    email,
    avatarUrl: safeUrl(user.avatar_url),
  };
}

async function fetchGithubPrimaryEmail(
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const response = await fetchImpl("https://api.github.com/user/emails", { headers });
  if (!response.ok) return null;

  const emails = (await response.json()) as GithubEmailResponse[];
  if (!Array.isArray(emails)) return null;

  const verified = emails.filter((item) => item.verified && typeof item.email === "string");
  const chosen = verified.find((item) => item.primary) ?? verified[0];
  // Nunca usa e-mail não verificado: o GitHub permite cadastrar endereços que
  // ainda não foram confirmados e eles não podem virar identidade do app.
  return chosen?.email?.trim() || null;
}

function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

/**
 * Cria/atualiza o usuário a partir do perfil do GitHub.
 *
 * Não vincula por e-mail a um usuário existente (evita sequestro de conta):
 * se o e-mail já pertence a outro usuário, usa o e-mail noreply do GitHub.
 */
export async function upsertGithubUser(
  db: Database,
  profile: GithubProfile,
  now: Date = new Date(),
): Promise<UserRow> {
  const login = profile.login.toLowerCase();

  const [existing] = await db.select().from(users).where(eq(users.githubLogin, login)).limit(1);
  if (existing) {
    const nextEmail = await resolveEmail(db, profile.email, login, existing.email);
    const updated: UserRow = {
      ...existing,
      name: profile.name ?? existing.name,
      email: nextEmail,
      avatarUrl: profile.avatarUrl ?? existing.avatarUrl,
    };
    await db
      .update(users)
      .set({ name: updated.name, email: updated.email, avatarUrl: updated.avatarUrl })
      .where(eq(users.id, existing.id));
    return updated;
  }

  const email = await resolveEmail(db, profile.email, login, null);
  const row: UserRow = {
    id: crypto.randomUUID(),
    email,
    name: profile.name ?? login,
    passwordHash: null,
    githubLogin: login,
    avatarUrl: profile.avatarUrl,
    createdAt: now.toISOString(),
  };

  try {
    await db.insert(users).values(row);
  } catch (error) {
    // Dois callbacks concorrentes do mesmo login: o índice único de
    // `github_login` barra o segundo INSERT. Devolve o usuário vencedor em vez
    // de responder 500.
    const [raced] = await db.select().from(users).where(eq(users.githubLogin, login)).limit(1);
    if (raced) return raced;
    throw error;
  }
  return row;
}

async function resolveEmail(
  db: Database,
  preferred: string | null,
  login: string,
  currentEmail: string | null,
): Promise<string> {
  if (currentEmail) return currentEmail;
  if (preferred) {
    const normalized = normalizeEmail(preferred);
    if (!(await emailBelongsToOtherUser(db, normalized, login))) return normalized;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const suffix = attempt === 0 ? "" : `+${attempt}`;
    const fallback = `${login}${suffix}@users.noreply.github.com`;
    if (!(await emailBelongsToOtherUser(db, fallback, login))) return fallback;
  }

  return `${login}.${crypto.randomUUID().slice(0, 8)}@users.noreply.github.com`;
}

async function emailBelongsToOtherUser(
  db: Database,
  email: string,
  githubLogin: string,
): Promise<boolean> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row) return false;
  return row.githubLogin?.toLowerCase() !== githubLogin;
}

export async function assertGithubLoginAllowed(login: string, allowed: Set<string>): Promise<void> {
  if (allowed.size === 0 || !allowed.has(login.toLowerCase())) {
    throw forbidden("Sua conta do GitHub não está autorizada a acessar este app.");
  }
}
