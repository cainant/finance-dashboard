/**
 * `GET /api/card-reserves` (situação das reservas) e
 * `PUT /api/credit-cards/:id/payment-plan` (montada em `creditCardRoutes`).
 */
import { Hono } from "hono";
import {
  idSchema,
  todayIsoDate,
  updateCardPaymentPlanBody,
  type CardPaymentPlanResponse,
  type CardReservesResponse,
} from "@fd/contracts";
import { accounts, cardPaymentPlans, creditCards, investments } from "@fd/database/schema";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { currentUser } from "../auth/middleware";
import { loadCardReserves, planDto } from "../domain/card-reserve";
import type { AppEnv } from "../env";
import { badRequest, notFound } from "../http/errors";
import { jsonBody, routeParams } from "../http/validate";

export const cardReserveRoutes = new Hono<AppEnv>();

cardReserveRoutes.get("/", async (c) => {
  const user = currentUser(c);
  const body: CardReservesResponse = {
    data: await loadCardReserves(c.env.DB, c.get("db"), user.id, todayIsoDate()),
  };
  return c.json(body);
});

export const paymentPlanRoutes = new Hono<AppEnv>();

const idParams = z.object({ id: idSchema });

paymentPlanRoutes.put(
  "/:id/payment-plan",
  routeParams(idParams),
  jsonBody(updateCardPaymentPlanBody),
  async (c) => {
    const user = currentUser(c);
    const db = c.get("db");
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");

    const [card] = await db
      .select({ id: accounts.id })
      .from(creditCards)
      .innerJoin(accounts, eq(accounts.id, creditCards.accountId))
      .where(and(eq(creditCards.accountId, id), eq(accounts.userId, user.id)))
      .limit(1);
    if (!card) throw notFound("Cartão não encontrado");

    // Em `pay_on_due` a reserva não vale nada: grava `null` para não deixar
    // fonte órfã que voltaria sozinha ao reativar o modo.
    const reserve = input.mode === "reserve";
    const reserveAccountId = reserve ? (input.reserveAccountId ?? null) : null;
    const reserveInvestmentId = reserve ? (input.reserveInvestmentId ?? null) : null;

    if (reserveAccountId) {
      const [source] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.id, reserveAccountId),
            eq(accounts.userId, user.id),
            ne(accounts.type, "credit_card"),
          ),
        )
        .limit(1);
      if (!source) throw badRequest("Conta de reserva inválida");
    }
    if (reserveInvestmentId) {
      const [source] = await db
        .select({ id: investments.id })
        .from(investments)
        .where(and(eq(investments.id, reserveInvestmentId), eq(investments.userId, user.id)))
        .limit(1);
      if (!source) throw badRequest("Investimento de reserva inválido");
    }

    const values = {
      accountId: id,
      userId: user.id,
      mode: input.mode,
      reserveAccountId,
      reserveInvestmentId,
      updatedAt: new Date().toISOString(),
    };
    const [row] = await db
      .insert(cardPaymentPlans)
      .values(values)
      .onConflictDoUpdate({
        target: cardPaymentPlans.accountId,
        set: {
          mode: values.mode,
          reserveAccountId: values.reserveAccountId,
          reserveInvestmentId: values.reserveInvestmentId,
          updatedAt: values.updatedAt,
        },
      })
      .returning();
    if (!row) throw badRequest("Não foi possível salvar o plano do cartão");

    const body: CardPaymentPlanResponse = { data: planDto(row) };
    return c.json(body);
  },
);
