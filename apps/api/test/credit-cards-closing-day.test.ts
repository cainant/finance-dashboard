/**
 * Dia de fechamento do cartão derivado das faturas e o status do histórico.
 *
 * O Pluggy às vezes omite `creditData.balanceCloseDate` no cartão (a tela
 * mostrava "Fecha dia —"), mas cada fatura traz `billClosingDate`. O endpoint
 * `/api/credit-cards` completa o campo com a moda dos dias das últimas faturas
 * e preserva o que o provider informar.
 */
import { addDays, creditCardsResponse } from "@fd/contracts";
import type { Bill as BillRow } from "@fd/database";
import { beforeEach, describe, expect, it } from "vitest";

import { billStatusOnDate, closingDayFromBills } from "../src/domain/bills";
import { createAccount, createBill, createConnection, createCreditCard } from "./fixtures";
import { authedRequest, createSessionCookie, createTestUser, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("closingDayFromBills", () => {
  it("usa a moda dos dias das últimas faturas, não a mais recente isolada", () => {
    // O fechamento real oscila quando o dia nominal cai em fim de semana.
    expect(
      closingDayFromBills([
        { dueDate: "2026-11-07", closingDate: "2026-10-30" },
        { dueDate: "2026-10-07", closingDate: "2026-09-28" },
        { dueDate: "2026-09-07", closingDate: "2026-08-30" },
      ]),
    ).toBe(30);
  });

  it("no empate, fica com o dia da fatura mais recente", () => {
    expect(
      closingDayFromBills([
        { dueDate: "2026-11-07", closingDate: "2026-10-30" },
        { dueDate: "2026-10-07", closingDate: "2026-09-15" },
      ]),
    ).toBe(30);
  });

  it("ignora o desvio de fim de semana da fatura mais recente", () => {
    // A fatura mais nova fechou dia 15 (sábado); o cartão fecha dia 20.
    expect(
      closingDayFromBills([
        { dueDate: "2026-12-07", closingDate: "2026-11-15" },
        { dueDate: "2026-11-07", closingDate: "2026-10-20" },
        { dueDate: "2026-10-07", closingDate: "2026-09-20" },
        { dueDate: "2026-09-07", closingDate: "2026-08-20" },
        { dueDate: "2026-08-07", closingDate: "2026-07-20" },
        { dueDate: "2026-07-07", closingDate: "2026-06-20" },
      ]),
    ).toBe(20);
  });

  it("considera só as 6 faturas mais recentes com fechamento", () => {
    const rows = [
      { dueDate: "2026-11-07", closingDate: "2026-10-20" },
      { dueDate: "2026-10-07", closingDate: "2026-09-20" },
      { dueDate: "2026-09-07", closingDate: "2026-08-20" },
      { dueDate: "2026-08-07", closingDate: "2026-07-20" },
      { dueDate: "2026-07-07", closingDate: "2026-06-20" },
      { dueDate: "2026-06-07", closingDate: "2026-05-20" },
      { dueDate: "2026-05-07", closingDate: "2026-04-15" },
      { dueDate: "2026-04-07", closingDate: "2026-03-15" },
    ];

    expect(closingDayFromBills(rows)).toBe(20);
  });

  it("ignora faturas sem fechamento, inclusive a mais nova", () => {
    expect(
      closingDayFromBills([
        { dueDate: "2026-12-07", closingDate: null },
        { dueDate: "2026-11-07", closingDate: "2026-10-05" },
      ]),
    ).toBe(5);
  });

  it("aceita fechamento com hora e devolve null quando não há data válida", () => {
    expect(
      closingDayFromBills([{ dueDate: "2026-11-07", closingDate: "2026-10-30T00:00:00.000Z" }]),
    ).toBe(30);
    expect(closingDayFromBills([])).toBeNull();
    expect(closingDayFromBills([{ dueDate: "2026-11-07", closingDate: null }])).toBeNull();
    expect(
      closingDayFromBills([{ dueDate: "2026-11-07", closingDate: "data-invalida" }]),
    ).toBeNull();
  });
});

describe("billStatusOnDate — histórico", () => {
  function row(overrides: Partial<BillRow> & Pick<BillRow, "dueDate" | "status">): BillRow {
    return {
      id: crypto.randomUUID(),
      accountId: "card-1",
      externalId: crypto.randomUUID(),
      closingDate: null,
      totalCents: 100_000,
      minimumPaymentCents: null,
      ...overrides,
    };
  }

  it("só é histórico (closed) depois de 90 dias do vencimento", () => {
    const today = "2026-11-13";

    expect(billStatusOnDate(row({ dueDate: addDays(today, -91), status: "closed" }), today)).toBe(
      "closed",
    );
    expect(billStatusOnDate(row({ dueDate: addDays(today, -89), status: "open" }), today)).toBe(
      "overdue",
    );
    // Fechamento já passou: fechada aguardando pagamento, não "overdue".
    expect(
      billStatusOnDate(
        row({ dueDate: addDays(today, 10), closingDate: addDays(today, -2), status: "open" }),
        today,
      ),
    ).toBe("closed");
  });
});

async function setupCard(
  closingDay: number | null,
  bills: { dueDate: string; closingDate: string | null }[],
): Promise<{ cookie: string; accountId: string }> {
  const user = await createTestUser();
  const { cookie } = await createSessionCookie(user.id);
  const connection = await createConnection({ userId: user.id, provider: "pluggy" });
  const account = await createAccount({
    userId: user.id,
    connectionId: connection.id,
    type: "credit_card",
    name: "Cartão MeuPluggy",
    balanceCents: 0,
  });
  await createCreditCard({ accountId: account.id, closingDay, dueDay: 7 });

  for (const [index, item] of bills.entries()) {
    await createBill({
      accountId: account.id,
      externalId: `bill-${index}`,
      dueDate: item.dueDate,
      closingDate: item.closingDate,
      totalCents: 100_000,
      status: "paid",
    });
  }

  return { cookie, accountId: account.id };
}

describe("GET /api/credit-cards — dia de fechamento", () => {
  it("completa o campo com a moda das faturas que têm fechamento", async () => {
    const { cookie, accountId } = await setupCard(null, [
      { dueDate: "2026-11-07", closingDate: "2026-10-30" },
      { dueDate: "2026-12-07", closingDate: null },
      { dueDate: "2026-10-07", closingDate: "2026-09-28" },
      { dueDate: "2026-09-07", closingDate: "2026-08-30" },
    ]);

    const response = await authedRequest("/api/credit-cards", cookie);
    expect(response.status).toBe(200);

    const body = creditCardsResponse.parse(await response.json());
    expect(body.data.find((card) => card.accountId === accountId)?.closingDay).toBe(30);
  }, 20_000);

  it("preserva o dia de fechamento que o provider já informou", async () => {
    const { cookie, accountId } = await setupCard(21, [
      { dueDate: "2026-11-07", closingDate: "2026-10-30" },
    ]);

    const response = await authedRequest("/api/credit-cards", cookie);
    const body = creditCardsResponse.parse(await response.json());
    expect(body.data.find((card) => card.accountId === accountId)?.closingDay).toBe(21);
  }, 20_000);

  it("continua null quando nenhuma fatura traz fechamento", async () => {
    const { cookie, accountId } = await setupCard(null, [
      { dueDate: "2026-11-07", closingDate: null },
    ]);

    const response = await authedRequest("/api/credit-cards", cookie);
    const body = creditCardsResponse.parse(await response.json());
    expect(body.data.find((card) => card.accountId === accountId)?.closingDay).toBeNull();
  }, 20_000);

  it("deriva por cartão e não vaza faturas de outro usuário", async () => {
    const userA = await createTestUser();
    const { cookie: cookieA } = await createSessionCookie(userA.id);
    const connectionA = await createConnection({ userId: userA.id, provider: "pluggy" });

    const providerCard = await createAccount({
      userId: userA.id,
      connectionId: connectionA.id,
      type: "credit_card",
      name: "Cartão com fechamento do provider",
      balanceCents: 0,
    });
    await createCreditCard({ accountId: providerCard.id, closingDay: 21, dueDay: 7 });
    await createBill({
      accountId: providerCard.id,
      externalId: "provider-bill",
      dueDate: "2026-11-07",
      closingDate: "2026-10-30",
      totalCents: 100_000,
      status: "paid",
    });

    const derivedCard = await createAccount({
      userId: userA.id,
      connectionId: connectionA.id,
      type: "credit_card",
      name: "Cartão sem fechamento do provider",
      balanceCents: 0,
    });
    await createCreditCard({ accountId: derivedCard.id, closingDay: null, dueDay: 7 });
    await createBill({
      accountId: derivedCard.id,
      externalId: "derived-bill",
      dueDate: "2026-11-07",
      closingDate: "2026-10-12",
      totalCents: 100_000,
      status: "paid",
    });

    const userB = await createTestUser();
    const { cookie: cookieB } = await createSessionCookie(userB.id);
    const connectionB = await createConnection({ userId: userB.id, provider: "pluggy" });
    const otherCard = await createAccount({
      userId: userB.id,
      connectionId: connectionB.id,
      type: "credit_card",
      name: "Cartão de B",
      balanceCents: 0,
    });
    await createCreditCard({ accountId: otherCard.id, closingDay: null, dueDay: 7 });
    await createBill({
      accountId: otherCard.id,
      externalId: "other-bill",
      dueDate: "2026-11-07",
      closingDate: "2026-10-05",
      totalCents: 100_000,
      status: "paid",
    });

    const responseA = await authedRequest("/api/credit-cards", cookieA);
    const bodyA = creditCardsResponse.parse(await responseA.json());
    expect(bodyA.data).toHaveLength(2);
    expect(bodyA.data.find((card) => card.accountId === providerCard.id)?.closingDay).toBe(21);
    expect(bodyA.data.find((card) => card.accountId === derivedCard.id)?.closingDay).toBe(12);
    expect(bodyA.data.some((card) => card.accountId === otherCard.id)).toBe(false);

    const responseB = await authedRequest("/api/credit-cards", cookieB);
    const bodyB = creditCardsResponse.parse(await responseB.json());
    expect(bodyB.data).toHaveLength(1);
    expect(bodyB.data[0]?.closingDay).toBe(5);
  }, 30_000);
});
