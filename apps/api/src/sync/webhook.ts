/**
 * Webhook do Pluggy (`POST /api/webhooks/pluggy`).
 *
 * A Pluggy NÃO assina webhooks: validamos o header secreto `x-webhook-secret`
 * (configurado no `POST /webhooks` da Pluggy com `headers`), conferimos o
 * `clientId` e SEMPRE re-buscamos o recurso no provider. Respondemos 2xx rápido
 * e sincronizamos em background via `executionCtx.waitUntil`.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Connection as ConnectionRow, Database } from "@fd/database";
import { accounts, connections } from "@fd/database/schema";
import { isProviderError } from "@fd/financial-providers";
import { and, eq } from "drizzle-orm";

import { timingSafeEqual } from "../auth/password";
import { pluggyCredentials, webhookSecret, type AppEnv } from "../env";
import { AppError, badRequest, forbidden } from "../http/errors";
import { SyncService } from "./service";

export const webhookRoutes = new Hono<AppEnv>();

webhookRoutes.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

interface PluggyWebhookPayload {
  event?: unknown;
  itemId?: unknown;
  accountId?: unknown;
  clientId?: unknown;
  transactionIds?: unknown;
}

function readTransactionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0)),
  ].slice(0, 500);
}

webhookRoutes.post("/pluggy", async (c) => {
  const secret = webhookSecret(c.env);
  if (!secret) {
    throw new AppError(503, "provider_error", "Webhook do Pluggy não está configurado.");
  }

  const provided = c.req.header("x-webhook-secret");
  if (!provided || !secureEqual(provided, secret)) {
    throw new AppError(401, "unauthorized", "Segredo do webhook inválido.");
  }

  let payload: PluggyWebhookPayload;
  try {
    payload = (await c.req.json()) as PluggyWebhookPayload;
  } catch {
    throw badRequest("Payload do webhook inválido");
  }

  const expectedClientId = pluggyCredentials(c.env).clientId;
  if (expectedClientId && payload.clientId !== expectedClientId) {
    throw forbidden("clientId do webhook não corresponde ao configurado.");
  }

  const event = typeof payload.event === "string" ? payload.event : "unknown";
  const itemId = typeof payload.itemId === "string" ? payload.itemId : undefined;
  const accountId = typeof payload.accountId === "string" ? payload.accountId : undefined;
  const transactionIds = readTransactionIds(payload.transactionIds);

  const connection = await findConnection(c.get("db"), itemId, accountId);

  // Sem conexão conhecida (outro cliente/instituição): 2xx para não gerar retry.
  if (!connection) return c.json({ ok: true }, 202);

  const service = new SyncService({ db: c.get("db"), providers: c.get("providers") });

  if (event === "transactions/deleted") {
    // IDs vêm do payload só como sinal; a operação é idempotente e restrita à
    // conexão encontrada pelo itemId/accountId. Se a transação reaparecer, o
    // próximo sync a recria.
    await runInBackground(
      c,
      service.deleteTransactions(connection.id, transactionIds).then((requested) => {
        console.log(
          JSON.stringify({
            event: "webhook_transactions_deleted",
            connectionId: connection.id,
            requested,
            received: transactionIds.length,
          }),
        );
      }),
    );
    return c.json({ ok: true }, 202);
  }

  if (event === "item/deleted") {
    // O payload não é confiável: só marca como desconectada se o provider
    // confirmar que o item não existe mais (404). Se ele ainda existir, ignora.
    const provider = c.get("providers").require("pluggy");
    let exists = true;
    try {
      await provider.getConnection(connection.externalId);
    } catch (error) {
      if (!(isProviderError(error) && error.code === "not_found")) throw error;
      exists = false;
    }
    if (!exists) await service.markDisconnected(connection.id);
    return c.json({ ok: true }, 202);
  }

  await runInBackground(
    c,
    service.syncConnection(connection).then((run) => {
      console.log(
        JSON.stringify({
          event: "webhook_sync",
          webhookEvent: event,
          connectionId: connection.id,
          status: run.status,
          runId: run.id,
        }),
      );
    }),
  );

  return c.json({ ok: true }, 202);
});

async function findConnection(
  db: Database,
  itemId: string | undefined,
  accountId: string | undefined,
): Promise<ConnectionRow | null> {
  if (itemId) {
    const [row] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.provider, "pluggy"), eq(connections.externalId, itemId)))
      .limit(1);
    return row ?? null;
  }

  if (accountId) {
    const [row] = await db
      .select({ connection: connections })
      .from(accounts)
      .innerJoin(connections, eq(connections.id, accounts.connectionId))
      .where(and(eq(accounts.externalId, accountId), eq(connections.provider, "pluggy")))
      .limit(1);
    return row?.connection ?? null;
  }

  return null;
}

async function runInBackground(c: Context<AppEnv>, task: Promise<void>): Promise<void> {
  const guarded = task.catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: "webhook_sync_failed",
        requestId: c.get("requestId"),
        error: error instanceof Error ? error.name : typeof error,
      }),
    );
  });

  try {
    c.executionCtx.waitUntil(guarded);
  } catch {
    // Ambientes sem ExecutionContext (testes unitários): processa antes de
    // responder para não deixar a promise solta.
    await guarded;
  }
}

function secureEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  return timingSafeEqual(encoder.encode(a), encoder.encode(b));
}
