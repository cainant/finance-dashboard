/** `GET /api/investments`. */
import { Hono } from "hono";
import type { InvestmentsResponse } from "@fd/contracts";
import { connections, institutions, investments } from "@fd/database/schema";
import { asc, desc, eq } from "drizzle-orm";

import { currentUser } from "../auth/middleware";
import { investmentDto } from "../domain/dto";
import type { AppEnv } from "../env";

export const investmentRoutes = new Hono<AppEnv>();

investmentRoutes.get("/", async (c) => {
  const user = currentUser(c);
  const rows = await c
    .get("db")
    .select({
      investment: investments,
      provider: connections.provider,
      institution: institutions,
    })
    .from(investments)
    .innerJoin(connections, eq(connections.id, investments.connectionId))
    .leftJoin(institutions, eq(institutions.id, connections.institutionId))
    .where(eq(investments.userId, user.id))
    .orderBy(desc(investments.balanceCents), asc(investments.name));

  const body: InvestmentsResponse = {
    data: rows.map((row) =>
      investmentDto(row.investment, row.provider as "demo" | "pluggy", row.institution),
    ),
  };
  return c.json(body);
});
