/**
 * Agregados por cartão que alimentam a fatura corrente derivada
 * (`derivedOpenBillRow`). Uma query com subconsultas por cartão (D1 Free).
 * Usado por `GET /api/bills/upcoming` e pela reserva de cartão.
 */
import type { Database } from "@fd/database";
import { accounts, creditCards } from "@fd/database/schema";
import { eq, sql } from "drizzle-orm";

import type { OpenBillCard } from "./bills";

export async function loadOpenBillCards(db: Database, userId: string): Promise<OpenBillCard[]> {
  const rows = await db
    .select({
      accountId: accounts.id,
      accountName: accounts.name,
      brand: creditCards.brand,
      balanceCents: accounts.balanceCents,
      closingDay: creditCards.closingDay,
      dueDay: creditCards.dueDay,
      lastBillDueDate: sql<
        string | null
      >`(SELECT MAX(b.due_date) FROM bills b WHERE b.account_id = ${accounts.id})`,
      lastClosingDate: sql<
        string | null
      >`(SELECT MAX(b.closing_date) FROM bills b WHERE b.account_id = ${accounts.id} AND b.closing_date IS NOT NULL)`,
      // Compras líquidas do ciclo: o dia do fechamento já pertence ao ciclo
      // corrente e estornos (`income`) abatem as despesas. Pagamentos chegam
      // como `transfer` e ficam fora; o saldo devedor limita o total.
      cycleNetCents: sql<number>`(
        SELECT COALESCE(SUM(-t.amount_cents), 0)
          FROM transactions t
         WHERE t.account_id = ${accounts.id}
           AND t.type IN ('expense', 'income')
           AND t.date >= (
             SELECT MAX(b.closing_date) FROM bills b
              WHERE b.account_id = ${accounts.id} AND b.closing_date IS NOT NULL
           )
      )`,
    })
    .from(creditCards)
    .innerJoin(accounts, eq(accounts.id, creditCards.accountId))
    .where(eq(accounts.userId, userId));

  return rows.map((row) => ({ ...row, cycleNetCents: Number(row.cycleNetCents) }));
}
