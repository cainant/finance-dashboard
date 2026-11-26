/**
 * `GET /api/transactions` (filtros, busca e cursor estável) e
 * `PATCH /api/transactions/:id` (categoria/notas/grupo de metas).
 *
 * O cursor é keyset: data+id para sorts por data, valor+id para sorts por valor.
 * Nunca offset (a página muda quando chegam transações novas).
 */
import { Hono } from "hono";
import type { Context } from "hono";
import {
  transactionsQuery,
  transactionsSummaryQuery,
  updateTransactionBody,
  idSchema,
  type TransactionSort,
  type TransactionsResponse,
  type TransactionsSummaryResponse,
  type UncategorizedCountResponse,
} from "@fd/contracts";
import {
  accounts,
  budgetGroups,
  categories,
  connections,
  institutions,
  transactions,
} from "@fd/database/schema";
import { and, asc, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { currentUser } from "../auth/middleware";
import { decodeCursor, encodeCursor } from "../domain/cursor";
import { transactionDto } from "../domain/dto";
import {
  transactionFilterConditions,
  transactionsSummary,
  uncategorizedCondition,
} from "../domain/transactions";
import type { AppEnv } from "../env";
import { badRequest, notFound } from "../http/errors";
import { jsonBody, queryParams, routeParams } from "../http/validate";

export const transactionRoutes = new Hono<AppEnv>();

const idParams = z.object({ id: idSchema });

/** Seleção comum com categoria, conta, provider e instituição. */
function selectTransactions(c: Context<AppEnv>) {
  return c
    .get("db")
    .select({
      transaction: transactions,
      category: categories,
      account: accounts,
      provider: connections.provider,
      institution: institutions,
    })
    .from(transactions)
    .innerJoin(connections, eq(connections.id, transactions.connectionId))
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(institutions, eq(institutions.id, connections.institutionId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId));
}

transactionRoutes.get("/", queryParams(transactionsQuery), async (c) => {
  const user = currentUser(c);
  const query = c.req.valid("query");

  // Mesmo recorte do resumo (`GET /api/transactions/summary`): filtros num
  // lugar só, para os totais nunca divergirem da lista.
  const conditions = transactionFilterConditions(user.id, query);

  const cursor = decodeCursor(query.cursor);
  if (query.cursor && !cursor) throw badRequest("Cursor inválido");
  if (cursor) {
    if (cursor.sort !== query.sort) throw badRequest("Cursor pertence a outra ordenação");
    conditions.push(cursorCondition(query.sort, cursor));
  }

  const rows = await selectTransactions(c)
    .where(and(...conditions))
    .orderBy(...orderBy(query.sort))
    .limit(query.limit + 1);

  const hasMore = rows.length > query.limit;
  const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
  const last = pageRows.at(-1);

  const body: TransactionsResponse = {
    data: pageRows.map((row: TransactionJoin) =>
      transactionDto(row.transaction, {
        category: row.category,
        account: {
          row: row.account,
          provider: row.provider as "demo" | "pluggy",
          institution: row.institution,
        },
      }),
    ),
    page: {
      cursor: query.cursor ?? null,
      nextCursor: hasMore && last ? encodeCursor(cursorFrom(query.sort, last)) : null,
    },
  };

  return c.json(body);
});

/**
 * `GET /api/transactions/summary` — receitas, despesas, resultado, total de
 * lançamentos e contagem por categoria de **todo** o filtro (não só da página
 * carregada). Roda como uma única agregação em SQL (ver
 * `domain/transactions.ts`), então "Carregar mais" não muda os números.
 */
transactionRoutes.get("/summary", queryParams(transactionsSummaryQuery), async (c) => {
  const user = currentUser(c);
  const query = c.req.valid("query");

  const summary = await transactionsSummary(c.get("db"), user.id, query);
  const body: TransactionsSummaryResponse = {
    period: { from: query.from, to: query.to },
    ...summary,
  };

  return c.json(body);
});

/**
 * `GET /api/transactions/uncategorized-count` — contador global (sem período)
 * usado pelo badge da sidebar e pelo alerta da Visão geral. É um único
 * `COUNT(*)` escopado por `user_id`; a regra de "sem categoria" é a mesma do
 * filtro `uncategorized=true` (ver `domain/transactions.ts`).
 */
transactionRoutes.get("/uncategorized-count", async (c) => {
  const user = currentUser(c);

  const [row] = await c
    .get("db")
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(and(eq(transactions.userId, user.id), uncategorizedCondition()));

  const body: UncategorizedCountResponse = { count: Number(row?.count ?? 0) };
  return c.json(body);
});

transactionRoutes.patch(
  "/:id",
  routeParams(idParams),
  jsonBody(updateTransactionBody),
  async (c) => {
    const user = currentUser(c);
    const db = c.get("db");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const [existing] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
      .limit(1);
    if (!existing) throw notFound("Transação não encontrada");

    if (body.categoryId !== undefined && body.categoryId !== null) {
      const [category] = await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.id, body.categoryId),
            or(isNull(categories.userId), eq(categories.userId, user.id)),
          ),
        )
        .limit(1);
      if (!category) throw badRequest("Categoria inválida");
    }

    if (body.budgetGroupId !== undefined && body.budgetGroupId !== null) {
      const [group] = await db
        .select({ id: budgetGroups.id })
        .from(budgetGroups)
        .where(and(eq(budgetGroups.id, body.budgetGroupId), eq(budgetGroups.userId, user.id)))
        .limit(1);
      if (!group) throw badRequest("Grupo de metas inválido");
    }

    const now = new Date().toISOString();
    const changes: Partial<typeof transactions.$inferInsert> = { updatedAt: now };
    if (body.categoryId !== undefined) {
      changes.categoryId = body.categoryId;
      // Marca como edição manual: o sync não sobrescreve mais esta categoria.
      changes.categorySource = "user";
    }
    if (body.notes !== undefined) changes.notes = body.notes ?? null;
    if (body.budgetGroupId !== undefined) changes.budgetGroupId = body.budgetGroupId;

    await db
      .update(transactions)
      .set(changes)
      .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)));

    const [row] = await selectTransactions(c)
      .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
      .limit(1);
    if (!row) throw notFound("Transação não encontrada");

    return c.json({
      data: transactionDto(row.transaction, {
        category: row.category,
        account: {
          row: row.account,
          provider: row.provider as "demo" | "pluggy",
          institution: row.institution,
        },
      }),
    });
  },
);

interface TransactionJoin {
  transaction: typeof transactions.$inferSelect;
  category: typeof categories.$inferSelect | null;
  account: typeof accounts.$inferSelect;
  provider: string;
  institution: typeof institutions.$inferSelect | null;
}

function orderBy(sort: TransactionSort) {
  switch (sort) {
    case "date_asc":
      return [asc(transactions.date), asc(transactions.id)];
    case "amount_desc":
      return [desc(transactions.amountCents), desc(transactions.id)];
    case "amount_asc":
      return [asc(transactions.amountCents), asc(transactions.id)];
    default:
      return [desc(transactions.date), desc(transactions.id)];
  }
}

function cursorCondition(
  sort: TransactionSort,
  cursor: NonNullable<ReturnType<typeof decodeCursor>>,
): SQL {
  switch (sort) {
    case "date_asc":
      return sql`(${transactions.date} > ${cursor.date} OR (${transactions.date} = ${cursor.date} AND ${transactions.id} > ${cursor.id}))`;
    case "amount_desc":
      return sql`(${transactions.amountCents} < ${cursor.amount} OR (${transactions.amountCents} = ${cursor.amount} AND ${transactions.id} < ${cursor.id}))`;
    case "amount_asc":
      return sql`(${transactions.amountCents} > ${cursor.amount} OR (${transactions.amountCents} = ${cursor.amount} AND ${transactions.id} > ${cursor.id}))`;
    default:
      return sql`(${transactions.date} < ${cursor.date} OR (${transactions.date} = ${cursor.date} AND ${transactions.id} < ${cursor.id}))`;
  }
}

function cursorFrom(sort: TransactionSort, row: { transaction: typeof transactions.$inferSelect }) {
  const cursor = { v: 1 as const, sort, id: row.transaction.id };
  if (sort === "amount_asc" || sort === "amount_desc") {
    return { ...cursor, amount: row.transaction.amountCents };
  }
  return { ...cursor, date: row.transaction.date };
}
