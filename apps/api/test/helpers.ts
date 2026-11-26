import { env, SELF } from "cloudflare:test";
import { createDb } from "@fd/database";
import { sessions, users } from "@fd/database/schema";

import { hashPassword } from "../src/auth/password";
import { hashSessionToken } from "../src/auth/sessions";

export const BASE_URL = "https://example.com";
export const db = createDb(env.DB);

export const CSRF_HEADERS = { "x-requested-with": "fetch" } as const;

const TABLES_IN_DELETE_ORDER = [
  "login_attempts",
  "sessions",
  "settings",
  "budget_category_groups",
  "card_payment_plans",
  "balance_snapshots",
  "transactions",
  "budget_groups",
  "bills",
  "credit_cards",
  "investments",
  "accounts",
  "sync_runs",
  "connections",
  "institutions",
  "categories",
  "users",
] as const;

/** Limpa o D1 entre testes (a ordem respeita as foreign keys). */
export async function resetDatabase(): Promise<void> {
  await env.DB.batch(TABLES_IN_DELETE_ORDER.map((table) => env.DB.prepare(`DELETE FROM ${table}`)));
}

export interface TestUserInput {
  email?: string;
  password?: string;
  name?: string;
  githubLogin?: string | null;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export async function createTestUser(input: TestUserInput = {}): Promise<TestUser> {
  const email = input.email ?? `user-${crypto.randomUUID()}@example.com`;
  const password = input.password ?? "senha-segura-123";
  const id = crypto.randomUUID();

  await db.insert(users).values({
    id,
    email,
    name: input.name ?? "Usuário Teste",
    passwordHash: await hashPassword(password),
    githubLogin: input.githubLogin ?? null,
    avatarUrl: null,
    createdAt: new Date().toISOString(),
  });

  return { id, email, password };
}

/** Cria uma sessão direto no D1 e devolve o cookie `fd_session`. */
export async function createSessionCookie(
  userId: string,
  options: { expiresAt?: string } = {},
): Promise<{ token: string; cookie: string; sessionId: string }> {
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const sessionId = await hashSessionToken(token);
  const expiresAt = options.expiresAt ?? new Date(Date.now() + 30 * 86_400_000).toISOString();

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
    createdAt: new Date().toISOString(),
    userAgent: "vitest",
  });

  return { token, cookie: `fd_session=${token}`, sessionId };
}

export interface LoginOptions {
  ip?: string;
  extraHeaders?: Record<string, string>;
}

export function loginRequest(
  email: string,
  password: string,
  options: LoginOptions = {},
): Promise<Response> {
  return SELF.fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...CSRF_HEADERS,
      ...(options.ip ? { "cf-connecting-ip": options.ip } : {}),
      ...options.extraHeaders,
    },
    body: JSON.stringify({ email, password }),
  });
}

export function authedRequest(
  path: string,
  cookie: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  if (init.method && init.method !== "GET" && init.method !== "HEAD") {
    headers.set("x-requested-with", "fetch");
  }

  return SELF.fetch(`${BASE_URL}${path}`, { ...init, headers });
}

/** Extrai o valor do cookie `fd_session` de um `Set-Cookie`. */
export function sessionCookieFrom(response: Response): string | null {
  const cookies = response.headers.getSetCookie();
  const session = cookies.find((cookie) => cookie.startsWith("fd_session="));
  if (!session) return null;
  return session.split(";")[0] ?? null;
}

export function oauthStateCookieFrom(response: Response): string | null {
  const cookies = response.headers.getSetCookie();
  const state = cookies.find((cookie) => cookie.startsWith("fd_oauth_state="));
  if (!state) return null;
  return state.split(";")[0] ?? null;
}
