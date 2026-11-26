/**
 * Rate limit de login por IP e por e-mail, persistido em D1 (`login_attempts`).
 *
 * A tabela guarda uma linha por tentativa falha com PK `(key, attempted_at)`.
 * O e-mail é normalizado e transformado em hash para não persistir PII.
 */
import type { Database } from "@fd/database";
import { loginAttempts } from "@fd/database/schema";
import { and, count, eq, gte, inArray, lt } from "drizzle-orm";

import { rateLimited } from "../http/errors";
import { hashSessionToken } from "./sessions";

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 10;

export type RateLimitKey = string;

export async function emailRateLimitKey(email: string): Promise<RateLimitKey> {
  return `email:${await hashSessionToken(email.trim().toLowerCase())}`;
}

export function ipRateLimitKey(ip: string): RateLimitKey {
  return `ip:${ip.trim().slice(0, 64) || "unknown"}`;
}

export async function assertLoginAllowed(
  db: Database,
  keys: readonly RateLimitKey[],
  now: Date = new Date(),
): Promise<void> {
  if (keys.length === 0) return;
  const windowStart = new Date(now.getTime() - LOGIN_WINDOW_MS).toISOString();

  const rows = await db
    .select({ key: loginAttempts.key, attempts: count() })
    .from(loginAttempts)
    .where(and(inArray(loginAttempts.key, [...keys]), gte(loginAttempts.attemptedAt, windowStart)))
    .groupBy(loginAttempts.key);

  for (const row of rows) {
    if (row.attempts >= LOGIN_MAX_ATTEMPTS) {
      throw rateLimited("Muitas tentativas de login. Aguarde alguns minutos e tente novamente.");
    }
  }
}

export async function recordLoginFailure(
  db: Database,
  keys: readonly RateLimitKey[],
  now: Date = new Date(),
): Promise<void> {
  if (keys.length === 0) return;
  const windowStart = new Date(now.getTime() - LOGIN_WINDOW_MS).toISOString();
  const stamp = now.toISOString();
  // Sufixo aleatório evita colisão de PK quando duas falhas caem no mesmo ms.
  const suffix = crypto.randomUUID().slice(0, 8);

  await db.insert(loginAttempts).values(
    keys.map((key) => ({
      key,
      attemptedAt: `${stamp}-${suffix}`,
    })),
  );

  await db
    .delete(loginAttempts)
    .where(and(inArray(loginAttempts.key, [...keys]), lt(loginAttempts.attemptedAt, windowStart)));
}

export async function clearLoginFailures(db: Database, key: RateLimitKey): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}
