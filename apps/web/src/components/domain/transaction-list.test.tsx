import type { Transaction } from "@fd/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TransactionList } from "./transaction-list";

function transaction(amountCents: number): Transaction {
  return {
    id: "t1",
    userId: "u1",
    accountId: "a1",
    connectionId: "c1",
    externalId: "ext-1",
    date: "2026-11-05",
    description: amountCents > 0 ? "Salário" : "Compra no mercado",
    amountCents,
    currency: "BRL",
    type: amountCents > 0 ? "income" : "expense",
    categoryId: null,
    status: "posted",
    billId: null,
    merchant: null,
    notes: null,
    installmentNumber: null,
    totalInstallments: null,
    budgetGroupId: null,
    createdAt: "2026-11-05T12:00:00.000Z",
    updatedAt: "2026-11-05T12:00:00.000Z",
    category: null,
    account: null,
  };
}

function render(amountCents: number): string {
  return renderToStaticMarkup(
    <TransactionList transactions={[transaction(amountCents)]} categories={[]} />,
  );
}

function transactionWithAccount(): Transaction {
  return {
    ...transaction(-28_614),
    account: {
      id: "a1",
      name: "Conta Corrente",
      numberMasked: "••1234",
      currency: "BRL",
      balanceCents: 100_000,
      availableCents: 100_000,
      provider: "pluggy",
      institutionName: "Banco Inter",
      institutionLogoUrl: null,
    },
  };
}

describe("TransactionList", () => {
  it("colore entradas em positive com sinal de mais", () => {
    const html = render(850_000);

    expect(html).toContain("+R$");
    expect(html).toContain("text-positive");
  });

  it("mantém despesas neutras, com sinal de menos e sem vermelho", () => {
    const html = render(-28_614);

    expect(html).toContain("-R$");
    expect(html).toContain("text-foreground");
    expect(html).not.toContain("text-negative");
  });

  it("mostra o logo do banco como avatar decorativo quando há conta", () => {
    const html = renderToStaticMarkup(
      <TransactionList transactions={[transactionWithAccount()]} categories={[]} showAccount />,
    );

    expect(html).toContain('data-slot="institution-avatar"');
    expect(html).toContain('src="https://cdn.pluggy.ai/assets/connector-icons/215.svg"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('aria-label="Instituição Banco Inter"');
    expect(html).toContain("Banco Inter");
  });

  it("não mostra avatar sem instituição resolvida", () => {
    const html = renderToStaticMarkup(
      <TransactionList transactions={[transaction(-1)]} categories={[]} showAccount />,
    );

    expect(html).not.toContain('data-slot="institution-avatar"');
  });
});
