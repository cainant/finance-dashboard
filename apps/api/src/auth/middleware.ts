/**
 * Middleware de sessão: popula `c.var.user`/`c.var.session` e renova o cookie
 * (renovação deslizante) quando faltam mais de 24h desde a última renovação.
 */
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";

import type { AppEnv, AuthUser } from "../env";
import { unauthorized } from "../http/errors";
import {
  clearSessionCookie,
  findSession,
  readSessionToken,
  renewSession,
  setSessionCookie,
  shouldRenewSession,
} from "./sessions";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = readSessionToken(c);
  if (!token) throw unauthorized();

  const record = await findSession(c.get("db"), token);
  if (!record) {
    clearSessionCookie(c);
    throw unauthorized("Sessão expirada");
  }

  let session = record.session;
  if (shouldRenewSession(session)) {
    session = await renewSession(c.get("db"), session);
    setSessionCookie(c, token);
  }

  c.set("user", record.user);
  c.set("session", session);
  await next();
});

/** Usuário autenticado (as rotas protegidas rodam depois de `requireAuth`). */
export function currentUser(c: Context<AppEnv>): AuthUser {
  const user = c.get("user");
  if (!user) throw unauthorized();
  return user;
}
