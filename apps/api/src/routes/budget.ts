/**
 * `GET/PUT /api/budget` (renda de referência + grupos de metas),
 * `GET /api/budget/progress?month=YYYY-MM` (realizado × meta) e
 * `PUT /api/budget/categories/:categoryId` (grupo padrão da categoria).
 */
import { Hono } from "hono";
import {
  budgetProgressQuery,
  idSchema,
  todayIsoDate,
  updateBudgetBody,
  updateBudgetCategoryBody,
  type BudgetProgressResponse,
  type BudgetResponse,
} from "@fd/contracts";
import { budgetGroups, categories } from "@fd/database/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { currentUser } from "../auth/middleware";
import {
  budgetProgress,
  ensureDefaultBudgetGroups,
  incomeStatement,
  loadBudget,
  replaceGroupsStatements,
} from "../domain/budget";
import type { AppEnv } from "../env";
import { badRequest, notFound } from "../http/errors";
import { jsonBody, queryParams, routeParams } from "../http/validate";

export const budgetRoutes = new Hono<AppEnv>();

budgetRoutes.get("/", async (c) => {
  const user = currentUser(c);
  const body: BudgetResponse = { data: await loadBudget(c.env.DB, c.get("db"), user.id) };
  return c.json(body);
});

budgetRoutes.get("/progress", queryParams(budgetProgressQuery), async (c) => {
  const user = currentUser(c);
  const { month } = c.req.valid("query");
  const body: BudgetProgressResponse = {
    data: await budgetProgress(c.env.DB, c.get("db"), user.id, month ?? todayIsoDate().slice(0, 7)),
  };
  return c.json(body);
});

budgetRoutes.put("/", jsonBody(updateBudgetBody), async (c) => {
  const user = currentUser(c);
  const db = c.get("db");
  const input = c.req.valid("json");
  const statements: D1PreparedStatement[] = [];

  if (input.referenceIncomeCents !== undefined) {
    statements.push(incomeStatement(c.env.DB, user.id, input.referenceIncomeCents));
  }

  if (input.groups !== undefined) {
    await ensureDefaultBudgetGroups(c.env.DB, db, user.id);
    const rows = await db
      .select({ id: budgetGroups.id })
      .from(budgetGroups)
      .where(eq(budgetGroups.userId, user.id));
    const existingIds = new Set(rows.map((row) => row.id));
    for (const group of input.groups) {
      if (group.id !== undefined && !existingIds.has(group.id)) {
        throw badRequest("Grupo de metas inválido");
      }
    }
    statements.push(
      ...replaceGroupsStatements(
        c.env.DB,
        user.id,
        input.groups,
        existingIds,
        new Date().toISOString(),
      ),
    );
  }

  // Um batch = uma query no D1 Free e atômico: nunca fica metade das metas salva.
  if (statements.length > 0) await c.env.DB.batch(statements);

  const body: BudgetResponse = { data: await loadBudget(c.env.DB, db, user.id) };
  return c.json(body);
});

const categoryParams = z.object({ categoryId: idSchema });

budgetRoutes.put(
  "/categories/:categoryId",
  routeParams(categoryParams),
  jsonBody(updateBudgetCategoryBody),
  async (c) => {
    const user = currentUser(c);
    const db = c.get("db");
    const { categoryId } = c.req.valid("param");
    const { groupId } = c.req.valid("json");

    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          or(isNull(categories.userId), eq(categories.userId, user.id)),
        ),
      )
      .limit(1);
    if (!category) throw notFound("Categoria não encontrada");

    if (groupId === null) {
      await c.env.DB.prepare(
        "DELETE FROM budget_category_groups WHERE user_id = ? AND category_id = ?",
      )
        .bind(user.id, categoryId)
        .run();
    } else {
      const [group] = await db
        .select({ id: budgetGroups.id })
        .from(budgetGroups)
        .where(and(eq(budgetGroups.id, groupId), eq(budgetGroups.userId, user.id)))
        .limit(1);
      if (!group) throw badRequest("Grupo de metas inválido");
      await c.env.DB.prepare(
        "INSERT INTO budget_category_groups (user_id, category_id, group_id) VALUES (?, ?, ?) " +
          "ON CONFLICT(user_id, category_id) DO UPDATE SET group_id = excluded.group_id",
      )
        .bind(user.id, categoryId, groupId)
        .run();
    }

    const body: BudgetResponse = { data: await loadBudget(c.env.DB, db, user.id) };
    return c.json(body);
  },
);
