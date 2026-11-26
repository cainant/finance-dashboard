import { describe, expect, it, vi } from "vitest";

import {
  PluggyProvider,
  detectCreditCardSignConvention,
  mapPluggyTransaction,
  type PluggyTransaction,
} from "../src";
import fixture from "./fixtures/pluggy/real-sandbox/pluggy-sandbox-real.json";

const NOW = Date.parse("2026-11-10T15:00:00.000Z");
const ITEM = fixture.item;
const ACCOUNTS = fixture.accounts;
const BANK_ACCOUNT_ID = ACCOUNTS.results[0]!.id;
const CARD_ACCOUNT_ID = ACCOUNTS.results[1]!.id;
const BANK_TRANSACTIONS = fixture.transactions as Record<
  string,
  { results: PluggyTransaction[]; next: string | null }
>;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

function makeProvider() {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth") return jsonResponse({ apiKey: "pluggy-api-key" });
    if (url.pathname === `/items/${ITEM.id}`) return jsonResponse(ITEM);
    if (url.pathname === "/accounts") return jsonResponse(ACCOUNTS);
    if (url.pathname === "/v2/transactions") {
      const accountId = url.searchParams.get("accountId");
      const page = BANK_TRANSACTIONS[accountId ?? ""];
      if (!page) throw new Error(`conta inesperada: ${accountId}`);
      return jsonResponse(page);
    }
    if (url.pathname === "/bills") {
      const accountId = url.searchParams.get("accountId");
      return jsonResponse(fixture.bills[accountId as keyof typeof fixture.bills]);
    }
    if (url.pathname === "/investments") return jsonResponse(fixture.investments);
    throw new Error(`fetch inesperado: ${url.pathname}`);
  });

  return new PluggyProvider({
    clientId: "client-id",
    clientSecret: "client-secret",
    fetch: fetchMock,
    now: () => NOW,
    sleep: async () => {},
    maxRetries: 0,
  });
}

describe("fixture real do sandbox Pluggy Bank", () => {
  it("mapeia item, contas e faturas sem persistir dados pessoais", async () => {
    const provider = makeProvider();

    const connection = await provider.getConnection(ITEM.id);
    expect(connection).toMatchObject({
      externalId: ITEM.id,
      status: "active",
      institution: { name: "Pluggy Bank", externalId: "2" },
      consentExpiresAt: null,
    });

    const accounts = await provider.getAccounts(ITEM.id);
    expect(accounts).toHaveLength(2);
    expect(accounts.find((account) => account.externalId === BANK_ACCOUNT_ID)).toMatchObject({
      type: "checking",
      name: "Conta Corrente",
      institutionName: null,
    });
    expect(accounts.find((account) => account.externalId === CARD_ACCOUNT_ID)).toMatchObject({
      type: "credit_card",
      name: "Mastercard Black",
      institutionName: null,
    });
    expect(JSON.stringify(accounts)).not.toContain("***.***.***-**");
    expect(JSON.stringify(accounts)).not.toContain("Titular de Teste");

    const bills = await provider.getBills(CARD_ACCOUNT_ID);
    expect(bills).toHaveLength(2);
    expect(bills.map((bill) => bill.status)).toEqual(["closed", "closed"]);
  });

  it("importa as 31 transações da conta corrente usando o sinal do amount", async () => {
    const provider = makeProvider();
    const page = await provider.getTransactionsPage(BANK_ACCOUNT_ID, {
      from: "2025-11-11",
      to: "2026-11-10",
      accountType: "bank",
    });

    expect(page.transactions).toHaveLength(31);
    expect(page.partial).toBe(false);
    expect(page.detectedSignConvention ?? null).toBeNull();
    for (const transaction of page.transactions) {
      const raw = BANK_TRANSACTIONS[BANK_ACCOUNT_ID]!.results.find(
        (item) => item.id === transaction.externalId,
      )!;
      expect(Math.sign(transaction.amountCents)).toBe(Math.sign(raw.amount));
    }

    const salary = page.transactions.find(
      (transaction) => transaction.description === "SALARIO EMPRESA XYZ LTDA",
    );
    expect(salary).toMatchObject({ amountCents: 850_000, type: "income" });
  });

  it("detecta purchase_negative e mapeia as 18 compras do cartão como despesa", async () => {
    const provider = makeProvider();
    const page = await provider.getTransactionsPage(CARD_ACCOUNT_ID, {
      from: "2025-11-11",
      to: "2026-11-10",
      accountType: "credit_card",
    });

    expect(page.transactions).toHaveLength(18);
    expect(page.detectedSignConvention).toBe("purchase_negative");
    expect(page.signConventionSampleSize).toBe(18);
    expect(page.transactions.every((transaction) => transaction.amountCents < 0)).toBe(true);
    expect(page.transactions.every((transaction) => transaction.type === "expense")).toBe(true);

    const netflix = page.transactions.find(
      (transaction) => transaction.description === "NETFLIX.COM",
    );
    expect(netflix).toMatchObject({ amountCents: -5_590, type: "expense" });
    expect(page.transactions.find((transaction) => transaction.type === "income")).toBeUndefined();
  });
});

describe("convenção de sinal do cartão", () => {
  function purchase(amount: number): PluggyTransaction {
    return {
      id: `purchase-${amount}`,
      accountId: "card-1",
      description: "SMART FIT ACADEMIA",
      amount,
      date: "2026-11-01T12:00:00.000Z",
      type: amount > 0 ? "DEBIT" : "CREDIT",
    };
  }

  function payment(amount: number): PluggyTransaction {
    return {
      id: `payment-${amount}`,
      accountId: "card-1",
      description: "PAGAMENTO FATURA CARTAO",
      amount,
      date: "2026-11-02T12:00:00.000Z",
      type: "CREDIT",
      category: "Credit card payment",
    };
  }

  it("detecta purchase_positive no formato da documentação", () => {
    const transactions = [
      ...Array.from({ length: 6 }, (_, index) => purchase(10 + index)),
      payment(-50),
    ];
    const detection = detectCreditCardSignConvention(transactions);

    expect(detection).toMatchObject({
      convention: "purchase_positive",
      sampleSize: 7,
      persist: true,
    });

    const mappedPurchase = mapPluggyTransaction(purchase(25), {
      accountType: "CREDIT",
      amountSignConvention: "purchase_positive",
    });
    const mappedPayment = mapPluggyTransaction(payment(-50), {
      accountType: "CREDIT",
      amountSignConvention: "purchase_positive",
    });
    expect(mappedPurchase).toMatchObject({ amountCents: -2_500, type: "expense" });
    expect(mappedPayment).toMatchObject({ amountCents: 5_000, type: "transfer" });
  });

  it("não inverte a convenção persistida com uma amostra pequena", () => {
    const detection = detectCreditCardSignConvention([payment(100)], "purchase_negative");
    expect(detection).toMatchObject({
      convention: "purchase_negative",
      sampleSize: 1,
      persist: false,
    });

    const mapped = mapPluggyTransaction(payment(100), {
      accountType: "CREDIT",
      amountSignConvention: "purchase_negative",
    });
    expect(mapped).toMatchObject({ amountCents: 10_000, type: "transfer" });
  });

  it("não persiste convenção inicial com amostra pequena, mesmo com pagamento forte", () => {
    const detection = detectCreditCardSignConvention([payment(100)]);
    expect(detection).toMatchObject({
      convention: "purchase_negative",
      sampleSize: 1,
      persist: false,
    });
  });

  it("mapeia compra negativa sem convenção como despesa (sandbox)", () => {
    const mapped = mapPluggyTransaction(purchase(-89.9), { accountType: "CREDIT" });
    expect(mapped).toMatchObject({ amountCents: -8_990, type: "expense" });
  });

  it("mapeia estorno como receita positiva", () => {
    const refund: PluggyTransaction = {
      id: "refund-1",
      accountId: "card-1",
      description: "ESTORNO DE COMPRA",
      amount: -15,
      date: "2026-11-03T12:00:00.000Z",
      type: "CREDIT",
    };
    const mapped = mapPluggyTransaction(refund, {
      accountType: "CREDIT",
      amountSignConvention: "purchase_negative",
    });
    expect(mapped).toMatchObject({ amountCents: 1_500, type: "income" });
  });
});
