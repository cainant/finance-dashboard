/**
 * Série patrimonial (`netWorthSeries`, usada por `/api/analytics/net-worth`).
 *
 * Em produção o primeiro sync grava somente o snapshot do dia: todos os dias
 * anteriores caíam no fallback `accounts.balance_cents` e viravam uma linha
 * reta. O patrimônio também soma a tabela `investments`, que a página Contas
 * ignorava (a divergência de R$ 8,54 era esse total).
 */
import { addDays, todayIsoDate } from "@fd/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { balanceTotals, investmentsTotal, netWorthSeries } from "../src/domain/analytics";
import {
  createAccount,
  createBalanceSnapshot,
  createConnection,
  createInvestment,
  createTransaction,
} from "./fixtures";
import { createTestUser, db, resetDatabase } from "./helpers";

const today = todayIsoDate();
const day = (offset: number) => addDays(today, offset);

async function setup(): Promise<{ userId: string; connectionId: string }> {
  const user = await createTestUser();
  const connection = await createConnection({ userId: user.id, provider: "demo" });
  return { userId: user.id, connectionId: connection.id };
}

type Point = { date: string; assetsCents: number; liabilitiesCents: number };

function byDate(points: Point[]): Map<string, Point> {
  return new Map(points.map((point) => [point.date, point]));
}

describe("netWorthSeries", () => {
  beforeEach(resetDatabase);

  it("reconstrói os dias antes do primeiro snapshot com as transações", async () => {
    const { userId, connectionId } = await setup();
    const checking = await createAccount({ userId, connectionId, balanceCents: 100_000 });
    await createBalanceSnapshot({ accountId: checking.id, date: today, balanceCents: 100_000 });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: day(-20),
      description: "SALARIO",
      amountCents: 80_000,
      type: "income",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: day(-10),
      description: "ALUGUEL",
      amountCents: -30_000,
      type: "expense",
    });

    const series = await netWorthSeries(db, userId, { from: day(-30), to: today });
    const points = byDate(series);

    expect(series).toHaveLength(31);
    // Antes de qualquer lançamento: saldo atual - Σ transações posteriores.
    expect(points.get(day(-30))?.assetsCents).toBe(50_000);
    expect(points.get(day(-21))?.assetsCents).toBe(50_000);
    expect(points.get(day(-20))?.assetsCents).toBe(130_000);
    expect(points.get(day(-11))?.assetsCents).toBe(130_000);
    expect(points.get(day(-10))?.assetsCents).toBe(100_000);
    expect(points.get(today)?.assetsCents).toBe(100_000);
    // Não é uma linha reta.
    expect(new Set(series.map((point) => point.assetsCents)).size).toBeGreaterThan(2);
  });

  it("soma investimentos no gráfico e no KPI, batendo com o total da página Contas", async () => {
    const { userId, connectionId } = await setup();
    await createAccount({ userId, connectionId, balanceCents: 100_000 });
    await createAccount({
      userId,
      connectionId,
      type: "investment",
      name: "Previdência",
      balanceCents: 30_000,
    });
    await createAccount({
      userId,
      connectionId,
      type: "credit_card",
      name: "Cartão",
      balanceCents: 20_000,
    });
    await createInvestment({
      userId,
      connectionId,
      name: "CDB",
      balanceCents: 800,
    });
    await createInvestment({
      userId,
      connectionId,
      name: "Tesouro",
      balanceCents: 54,
    });

    const series = await netWorthSeries(db, userId, { from: day(-2), to: today });
    const last = series.at(-1);
    const totals = await balanceTotals(db, userId, today);
    const invested = await investmentsTotal(db, userId);
    // Mesma conta da página Contas: contas + investimentos - faturas.
    const contasCents = 100_000 + 30_000 + 800 + 54 - 20_000;

    expect(invested).toBe(854);
    expect(last).toMatchObject({
      date: today,
      assetsCents: 130_854,
      liabilitiesCents: 20_000,
    });
    expect(last!.assetsCents - last!.liabilitiesCents).toBe(contasCents);
    expect(totals.assetsCents + invested - totals.liabilitiesCents).toBe(contasCents);
    // Investimentos entram constantes em todos os pontos (sem histórico).
    expect(series[0]?.assetsCents).toBe(last?.assetsCents);
  });

  it("reconstrói a dívida do cartão com o sinal invertido", async () => {
    const { userId, connectionId } = await setup();
    const card = await createAccount({
      userId,
      connectionId,
      type: "credit_card",
      name: "Cartão",
      balanceCents: 50_000,
    });
    await createBalanceSnapshot({ accountId: card.id, date: today, balanceCents: 50_000 });
    await createTransaction({
      userId,
      connectionId,
      accountId: card.id,
      date: day(-5),
      description: "SUPERMERCADO",
      amountCents: -20_000,
      type: "expense",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: card.id,
      date: day(-2),
      description: "PAGAMENTO FATURA",
      amountCents: 5_000,
      type: "transfer",
    });

    const series = await netWorthSeries(db, userId, { from: day(-10), to: today });
    const points = byDate(series);

    // Compra (negativa) aumenta a dívida; pagamento (positivo) diminui.
    expect(points.get(day(-10))?.liabilitiesCents).toBe(35_000);
    expect(points.get(day(-5))?.liabilitiesCents).toBe(55_000);
    expect(points.get(day(-2))?.liabilitiesCents).toBe(50_000);
    expect(points.get(today)?.liabilitiesCents).toBe(50_000);
  });

  it("usa o snapshot existente e não reconstrói a conta de novo", async () => {
    const { userId, connectionId } = await setup();
    const checking = await createAccount({ userId, connectionId, balanceCents: 100_000 });
    await createBalanceSnapshot({ accountId: checking.id, date: day(-40), balanceCents: 40_000 });
    await createBalanceSnapshot({ accountId: checking.id, date: day(-20), balanceCents: 70_000 });
    await createBalanceSnapshot({ accountId: checking.id, date: today, balanceCents: 100_000 });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: day(-25),
      description: "COMPRA",
      amountCents: -10_000,
      type: "expense",
    });

    const series = await netWorthSeries(db, userId, { from: day(-40), to: today });
    const points = byDate(series);

    // Reconstruir dia -30 daria 110_000; o snapshot manda (40_000).
    expect(points.get(day(-30))?.assetsCents).toBe(40_000);
    expect(points.get(day(-10))?.assetsCents).toBe(70_000);
    expect(points.get(today)?.assetsCents).toBe(100_000);
  });

  it("reconstrói dias antes de um snapshot parcial e mantém o snapshot depois", async () => {
    const { userId, connectionId } = await setup();
    const checking = await createAccount({ userId, connectionId, balanceCents: 100_000 });
    await createBalanceSnapshot({ accountId: checking.id, date: day(-40), balanceCents: 40_000 });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: day(-55),
      description: "SALARIO",
      amountCents: 10_000,
      type: "income",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: day(-45),
      description: "ALUGUEL",
      amountCents: -20_000,
      type: "expense",
    });

    const series = await netWorthSeries(db, userId, { from: day(-60), to: today });
    const points = byDate(series);

    expect(points.get(day(-60))?.assetsCents).toBe(110_000);
    expect(points.get(day(-55))?.assetsCents).toBe(120_000);
    expect(points.get(day(-50))?.assetsCents).toBe(120_000);
    expect(points.get(day(-45))?.assetsCents).toBe(100_000);
    // Do primeiro snapshot em diante vale o snapshot (pode haver um salto).
    expect(points.get(day(-40))?.assetsCents).toBe(40_000);
    expect(points.get(today)?.assetsCents).toBe(40_000);
  });

  it("considera transações depois de period.to quando a janela termina no passado", async () => {
    const { userId, connectionId } = await setup();
    const checking = await createAccount({ userId, connectionId, balanceCents: 100_000 });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: day(-3),
      description: "ALUGUEL",
      amountCents: -40_000,
      type: "expense",
    });

    const series = await netWorthSeries(db, userId, { from: day(-10), to: day(-5) });
    const totals = await balanceTotals(db, userId, day(-5));

    expect(series).toHaveLength(6);
    // As datas geradas param em period.to (não se estendem até hoje).
    expect(series.every((point) => point.date <= day(-5))).toBe(true);
    // A transação de -3 é posterior à janela, mas precisa entrar na reconstrução.
    expect(series.every((point) => point.assetsCents === 140_000)).toBe(true);
    expect(totals.assetsCents).toBe(140_000);
    expect(series.at(-1)?.assetsCents).toBe(totals.assetsCents);
  });

  it("ignora transações pendentes e com data futura", async () => {
    const { userId, connectionId } = await setup();
    const checking = await createAccount({ userId, connectionId, balanceCents: 10_000 });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: day(-5),
      description: "SALARIO",
      amountCents: 1_000,
      type: "income",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: day(-5),
      description: "PENDENTE",
      amountCents: 999_999,
      type: "income",
      status: "pending",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: day(5),
      description: "AGENDADA",
      amountCents: -5_000,
      type: "expense",
    });

    const series = await netWorthSeries(db, userId, { from: day(-10), to: today });
    const points = byDate(series);

    expect(points.get(day(-10))?.assetsCents).toBe(9_000);
    expect(points.get(day(-5))?.assetsCents).toBe(10_000);
    expect(points.get(today)?.assetsCents).toBe(10_000);
    // Data futura positiva para o período não existe na série.
    expect(series.every((point) => point.date <= today)).toBe(true);
  });

  it("não vaza transações de outro usuário", async () => {
    const { userId, connectionId } = await setup();
    const checking = await createAccount({ userId, connectionId, balanceCents: 10_000 });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: day(-5),
      description: "SALARIO",
      amountCents: 1_000,
      type: "income",
    });
    const other = await setup();
    const otherAccount = await createAccount({
      userId: other.userId,
      connectionId: other.connectionId,
      balanceCents: 999_999,
    });
    await createTransaction({
      userId: other.userId,
      connectionId: other.connectionId,
      accountId: otherAccount.id,
      date: day(-5),
      description: "OUTRO USUARIO",
      amountCents: 500_000,
      type: "income",
    });

    const series = await netWorthSeries(db, userId, { from: day(-10), to: today });
    const points = byDate(series);

    expect(points.get(day(-10))?.assetsCents).toBe(9_000);
    expect(points.get(today)?.assetsCents).toBe(10_000);
  });

  it("reconstrói a conta sem nenhum snapshot a partir do saldo atual", async () => {
    const { userId, connectionId } = await setup();
    const savings = await createAccount({
      userId,
      connectionId,
      type: "savings",
      name: "Poupança",
      balanceCents: 10_000,
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: savings.id,
      date: day(-15),
      description: "RENDIMENTO",
      amountCents: 2_000,
      type: "income",
    });

    const series = await netWorthSeries(db, userId, { from: day(-30), to: today });
    const points = byDate(series);

    expect(points.get(day(-30))?.assetsCents).toBe(8_000);
    expect(points.get(day(-15))?.assetsCents).toBe(10_000);
    expect(points.get(today)?.assetsCents).toBe(10_000);
  });
});

describe("balanceTotals", () => {
  beforeEach(resetDatabase);

  it("reconstrói datas passadas como a série, para o delta do KPI acompanhar", async () => {
    const { userId, connectionId } = await setup();
    const checking = await createAccount({ userId, connectionId, balanceCents: 100_000 });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: day(-30),
      description: "SALARIO",
      amountCents: 60_000,
      type: "income",
    });
    await createTransaction({
      userId,
      connectionId,
      accountId: checking.id,
      date: day(-10),
      description: "ALUGUEL",
      amountCents: -10_000,
      type: "expense",
    });
    await createBalanceSnapshot({ accountId: checking.id, date: day(-5), balanceCents: 90_000 });
    await createBalanceSnapshot({ accountId: checking.id, date: today, balanceCents: 100_000 });

    const current = await balanceTotals(db, userId, today);
    const previous = await balanceTotals(db, userId, day(-20));
    const snapshotDay = await balanceTotals(db, userId, day(-1));
    const series = byDate(await netWorthSeries(db, userId, { from: day(-60), to: today }));

    expect(current).toEqual({ assetsCents: 100_000, liabilitiesCents: 0 });
    // sem snapshot até -20: 100_000 - (-10_000) = 110_000.
    expect(previous.assetsCents).toBe(110_000);
    expect(series.get(day(-20))?.assetsCents).toBe(110_000);
    // dia -1 é coberto pelo snapshot de -5.
    expect(snapshotDay.assetsCents).toBe(90_000);
    expect(series.get(day(-1))?.assetsCents).toBe(90_000);
    // O delta do overview não fica zerado quando o gráfico varia.
    expect(current.assetsCents - previous.assetsCents).toBe(-10_000);
  });
});
