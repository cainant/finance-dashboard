/**
 * Composição do app Hono.
 *
 * A ordem dos middlewares importa: contexto (DB/providers) → log → headers de
 * segurança → CSRF → rotas. CORS não é habilitado: o frontend compartilha a
 * mesma origem (proxy do Vite em dev, Pages Function + service binding em prod).
 */
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { API_PREFIX, apiRoutes, type HealthResponse } from "@fd/contracts";

import { authRoutes } from "./auth/routes";
import { requireAuth } from "./auth/middleware";
import type { AppEnv } from "./env";
import { mapError } from "./http/errors";
import { csrfProtection, requestContext, requestLogger, secureHeaders } from "./http/middleware";
import { accountRoutes } from "./routes/accounts";
import { analyticsRoutes, overviewRoutes } from "./routes/analytics";
import { billRoutes } from "./routes/bills";
import { budgetRoutes } from "./routes/budget";
import { cardReserveRoutes, paymentPlanRoutes } from "./routes/card-reserves";
import { categoryRoutes } from "./routes/categories";
import { connectionRoutes } from "./routes/connections";
import { creditCardRoutes } from "./routes/credit-cards";
import { investmentRoutes } from "./routes/investments";
import { providerRoutes } from "./routes/providers";
import { settingsRoutes } from "./routes/settings";
import { transactionRoutes } from "./routes/transactions";
import { webhookRoutes } from "./sync/webhook";

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use("*", requestContext);
  app.use("*", requestLogger);
  app.use("*", secureHeaders);
  // Nenhuma rota aceita upload; 32 KiB cobre login, settings e webhook e evita
  // parsear corpos arbitrariamente grandes (CPU/memória do Free).
  app.use(`${API_PREFIX}/*`, bodyLimit({ maxSize: 32 * 1024 }));
  app.use(`${API_PREFIX}/*`, csrfProtection);

  app.get(apiRoutes.health, (c) => {
    const body: HealthResponse = { status: "ok", env: c.env.APP_ENV };
    return c.json(body);
  });

  app.route(`${API_PREFIX}/auth`, authRoutes);

  // Middleware de sessão apenas nas rotas protegidas (rotas desconhecidas
  // continuam 404, não 401).
  const protectedPaths = [
    apiRoutes.overview,
    `${API_PREFIX}/analytics/*`,
    `${API_PREFIX}/accounts`,
    `${API_PREFIX}/accounts/*`,
    `${API_PREFIX}/transactions`,
    `${API_PREFIX}/transactions/*`,
    `${API_PREFIX}/categories`,
    `${API_PREFIX}/categories/*`,
    `${API_PREFIX}/credit-cards`,
    `${API_PREFIX}/credit-cards/*`,
    `${API_PREFIX}/bills/*`,
    `${API_PREFIX}/investments`,
    `${API_PREFIX}/investments/*`,
    `${API_PREFIX}/connections`,
    `${API_PREFIX}/connections/*`,
    `${API_PREFIX}/providers`,
    `${API_PREFIX}/providers/*`,
    `${API_PREFIX}/settings`,
    `${API_PREFIX}/settings/*`,
    `${API_PREFIX}/budget`,
    `${API_PREFIX}/budget/*`,
    `${API_PREFIX}/card-reserves`,
  ];
  for (const path of protectedPaths) app.use(path, requireAuth);

  app.route(apiRoutes.overview, overviewRoutes);
  app.route(`${API_PREFIX}/webhooks`, webhookRoutes);
  app.route(`${API_PREFIX}/analytics`, analyticsRoutes);
  app.route(`${API_PREFIX}/accounts`, accountRoutes);
  app.route(`${API_PREFIX}/transactions`, transactionRoutes);
  app.route(`${API_PREFIX}/categories`, categoryRoutes);
  app.route(`${API_PREFIX}/credit-cards`, creditCardRoutes);
  app.route(`${API_PREFIX}/credit-cards`, paymentPlanRoutes);
  app.route(`${API_PREFIX}/card-reserves`, cardReserveRoutes);
  app.route(`${API_PREFIX}/bills`, billRoutes);
  app.route(`${API_PREFIX}/investments`, investmentRoutes);
  app.route(`${API_PREFIX}/connections`, connectionRoutes);
  app.route(`${API_PREFIX}/providers`, providerRoutes);
  app.route(`${API_PREFIX}/settings`, settingsRoutes);
  app.route(`${API_PREFIX}/budget`, budgetRoutes);

  app.notFound((c) =>
    c.json({ error: { code: "not_found", message: "Rota não encontrada" } }, 404),
  );

  app.onError((error, c) => {
    const mapped = mapError(error);
    const level = mapped.status >= 500 ? "error" : "warn";
    const log = level === "error" ? console.error : console.warn;
    log(
      JSON.stringify({
        event: "request_error",
        requestId: c.get("requestId"),
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status: mapped.status,
        code: mapped.body.error.code,
        errorName: error instanceof Error ? error.name : typeof error,
        // Mensagens de AppError/ProviderError são seguras (sem payload).
        errorMessage: mapped.status < 500 ? mapped.body.error.message : undefined,
        stack: mapped.status >= 500 && error instanceof Error ? error.stack : undefined,
      }),
    );

    return c.json(mapped.body, mapped.status);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
