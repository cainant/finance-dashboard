/** `GET /api/bills/upcoming` e `GET /api/bills/:id/transactions`. */
import { Hono } from "hono";
import {
  addDays,
  idSchema,
  todayIsoDate,
  upcomingBillsQuery,
  type Transaction,
  type UpcomingBill,
  type UpcomingBillsResponse,
} from "@fd/contracts";
import {
  accounts,
  bills,
  categories,
  connections,
  creditCards,
  institutions,
  transactions,
} from "@fd/database/schema";
import { and, asc, desc, eq, gte, lte, ne } from "drizzle-orm";
import { z } from "zod";

import { currentUser } from "../auth/middleware";
import { derivedOpenBillRow } from "../domain/bills";
import { loadOpenBillCards } from "../domain/open-bill-cards";
import { transactionDto, upcomingBillDto } from "../domain/dto";
import type { AppEnv } from "../env";
import { notFound } from "../http/errors";
import { queryParams, routeParams } from "../http/validate";

export const billRoutes = new Hono<AppEnv>();

const idParams = z.object({ id: idSchema });

/**
 * Faturas a vencer: as persistidas pelo sync (status != `paid`) mais a fatura
 * corrente **derivada** de cada cartão. O Pluggy/MeuPluggy devolve só faturas
 * fechadas em `/bills`; quando todas estão pagas, a fatura aberta (valor e
 * vencimento) não existiria em lugar nenhum. Ver `domain/bills.ts`.
 */
billRoutes.get("/upcoming", queryParams(upcomingBillsQuery), async (c) => {
  const user = currentUser(c);
  const { days, limit } = c.req.valid("query");
  const today = todayIsoDate();
  const horizon = addDays(today, days);
  // Inclui atrasadas recentes (daysUntilDue negativo, como no contrato).
  const floor = addDays(today, -90);
  const db = c.get("db");

  const [rows, cardRows] = await Promise.all([
    db
      .select({
        bill: bills,
        accountName: accounts.name,
        brand: creditCards.brand,
      })
      .from(bills)
      .innerJoin(accounts, eq(accounts.id, bills.accountId))
      .leftJoin(creditCards, eq(creditCards.accountId, bills.accountId))
      .where(
        and(
          eq(accounts.userId, user.id),
          ne(bills.status, "paid"),
          gte(bills.dueDate, floor),
          lte(bills.dueDate, horizon),
        ),
      )
      .orderBy(asc(bills.dueDate))
      .limit(limit),
    // Agregados por cartão em subconsultas: 2 queries por request (D1 Free).
    loadOpenBillCards(db, user.id),
  ]);

  const data: UpcomingBill[] = rows.map((row) =>
    upcomingBillDto({ ...row.bill, accountName: row.accountName, brand: row.brand }, today),
  );

  for (const card of cardRows) {
    const derived = derivedOpenBillRow(card, today);
    if (derived === null || derived.dueDate > horizon) continue;

    data.push({
      ...upcomingBillDto({ ...derived, accountName: card.accountName, brand: card.brand }, today),
      estimated: true,
    });
  }

  const body: UpcomingBillsResponse = {
    data: data
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
      .slice(0, limit),
  };

  return c.json(body);
});

billRoutes.get("/:id/transactions", routeParams(idParams), async (c) => {
  const user = currentUser(c);
  const { id } = c.req.valid("param");
  const db = c.get("db");

  const [bill] = await db
    .select({ id: bills.id })
    .from(bills)
    .innerJoin(accounts, eq(accounts.id, bills.accountId))
    .where(and(eq(bills.id, id), eq(accounts.userId, user.id)))
    .limit(1);
  if (!bill) throw notFound("Fatura não encontrada");

  const rows = await db
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
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.billId, id), eq(transactions.userId, user.id)))
    .orderBy(desc(transactions.date), desc(transactions.id));

  const data: Transaction[] = rows.map((row) =>
    transactionDto(row.transaction, {
      category: row.category,
      account: {
        row: row.account,
        provider: row.provider as "demo" | "pluggy",
        institution: row.institution,
      },
    }),
  );

  return c.json({ data });
});
