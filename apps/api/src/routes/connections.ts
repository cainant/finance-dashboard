/**
 * `GET/POST /api/connections` e `DELETE /api/connections/:id`.
 *
 * Demo: cria as 3 conexões fictícias (Banco Aurora, Nuvem Bank, Cooperativa
 * Horizonte) de uma vez e devolve a principal. O `POST .../sync` da principal
 * sincroniza todas as conexões demo do usuário (mesmo dataset).
 * Pluggy: exige `itemId` (widget Pluggy Connect ou MeuPluggy) e busca o item no
 * provider para validar e obter a instituição.
 */
import { Hono } from "hono";
import {
  createConnectionBody,
  idSchema,
  syncConnectionQuery,
  syncRunsQuery,
  type Connection,
  type ConnectionsResponse,
  type OkResponse,
  type SyncRunResponse,
  type SyncRunsResponse,
} from "@fd/contracts";
import type {
  Connection as ConnectionRow,
  Database,
  Institution as InstitutionRow,
} from "@fd/database";
import { connections, institutions, syncRuns } from "@fd/database/schema";
import {
  DEMO_CONNECTION_EXTERNAL_IDS,
  DEMO_INSTITUTIONS,
  isProviderError,
  type ProviderInstitution,
} from "@fd/financial-providers";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { currentUser } from "../auth/middleware";
import { connectionDto, syncRunDto } from "../domain/dto";
import { upsertInstitution } from "../domain/institutions";
import type { AppEnv } from "../env";
import { badRequest, conflict, notFound, providerError } from "../http/errors";
import { jsonBody, queryParams, routeParams } from "../http/validate";
import { SyncService } from "../sync/service";

export const connectionRoutes = new Hono<AppEnv>();

const idParams = z.object({ id: idSchema });

connectionRoutes.get("/", async (c) => {
  const user = currentUser(c);
  const rows = await c
    .get("db")
    .select({ connection: connections, institution: institutions })
    .from(connections)
    .leftJoin(institutions, eq(institutions.id, connections.institutionId))
    .where(eq(connections.userId, user.id))
    .orderBy(desc(connections.createdAt));

  const body: ConnectionsResponse = {
    data: rows.map((row) => connectionDto(row.connection, row.institution)),
  };
  return c.json(body);
});

connectionRoutes.post("/", jsonBody(createConnectionBody), async (c) => {
  const user = currentUser(c);
  const db = c.get("db");
  const body = c.req.valid("json");

  const registry = c.get("providers");

  if (body.provider === "demo") {
    if (!registry.get("demo")) {
      throw badRequest(
        "O modo demonstração não está disponível neste ambiente. Conecte o MeuPluggy para usar seus dados reais.",
      );
    }
    const result = await createDemoConnections(db, user.id);
    if (result.length === 0) throw providerError("Não foi possível criar a conexão demo.");
    const [primary] = result;
    return c.json({ data: connectionDto(primary!.connection, primary!.institution) }, 201);
  }

  const itemId = body.itemId!;

  // O `itemId` é global no Pluggy. Sem esta checagem, um usuário autenticado
  // que descubra o item de outra pessoa poderia anexá-lo à própria conta e
  // sincronizar os dados financeiros dela (IDOR entre usuários).
  const [existing] = await db
    .select({ id: connections.id, userId: connections.userId })
    .from(connections)
    .where(and(eq(connections.provider, "pluggy"), eq(connections.externalId, itemId)))
    .limit(1);
  if (existing) {
    throw existing.userId === user.id
      ? conflict("Esta conexão Pluggy já existe.")
      : conflict("Esta conexão já está vinculada a outro usuário.");
  }

  const provider = registry.require("pluggy");
  const providerConnection = await provider.getConnection(itemId);
  const institution = await upsertInstitution(db, "pluggy", providerConnection.institution);
  const now = new Date().toISOString();

  const [row] = await db
    .insert(connections)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      provider: "pluggy",
      externalId: itemId,
      institutionId: institution.id,
      status: providerConnection.status,
      statusDetail: providerConnection.statusDetail ?? null,
      // O item do provedor pode ter `lastUpdatedAt` de antes da conexão; usar
      // esse valor faria o primeiro sync virar incremental e perder o histórico.
      lastSyncedAt: null,
      consentExpiresAt: providerConnection.consentExpiresAt ?? null,
      createdAt: providerConnection.createdAt ?? now,
      updatedAt: providerConnection.updatedAt ?? now,
    })
    .returning();

  if (!row) throw providerError("Não foi possível salvar a conexão.");

  return c.json({ data: connectionDto(row, institution) }, 201);
});

connectionRoutes.delete("/:id", routeParams(idParams), async (c) => {
  const user = currentUser(c);
  const { id } = c.req.valid("param");
  const db = c.get("db");

  const [existing] = await db
    .select({
      id: connections.id,
      provider: connections.provider,
      externalId: connections.externalId,
    })
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.userId, user.id)))
    .limit(1);
  if (!existing) throw notFound("Conexão não encontrada");

  // Revoga o item no Pluggy antes de apagar o histórico local. Se o item já
  // não existe (404), a remoção local segue normalmente. Falhas de rede/auth
  // abortam para o usuário poder tentar de novo sem perder a conexão local.
  const pluggy = c.get("providers").pluggy;
  if (existing.provider === "pluggy" && pluggy) {
    try {
      await pluggy.deleteConnection(existing.externalId);
    } catch (error) {
      if (!isProviderError(error) || error.code !== "not_found") throw error;
    }
  }

  // Cascade: accounts, credit_cards, bills, transactions, snapshots, sync_runs.
  await db.delete(connections).where(and(eq(connections.id, id), eq(connections.userId, user.id)));

  const body: OkResponse = { ok: true };
  return c.json(body);
});

connectionRoutes.post(
  "/:id/sync",
  routeParams(idParams),
  queryParams(syncConnectionQuery),
  async (c) => {
    const user = currentUser(c);
    const { id } = c.req.valid("param");
    const { refresh } = c.req.valid("query");
    const db = c.get("db");

    const [connection] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.id, id), eq(connections.userId, user.id)))
      .limit(1);
    if (!connection) throw notFound("Conexão não encontrada");

    const service = new SyncService({ db, providers: c.get("providers") });

    // O dataset demo é dividido em 3 conexões (instituições); sincronizar uma
    // sincroniza todas para a UI receber o conjunto completo.
    const targets =
      connection.provider === "demo"
        ? [
            connection,
            ...(
              await db
                .select()
                .from(connections)
                .where(and(eq(connections.userId, user.id), eq(connections.provider, "demo")))
            ).filter((row) => row.id !== connection.id),
          ]
        : [connection];

    // `refresh` só vem `true` na primeira chamada de um sync manual: no Pluggy
    // comum dispara `PATCH /items`; no MeuPluggy é no-op declarado.
    const runs = await service.syncConnections(targets, undefined, { refresh });
    const requestedRun = runs.find((run) => run.connectionId === connection.id) ?? null;

    if (!requestedRun) throw providerError("Nenhuma sincronização foi executada.");
    if (requestedRun.status === "error") {
      throw providerError(requestedRun.errorMessage ?? "Falha na sincronização.", {
        runId: requestedRun.id,
        errorCode: requestedRun.errorCode,
      });
    }

    const body: SyncRunResponse = { data: syncRunDto(requestedRun) };
    return c.json(body);
  },
);

connectionRoutes.get(
  "/:id/sync-runs",
  routeParams(idParams),
  queryParams(syncRunsQuery),
  async (c) => {
    const user = currentUser(c);
    const { id } = c.req.valid("param");
    const { limit } = c.req.valid("query");
    const db = c.get("db");

    const [connection] = await db
      .select({ id: connections.id })
      .from(connections)
      .where(and(eq(connections.id, id), eq(connections.userId, user.id)))
      .limit(1);
    if (!connection) throw notFound("Conexão não encontrada");

    const rows = await db
      .select({ run: syncRuns })
      .from(syncRuns)
      .innerJoin(connections, eq(connections.id, syncRuns.connectionId))
      .where(and(eq(syncRuns.connectionId, id), eq(connections.userId, user.id)))
      .orderBy(desc(syncRuns.startedAt))
      .limit(limit);

    const body: SyncRunsResponse = { data: rows.map((row) => syncRunDto(row.run)) };
    return c.json(body);
  },
);

interface DemoConnectionResult {
  connection: ConnectionRow;
  institution: InstitutionRow;
}

async function createDemoConnections(
  db: Database,
  userId: string,
): Promise<DemoConnectionResult[]> {
  const results: DemoConnectionResult[] = [];
  const now = new Date().toISOString();

  for (const institution of DEMO_INSTITUTIONS) {
    const providerInstitution: ProviderInstitution = {
      externalId: institution.externalId,
      name: institution.name,
      primaryColor: institution.primaryColor,
      type: institution.type,
    };
    const institutionRow = await upsertInstitution(db, "demo", providerInstitution);
    const externalId = DEMO_CONNECTION_EXTERNAL_IDS[institution.key];

    const [existing] = await db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.userId, userId),
          eq(connections.provider, "demo"),
          eq(connections.externalId, externalId),
        ),
      )
      .limit(1);

    if (existing) {
      if (!existing.institutionId) {
        await db
          .update(connections)
          .set({ institutionId: institutionRow.id, updatedAt: now })
          .where(eq(connections.id, existing.id));
        existing.institutionId = institutionRow.id;
      }
      results.push({ connection: existing, institution: institutionRow });
      continue;
    }

    const [row] = await db
      .insert(connections)
      .values({
        id: crypto.randomUUID(),
        userId,
        provider: "demo",
        externalId,
        institutionId: institutionRow.id,
        status: "active",
        statusDetail: null,
        lastSyncedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (row) results.push({ connection: row, institution: institutionRow });
  }

  return results;
}

export type DemoConnection = Connection;
