/** `GET /api/categories` (sistema + usuário) e `POST /api/categories`. */
import { Hono } from "hono";
import type { Database } from "@fd/database";
import { createCategoryBody, type CategoriesResponse, type Category } from "@fd/contracts";
import { categories } from "@fd/database/schema";
import { and, asc, eq, isNull, or } from "drizzle-orm";

import { currentUser } from "../auth/middleware";
import { categoryDto } from "../domain/dto";
import { slugify } from "../domain/slug";
import type { AppEnv } from "../env";
import { badRequest } from "../http/errors";
import { jsonBody } from "../http/validate";

export const categoryRoutes = new Hono<AppEnv>();

categoryRoutes.get("/", async (c) => {
  const user = currentUser(c);
  const rows = await c
    .get("db")
    .select()
    .from(categories)
    .where(or(isNull(categories.userId), eq(categories.userId, user.id)))
    .orderBy(asc(categories.kind), asc(categories.name));

  const body: CategoriesResponse = { data: rows.map(categoryDto) };
  return c.json(body);
});

categoryRoutes.post("/", jsonBody(createCategoryBody), async (c) => {
  const user = currentUser(c);
  const db = c.get("db");
  const input = c.req.valid("json");

  if (input.parentId) {
    const [parent] = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, input.parentId),
          or(isNull(categories.userId), eq(categories.userId, user.id)),
        ),
      )
      .limit(1);
    if (!parent) throw badRequest("Categoria pai inválida");
  }

  const baseSlug = input.slug ?? slugify(input.name);
  const slug = await uniqueSlug(db, baseSlug, user.id);

  const [row] = await db
    .insert(categories)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      name: input.name.trim(),
      slug,
      icon: input.icon,
      color: input.color,
      kind: input.kind,
      parentId: input.parentId ?? null,
    })
    .returning();

  if (!row) throw badRequest("Não foi possível criar a categoria");

  const body: Category = categoryDto(row);
  return c.json(body, 201);
});

async function uniqueSlug(db: Database, base: string, userId: string): Promise<string> {
  const visibleOwnSlugs = await db
    .select({ slug: categories.slug })
    .from(categories)
    .where(or(isNull(categories.userId), eq(categories.userId, userId)));
  const taken = new Set<string>(visibleOwnSlugs.map((row) => row.slug));

  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}
