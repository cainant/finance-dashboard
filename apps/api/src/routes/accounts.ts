/** `GET /api/accounts` e `GET /api/accounts/:id`. */
import { Hono } from "hono";
import { idSchema, type AccountsResponse } from "@fd/contracts";
import { accounts, connections, institutions } from "@fd/database/schema";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { currentUser } from "../auth/middleware";
import { accountDto } from "../domain/dto";
import type { AppEnv } from "../env";
import { notFound } from "../http/errors";
import { routeParams } from "../http/validate";

export const accountRoutes = new Hono<AppEnv>();

const idParams = z.object({ id: idSchema });

accountRoutes.get("/", async (c) => {
  const user = currentUser(c);
  const rows = await c
    .get("db")
    .select({
      account: accounts,
      provider: connections.provider,
      institution: institutions,
    })
    .from(accounts)
    .innerJoin(connections, eq(connections.id, accounts.connectionId))
    .leftJoin(institutions, eq(institutions.id, connections.institutionId))
    .where(eq(accounts.userId, user.id))
    .orderBy(asc(accounts.type), asc(accounts.name));

  const body: AccountsResponse = {
    data: rows.map((row) => accountDto(row.account, row.provider as "demo" | "pluggy")),
  };
  return c.json(body);
});

accountRoutes.get("/:id", routeParams(idParams), async (c) => {
  const user = currentUser(c);
  const { id } = c.req.valid("param");

  const [row] = await c
    .get("db")
    .select({
      account: accounts,
      provider: connections.provider,
      institution: institutions,
    })
    .from(accounts)
    .innerJoin(connections, eq(connections.id, accounts.connectionId))
    .leftJoin(institutions, eq(institutions.id, connections.institutionId))
    .where(and(eq(accounts.id, id), eq(accounts.userId, user.id)))
    .limit(1);

  if (!row) throw notFound("Conta não encontrada");

  return c.json(accountDto(row.account, row.provider as "demo" | "pluggy"));
});
