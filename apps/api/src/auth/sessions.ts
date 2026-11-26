/**
 * Sessões em D1.
 *
 * O cookie carrega um token aleatório de 32 bytes (base64url); o banco guarda
 * apenas o SHA-256 (hex) desse token. Expira em 30 dias com renovação
 * deslizante (a cada requisição autenticada após 24h, o prazo é estendido).
 */
import type { User as UserRow } from "@fd/database";
import { sessions, users } from "@fd/database/schema";
import type { User as ApiUser } from "@fd/contracts";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { isProduction, type AppEnv, type AuthSession } from "../env";

export const SESSION_COOKIE = "fd_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
const RENEW_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;

export interface SessionRecord {
  session: AuthSession;
  user: ApiUser;
}

export function toApiUser(row: UserRow): ApiUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    githubLogin: row.githubLogin,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt,
  };
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function createSession(
  db: Context<AppEnv>["var"]["db"],
  userId: string,
  userAgent: string | null,
  now: Date = new Date(),
): Promise<{ token: string; session: AuthSession }> {
  const token = generateSessionToken();
  const id = await hashSessionToken(token);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  await db.insert(sessions).values({
    id,
    userId,
    expiresAt,
    createdAt: now.toISOString(),
    userAgent: userAgent?.slice(0, 256) ?? null,
  });

  return { token, session: { id, expiresAt } };
}

/**
 * Busca a sessão + usuário. Sessões expiradas são removidas e tratadas como
 * inexistentes. Não renova: `requireAuth` cuida da renovação deslizante.
 *
 * A busca não filtra por expiração no SQL para distinguir "token inexistente"
 * de "sessão expirada": só apagamos quando a linha realmente existe. Um token
 * aleatório (ataque de escrita no D1) não gera nenhuma escrita.
 */
export async function findSession(
  db: Context<AppEnv>["var"]["db"],
  token: string,
  now: Date = new Date(),
): Promise<SessionRecord | null> {
  const id = await hashSessionToken(token);
  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);

  if (!row) return null;

  if (row.expiresAt <= now.toISOString()) {
    // Best-effort: falha de limpeza não pode derrubar a autenticação.
    await db
      .delete(sessions)
      .where(eq(sessions.id, id))
      .catch(() => undefined);
    return null;
  }

  return {
    session: { id, expiresAt: row.expiresAt },
    user: toApiUser(row.user),
  };
}

export async function renewSession(
  db: Context<AppEnv>["var"]["db"],
  session: AuthSession,
  now: Date = new Date(),
): Promise<AuthSession> {
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, session.id));
  return { ...session, expiresAt };
}

export async function deleteSession(
  db: Context<AppEnv>["var"]["db"],
  token: string,
): Promise<void> {
  const id = await hashSessionToken(token);
  await db.delete(sessions).where(eq(sessions.id, id));
}

export function shouldRenewSession(session: AuthSession, now: Date = new Date()): boolean {
  const remaining = Date.parse(session.expiresAt) - now.getTime();
  return remaining < SESSION_TTL_MS - RENEW_INTERVAL_MS;
}

export function setSessionCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: isProduction(c.env),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, {
    path: "/",
    secure: isProduction(c.env),
  });
}

export function readSessionToken(c: Context<AppEnv>): string | null {
  const token = getCookie(c, SESSION_COOKIE);
  // Token legítimo: 32 bytes em base64url (43 chars). O limite evita hash de
  // valores arbitrariamente grandes vindos de cookies forjados.
  return token && token.length >= 20 && token.length <= 128 ? token : null;
}
