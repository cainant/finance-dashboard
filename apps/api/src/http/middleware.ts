/**
 * Middlewares transversais da API.
 *
 * - `requestContext`: cria o Drizzle/D1 e o registry de providers por request;
 * - `requestLogger`: log estruturado sem corpo, query string ou dado financeiro;
 * - `secureHeaders`: cabeçalhos de segurança (API JSON, sem CORS);
 * - `csrfProtection`: métodos mutáveis exigem `X-Requested-With: fetch` ou
 *   `Origin` igual à origem do request (a Pages Function preserva a origem).
 */
import { createDb } from "@fd/database";
import { createMiddleware } from "hono/factory";

import { createProvidersFromEnv, isProduction, type AppEnv } from "../env";
import { forbidden } from "./errors";

export const REQUEST_ID_HEADER = "x-request-id";

function isSafeRequestId(value: string | undefined): value is string {
  return value !== undefined && /^[A-Za-z0-9._-]{1,128}$/.test(value);
}

export const requestContext = createMiddleware<AppEnv>(async (c, next) => {
  c.set(
    "requestId",
    isSafeRequestId(c.req.header(REQUEST_ID_HEADER))
      ? c.req.header(REQUEST_ID_HEADER)!
      : crypto.randomUUID(),
  );
  c.set("db", createDb(c.env.DB));
  c.set("providers", createProvidersFromEnv(c.env));
  await next();
  c.header(REQUEST_ID_HEADER, c.get("requestId"));
});

export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const startedAt = performance.now();
  await next();
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
  console.log(
    JSON.stringify({
      event: "http_request",
      requestId: c.get("requestId"),
      method: c.req.method,
      // Apenas o path: query strings podem conter busca por descrição/merchant.
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      durationMs,
      userId: c.get("user")?.id,
    }),
  );
});

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

export const secureHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    c.header(name, value);
  }
  if (isProduction(c.env)) {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
});

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const csrfProtection = createMiddleware<AppEnv>(async (c, next) => {
  if (!MUTATING_METHODS.has(c.req.method)) return next();

  // Webhooks usam segredo próprio (x-webhook-secret), não cookie de sessão.
  if (new URL(c.req.url).pathname.startsWith("/api/webhooks/")) return next();

  const requestedWith = c.req.header("x-requested-with");
  if (requestedWith?.toLowerCase() === "fetch") return next();

  const origin = c.req.header("origin");
  if (origin) {
    let originUrl: URL;
    try {
      originUrl = new URL(origin);
    } catch {
      throw forbidden("Origem inválida");
    }
    if (originUrl.origin === new URL(c.req.url).origin) return next();
    // Proxies locais podem preservar a origem pública em X-Forwarded-Host.
    // Em produção esse header é controlável pelo cliente e não é aceito.
    const forwardedHost = c.req.header("x-forwarded-host");
    if (!isProduction(c.env) && forwardedHost && originUrl.host === forwardedHost) return next();
  }

  throw forbidden("Requisição bloqueada (CSRF): envie X-Requested-With: fetch ou um Origin válido");
});
