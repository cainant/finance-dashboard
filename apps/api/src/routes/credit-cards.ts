/** `GET /api/credit-cards` e `GET /api/credit-cards/:id/bills`. */
import { Hono } from "hono";
import { idSchema, type BillsResponse, type CreditCardsResponse } from "@fd/contracts";
import type { Database } from "@fd/database";
import { accounts, bills, connections, creditCards, institutions } from "@fd/database/schema";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { currentUser } from "../auth/middleware";
import { closingDayFromBills } from "../domain/bills";
import { billDto, creditCardDto } from "../domain/dto";
import type { AppEnv } from "../env";
import { notFound } from "../http/errors";
import { routeParams } from "../http/validate";

export const creditCardRoutes = new Hono<AppEnv>();

const idParams = z.object({ id: idSchema });

creditCardRoutes.get("/", async (c) => {
  const user = currentUser(c);
  const db = c.get("db");
  const rows = await db
    .select({
      card: creditCards,
      account: accounts,
      provider: connections.provider,
      institution: institutions,
    })
    .from(creditCards)
    .innerJoin(accounts, eq(accounts.id, creditCards.accountId))
    .innerJoin(connections, eq(connections.id, accounts.connectionId))
    .leftJoin(institutions, eq(institutions.id, connections.institutionId))
    .where(eq(accounts.userId, user.id))
    .orderBy(asc(accounts.name));

  const derivedClosingDays = await closingDaysFromBills(db, rows);

  const body: CreditCardsResponse = {
    data: rows.map((row) =>
      creditCardDto(
        row.card,
        row.account,
        row.provider as "demo" | "pluggy",
        row.institution,
        derivedClosingDays.get(row.card.accountId) ?? null,
      ),
    ),
  };
  return c.json(body);
});

creditCardRoutes.get("/:id/bills", routeParams(idParams), async (c) => {
  const user = currentUser(c);
  const { id } = c.req.valid("param");
  const db = c.get("db");

  const [card] = await db
    .select({ accountId: creditCards.accountId })
    .from(creditCards)
    .innerJoin(accounts, eq(accounts.id, creditCards.accountId))
    .where(and(eq(creditCards.accountId, id), eq(accounts.userId, user.id)))
    .limit(1);

  if (!card) throw notFound("Cartão não encontrado");

  const rows = await db
    .select()
    .from(bills)
    .innerJoin(accounts, eq(accounts.id, bills.accountId))
    .where(and(eq(bills.accountId, id), eq(accounts.userId, user.id)))
    .orderBy(desc(bills.dueDate));

  const body: BillsResponse = { data: rows.map((row) => billDto(row.bills)) };
  return c.json(body);
});

/**
 * Dia de fechamento para os cartões em que o provider não informou
 * `balanceCloseDate`. Uma query a mais, só quando falta o campo, e a moda das
 * últimas faturas decide o dia — o `billClosingDate` do Pluggy vem em toda
 * fatura mesmo quando o cartão não traz o fechamento. Os `accountId`s já vêm
 * escopados pelo usuário na query dos cartões, então não precisa do join.
 */
async function closingDaysFromBills(
  db: Database,
  rows: readonly { card: { accountId: string; closingDay: number | null } }[],
): Promise<Map<string, number>> {
  const derived = new Map<string, number>();
  const missing = rows.filter((row) => row.card.closingDay === null);
  if (missing.length === 0) return derived;

  const billRows = await db
    .select({ accountId: bills.accountId, dueDate: bills.dueDate, closingDate: bills.closingDate })
    .from(bills)
    .where(
      and(
        inArray(
          bills.accountId,
          missing.map((row) => row.card.accountId),
        ),
        isNotNull(bills.closingDate),
      ),
    )
    .orderBy(asc(bills.accountId), desc(bills.dueDate));

  const byAccount = new Map<string, { dueDate: string; closingDate: string | null }[]>();
  for (const row of billRows) {
    const list = byAccount.get(row.accountId) ?? [];
    list.push({ dueDate: row.dueDate, closingDate: row.closingDate });
    byAccount.set(row.accountId, list);
  }

  for (const [accountId, list] of byAccount) {
    const day = closingDayFromBills(list);
    if (day !== null) derived.set(accountId, day);
  }

  return derived;
}
