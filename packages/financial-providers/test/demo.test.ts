import { describe, expect, it } from "vitest";

import {
  DEMO_CONNECTION_EXTERNAL_IDS,
  DEMO_OPENING_BALANCES_CENTS,
  DemoProvider,
  PROVIDER_CATEGORY_HINTS,
  ProviderError,
} from "../src";

const NOW = new Date("2026-11-10T15:00:00.000Z");
const FROM = "2025-12-01";
const TO = "2026-11-10";

const CONNECTION_IDS = Object.values(DEMO_CONNECTION_EXTERNAL_IDS);

function provider(): DemoProvider {
  return new DemoProvider({ now: NOW });
}

async function accountsOf(p: DemoProvider) {
  const groups = await Promise.all(CONNECTION_IDS.map((id) => p.getAccounts(id)));
  return groups.flat();
}

async function allTransactions(p: DemoProvider) {
  const accounts = await accountsOf(p);
  const groups = await Promise.all(
    accounts.map((account) => p.getTransactions(account.externalId, { from: FROM, to: TO })),
  );
  return groups.flat();
}

describe("DemoProvider", () => {
  it("é determinístico para o mesmo instante de referência", async () => {
    const first = provider();
    const second = provider();

    expect(await first.getAccounts(DEMO_CONNECTION_EXTERNAL_IDS.aurora)).toEqual(
      await second.getAccounts(DEMO_CONNECTION_EXTERNAL_IDS.aurora),
    );
    expect(await allTransactions(first)).toEqual(await allTransactions(second));
    expect(await first.getBills("demo-acc-aurora-card")).toEqual(
      await second.getBills("demo-acc-aurora-card"),
    );
    expect(await first.getInvestments(DEMO_CONNECTION_EXTERNAL_IDS.horizonte)).toEqual(
      await second.getInvestments(DEMO_CONNECTION_EXTERNAL_IDS.horizonte),
    );
  });

  it("usa o `now` injetado (e muda os dados quando o dia muda)", async () => {
    const later = new DemoProvider({ now: new Date("2026-12-15T15:00:00.000Z") });
    const current = await provider().getTransactions("demo-acc-aurora-checking", {
      from: FROM,
      to: TO,
    });
    const future = await later.getTransactions("demo-acc-aurora-checking", {
      from: "2026-01-01",
      to: "2026-12-15",
    });

    expect(future.some((transaction) => transaction.date.startsWith("2026-12"))).toBe(true);
    expect(current.every((transaction) => transaction.date <= TO)).toBe(true);
  });

  it("expõe 3 instituições fictícias com cores próprias", async () => {
    const p = provider();
    const connections = await Promise.all(CONNECTION_IDS.map((id) => p.getConnection(id)));

    expect(connections).toHaveLength(3);
    expect(connections.map((connection) => connection.institution.name)).toEqual([
      "Banco Aurora",
      "Nuvem Bank",
      "Cooperativa Horizonte",
    ]);
    expect(new Set(connections.map((c) => c.institution.primaryColor)).size).toBe(3);
    expect(connections.every((connection) => connection.status === "active")).toBe(true);
    expect(connections.every((connection) => connection.provider === "demo")).toBe(true);

    // Nunca usar nome de banco real nos dados fictícios.
    const realBanks = ["itau", "bradesco", "santander", "nubank", "bb", "caixa"];
    for (const connection of connections) {
      const name = connection.institution.name.toLowerCase();
      expect(realBanks.some((bank) => name.includes(bank))).toBe(false);
    }
  });

  it("tem contas correntes/poupança, 2 cartões e 3 investimentos", async () => {
    const p = provider();
    const accounts = await accountsOf(p);
    const cards = (await Promise.all(CONNECTION_IDS.map((id) => p.getCreditCards(id)))).flat();
    const investments = await p.getInvestments(DEMO_CONNECTION_EXTERNAL_IDS.horizonte);

    expect(accounts.filter((a) => a.type === "checking")).toHaveLength(3);
    expect(accounts.filter((a) => a.type === "savings")).toHaveLength(2);
    expect(accounts.filter((a) => a.type === "credit_card")).toHaveLength(2);
    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.brand).sort()).toEqual(["MASTERCARD", "VISA"]);
    expect(cards.every((card) => (card.limitCents ?? 0) > 0)).toBe(true);
    expect(cards.every((card) => (card.closingDay ?? 0) >= 1)).toBe(true);
    expect(cards.every((card) => (card.dueDay ?? 0) >= 1)).toBe(true);

    expect(investments).toHaveLength(3);
    expect(new Set(investments.map((investment) => investment.type))).toEqual(
      new Set(["fixed_income", "fund"]),
    );
    expect(investments.every((investment) => investment.balanceCents > 0)).toBe(true);
  });

  it("gera ~12 meses de transações realistas, com salário em todos os meses", async () => {
    const transactions = await allTransactions(provider());
    const months = new Set(transactions.map((transaction) => transaction.date.slice(0, 7)));
    const salary = transactions.filter((transaction) =>
      transaction.description.includes("SALARIO"),
    );
    const installments = transactions.filter((transaction) =>
      /Parcela \d+\/\d+/.test(transaction.description),
    );

    expect(months.size).toBe(12);
    expect(salary).toHaveLength(12);
    expect(salary.every((transaction) => transaction.amountCents === 850_000)).toBe(true);
    expect(installments.length).toBeGreaterThan(0);
    expect(
      installments.every(
        (transaction) =>
          (transaction.installmentNumber ?? 0) >= 1 &&
          (transaction.totalInstallments ?? 0) >= (transaction.installmentNumber ?? 0),
      ),
    ).toBe(true);
    expect(
      transactions.some((transaction) => transaction.description.startsWith("PIX ENVIADO")),
    ).toBe(true);
    expect(
      transactions.some((transaction) => transaction.description.startsWith("PIX RECEBIDO")),
    ).toBe(true);
    expect(
      transactions.some((transaction) =>
        ["UBER *TRIP", "99APP *CORRIDA", "SUPERMERCADO BOM PRECO"].includes(
          transaction.description,
        ),
      ),
    ).toBe(true);
  });

  it("mantém o sinal e os categoryHints dentro do contrato", async () => {
    const transactions = await allTransactions(provider());
    const allowed = new Set(PROVIDER_CATEGORY_HINTS);

    for (const transaction of transactions) {
      expect(allowed.has(transaction.categoryHint)).toBe(true);
      if (transaction.type === "income") expect(transaction.amountCents).toBeGreaterThan(0);
      if (transaction.type === "expense") expect(transaction.amountCents).toBeLessThan(0);
      expect(["posted", "pending"]).toContain(transaction.status);
    }

    const cardTransactions = transactions.filter((transaction) =>
      transaction.accountExternalId.startsWith("demo-acc-aurora-card"),
    );
    expect(cardTransactions.length).toBeGreaterThan(0);
    expect(
      cardTransactions
        .filter((transaction) => transaction.type === "expense")
        .every((transaction) => transaction.amountCents < 0),
    ).toBe(true);
  });

  it("fecha os saldos: abertura + posted = saldo atual", async () => {
    const p = provider();
    const accounts = await accountsOf(p);
    const bankAccounts = accounts.filter((account) => account.type !== "credit_card");

    for (const account of bankAccounts) {
      const transactions = await p.getTransactions(account.externalId, { from: FROM, to: TO });
      const posted = transactions
        .filter((transaction) => transaction.status === "posted")
        .reduce((total, transaction) => total + transaction.amountCents, 0);
      const opening = DEMO_OPENING_BALANCES_CENTS[account.externalId];

      expect(opening).toBeTypeOf("number");
      expect(account.balanceCents).toBe((opening ?? 0) + posted);
    }

    const balances = (await Promise.all(CONNECTION_IDS.map((id) => p.getBalances(id)))).flat();
    expect(balances).toHaveLength(accounts.length);
    for (const account of accounts) {
      const balance = balances.find((item) => item.accountExternalId === account.externalId);
      expect(balance?.balanceCents).toBe(account.balanceCents);
    }
  });

  it("mantém o saldo devedor do cartão coerente com as faturas não pagas", async () => {
    const p = provider();
    const accounts = await accountsOf(p);
    const cards = accounts.filter((account) => account.type === "credit_card");

    for (const card of cards) {
      const bills = await p.getBills(card.externalId);
      const unpaid = bills
        .filter((bill) => bill.status !== "paid")
        .reduce((total, bill) => total + bill.totalCents, 0);
      const cardInfo = (await Promise.all(CONNECTION_IDS.map((id) => p.getCreditCards(id))))
        .flat()
        .find((item) => item.accountExternalId === card.externalId);

      expect(bills).toHaveLength(7);
      expect(bills.filter((bill) => bill.status === "open")).toHaveLength(1);
      expect(bills.filter((bill) => bill.status === "paid").length).toBeGreaterThanOrEqual(5);
      expect(card.balanceCents).toBe(unpaid);
      expect(card.availableCents).toBe((cardInfo?.limitCents ?? 0) - unpaid);
      expect(bills.every((bill) => bill.totalCents > 0)).toBe(true);
      expect(
        bills.every((bill) => bill.minimumPaymentCents === Math.round(bill.totalCents * 0.1)),
      ).toBe(true);
    }
  });

  it("pagina transações com contrato de continuação do provider", async () => {
    const p = provider();
    const first = await p.getTransactionsPage("demo-acc-aurora-checking", {
      from: FROM,
      to: TO,
      maxPages: 1,
      requestBudget: 1,
    });

    expect(first.partial).toBe(true);
    expect(first.nextCursor).not.toBeNull();
    expect(first.transactions).toHaveLength(60);
    expect(first.requestCount).toBe(0);

    const second = await p.getTransactionsPage("demo-acc-aurora-checking", {
      from: FROM,
      to: TO,
      cursor: first.nextCursor,
    });
    expect(second.transactions).toHaveLength(60);
    expect(second.transactions[0]?.externalId).not.toBe(first.transactions[0]?.externalId);

    const all = await p.getTransactions("demo-acc-aurora-checking", { from: FROM, to: TO });
    expect(all.length).toBeGreaterThan(60);
    expect(new Set(all.map((transaction) => transaction.externalId)).size).toBe(all.length);
  });

  it("valida período e recursos inexistentes com ProviderError", async () => {
    const p = provider();

    await expect(
      p.getTransactions("demo-acc-aurora-checking", { from: "2026-13-01", to: TO }),
    ).rejects.toMatchObject({ code: "invalid_response", retryable: false });
    await expect(
      p.getTransactions("demo-acc-aurora-checking", { from: TO, to: FROM }),
    ).rejects.toMatchObject({ code: "invalid_response" });
    await expect(p.getConnection("nao-existe")).rejects.toBeInstanceOf(ProviderError);
    await expect(p.getAccounts("nao-existe")).rejects.toMatchObject({ code: "not_found" });
  });

  it("declara capabilities coerentes com o demo offline", () => {
    const p = provider();
    expect(p.capabilities).toEqual({
      supportsManualRefresh: false,
      supportsWebhooks: false,
      supportsCreditCards: true,
      supportsInvestments: true,
    });
    expect(p.id).toBe("demo");
  });
});
