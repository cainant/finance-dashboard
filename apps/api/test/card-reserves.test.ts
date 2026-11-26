/**
 * Reserva para faturas: `PUT /api/credit-cards/:id/payment-plan` e
 * `GET /api/card-reserves`. Datas relativas a hoje (a API usa o relógio real).
 */
import {
  addDays,
  apiErrorSchema,
  cardPaymentPlanResponse,
  cardReservesResponse,
  todayIsoDate,
  type CardReserves,
} from "@fd/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createAccount,
  createBill,
  createConnection,
  createCreditCard,
  createInstitution,
  createInvestment,
  createTransaction,
} from "./fixtures";
import { authedRequest, createSessionCookie, createTestUser, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

const today = todayIsoDate();
const day = (offset: number) => addDays(today, offset);

function putPlan(cookie: string, cardId: string, body: unknown) {
  return authedRequest(`/api/credit-cards/${cardId}/payment-plan`, cookie, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readReserves(cookie: string): Promise<CardReserves> {
  const response = await authedRequest("/api/card-reserves", cookie);
  expect(response.status).toBe(200);
  return cardReservesResponse.parse(await response.json()).data;
}

/**
 * Usuário com um cartão cuja última fatura (paga) fechou há 20 dias e uma
 * poupança. Ciclo aberto: compras de R$ 300 (−15d) e R$ 200 (−5d) e estorno de
 * R$ 50 (−3d) → fatura corrente derivada de R$ 450. Poupança: depósitos de
 * R$ 100 (−12d) e R$ 200 (−6d) → R$ 300 guardados.
 */
async function setup() {
  const user = await createTestUser();
  const { cookie } = await createSessionCookie(user.id);
  const institution = await createInstitution({ provider: "pluggy", name: "Banco Aurora" });
  const connection = await createConnection({
    userId: user.id,
    provider: "pluggy",
    institutionId: institution.id,
  });
  const ids = { userId: user.id, connectionId: connection.id };

  const card = await createAccount({
    ...ids,
    type: "credit_card",
    name: "Cartão Aurora",
    balanceCents: 150_000,
  });
  await createCreditCard({ accountId: card.id, closingDay: 1, dueDay: 10 });
  await createBill({
    accountId: card.id,
    closingDate: day(-20),
    dueDate: day(-10),
    totalCents: 80_000,
    status: "paid",
  });
  const tx = (accountId: string, date: string, amountCents: number) =>
    createTransaction({ ...ids, accountId, date, description: `t ${date}`, amountCents });
  await tx(card.id, day(-15), -30_000);
  await tx(card.id, day(-5), -20_000);
  await tx(card.id, day(-3), 5_000);

  const savings = await createAccount({
    ...ids,
    type: "savings",
    name: "Poupança",
    balanceCents: 30_000,
  });
  await tx(savings.id, day(-12), 10_000);
  await tx(savings.id, day(-6), 20_000);

  return { ...ids, cookie, card, savings, tx };
}

describe("PUT /api/credit-cards/:id/payment-plan", () => {
  it("grava o modo reserva com a conta escolhida", async () => {
    const { cookie, card, savings } = await setup();

    const response = await putPlan(cookie, card.id, {
      mode: "reserve",
      reserveAccountId: savings.id,
    });

    expect(response.status).toBe(200);
    expect(cardPaymentPlanResponse.parse(await response.json()).data).toEqual({
      accountId: card.id,
      mode: "reserve",
      reserveAccountId: savings.id,
      reserveInvestmentId: null,
    });
  });

  it("pagar no vencimento descarta a reserva", async () => {
    const { cookie, card, savings } = await setup();
    await putPlan(cookie, card.id, { mode: "reserve", reserveAccountId: savings.id });

    const response = await putPlan(cookie, card.id, {
      mode: "pay_on_due",
      reserveAccountId: savings.id,
    });

    expect(cardPaymentPlanResponse.parse(await response.json()).data).toMatchObject({
      mode: "pay_on_due",
      reserveAccountId: null,
    });
    expect((await readReserves(cookie)).reserves).toEqual([]);
  });

  it("rejeita cartão como reserva, fontes de outro usuário e as duas fontes juntas", async () => {
    const { cookie, card, savings, connectionId, userId } = await setup();
    const otherUser = await createTestUser();
    const other = await createSessionCookie(otherUser.id);

    const cardAsSource = await putPlan(cookie, card.id, {
      mode: "reserve",
      reserveAccountId: card.id,
    });
    expect(cardAsSource.status).toBe(400);

    const foreignCard = await putPlan(other.cookie, card.id, { mode: "pay_on_due" });
    expect(foreignCard.status).toBe(404);

    const investment = await createInvestment({
      userId,
      connectionId,
      name: "Caixinha",
      balanceCents: 1,
    });
    const both = await putPlan(cookie, card.id, {
      mode: "reserve",
      reserveAccountId: savings.id,
      reserveInvestmentId: investment.id,
    });
    expect(both.status).toBe(400);
    expect(apiErrorSchema.parse(await both.json()).error.code).toBe("validation_error");

    const notACard = await putPlan(cookie, savings.id, { mode: "pay_on_due" });
    expect(notACard.status).toBe(404);
  });
});

describe("GET /api/card-reserves", () => {
  it("compara o que as faturas vão cobrar com o guardado e conta o gasto desde o último depósito", async () => {
    const { cookie, card, savings } = await setup();
    await putPlan(cookie, card.id, { mode: "reserve", reserveAccountId: savings.id });

    const data = await readReserves(cookie);

    expect(data.unconfiguredCardIds).toEqual([]);
    expect(data.reserves).toEqual([
      {
        source: { kind: "account", id: savings.id, name: "Poupança", institutionName: null },
        cards: [{ accountId: card.id, name: "Cartão Aurora", neededCents: 45_000 }],
        neededCents: 45_000,
        reservedCents: 30_000,
        gapCents: 15_000,
        lastDepositDate: day(-6),
        // Depois do depósito de −6d: compra de R$ 200 − estorno de R$ 50.
        spentSinceDepositCents: 15_000,
      },
    ]);
  });

  it("soma faturas fechadas não pagas e cartões que dividem a reserva", async () => {
    const { cookie, card, savings, userId, connectionId, tx } = await setup();
    const second = await createAccount({
      userId,
      connectionId,
      type: "credit_card",
      name: "Cartão Nuvem",
      balanceCents: 70_000,
    });
    await createCreditCard({ accountId: second.id, closingDay: 3, dueDay: 12 });
    // Fatura fechada ainda não paga; nada comprado depois do fechamento.
    await createBill({
      accountId: second.id,
      closingDate: day(-2),
      dueDate: day(5),
      totalCents: 70_000,
      status: "closed",
    });
    await tx(second.id, day(-4), -70_000);
    await putPlan(cookie, card.id, { mode: "reserve", reserveAccountId: savings.id });
    await putPlan(cookie, second.id, { mode: "reserve", reserveAccountId: savings.id });

    const [reserve] = (await readReserves(cookie)).reserves;

    expect(reserve?.cards.map((item) => [item.name, item.neededCents])).toEqual([
      ["Cartão Aurora", 45_000],
      ["Cartão Nuvem", 70_000],
    ]);
    expect(reserve).toMatchObject({ neededCents: 115_000, gapCents: 85_000 });
  });

  it("investimento como reserva: sem extrato, sem 'desde o último depósito'", async () => {
    const { cookie, card, userId, connectionId } = await setup();
    const investment = await createInvestment({
      userId,
      connectionId,
      name: "Caixinha Fatura",
      balanceCents: 100_000,
    });
    await putPlan(cookie, card.id, { mode: "reserve", reserveInvestmentId: investment.id });

    const [reserve] = (await readReserves(cookie)).reserves;

    expect(reserve).toMatchObject({
      source: { kind: "investment", name: "Caixinha Fatura", institutionName: "Banco Aurora" },
      neededCents: 45_000,
      reservedCents: 100_000,
      gapCents: 0,
      lastDepositDate: null,
      spentSinceDepositCents: null,
    });
  });

  it("modo reserva sem fonte aparece como pendente de configuração", async () => {
    const { cookie, card } = await setup();
    await putPlan(cookie, card.id, { mode: "reserve" });

    const data = await readReserves(cookie);

    expect(data.unconfiguredCardIds).toEqual([card.id]);
    expect(data.reserves).toEqual([]);
    expect(data.plans).toEqual([
      { accountId: card.id, mode: "reserve", reserveAccountId: null, reserveInvestmentId: null },
    ]);
  });

  it("sem planos devolve listas vazias e exige sessão", async () => {
    const { cookie } = await setup();
    expect(await readReserves(cookie)).toEqual({
      plans: [],
      reserves: [],
      unconfiguredCardIds: [],
    });
    expect((await authedRequest("/api/card-reserves", "fd_session=x")).status).toBe(401);
  });
});
