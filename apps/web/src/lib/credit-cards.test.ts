import type { Bill, CreditCard, UpcomingBill } from "@fd/contracts";
import { describe, expect, it } from "vitest";

import {
  creditCardProductLabel,
  creditCardTotals,
  isDueSoon,
  limitUsage,
  nextBillForCard,
  nextDueBill,
  selectInitialBillId,
  sortBillsByDueDate,
  usageRatio,
} from "./credit-cards";

function card(overrides: Partial<CreditCard> & Pick<CreditCard, "accountId">): CreditCard {
  return {
    brand: "Visa",
    level: "Platinum",
    limitCents: 1_000_000,
    availableLimitCents: 600_000,
    closingDay: 25,
    dueDay: 5,
    account: {
      id: overrides.accountId,
      name: `Cartão ${overrides.accountId}`,
      numberMasked: "•••• 1234",
      currency: "BRL",
      balanceCents: 400_000,
      availableCents: 600_000,
      provider: "demo",
      institutionName: "Banco Aurora",
      institutionLogoUrl: null,
    },
    ...overrides,
  };
}

function bill(overrides: Partial<Bill> & Pick<Bill, "id" | "dueDate">): Bill {
  return {
    accountId: "card-1",
    externalId: `ext-${overrides.id}`,
    closingDate: null,
    totalCents: 120_000,
    minimumPaymentCents: null,
    status: "closed",
    ...overrides,
  };
}

function upcomingBill(
  overrides: Partial<UpcomingBill> & Pick<UpcomingBill, "id" | "dueDate" | "daysUntilDue">,
): UpcomingBill {
  return {
    ...bill({ id: overrides.id, dueDate: overrides.dueDate }),
    accountName: "Cartão Aurora",
    creditCardBrand: "Visa",
    estimated: false,
    ...overrides,
  };
}

describe("creditCardTotals", () => {
  it("soma limites, disponíveis e faturas abertas", () => {
    const totals = creditCardTotals([
      card({ accountId: "a" }),
      card({
        accountId: "b",
        limitCents: 500_000,
        availableLimitCents: 500_000,
        account: {
          ...card({ accountId: "b" }).account,
          balanceCents: 0,
        },
      }),
    ]);

    expect(totals).toEqual({
      limitCents: 1_500_000,
      availableCents: 1_100_000,
      usedCents: 400_000,
      cards: 2,
      cardsWithLimit: 2,
    });
  });

  it("ignora limites ausentes e devolve null quando nenhum cartão informa limite", () => {
    const totals = creditCardTotals([
      card({ accountId: "a", limitCents: null, availableLimitCents: null }),
    ]);

    expect(totals.limitCents).toBeNull();
    expect(totals.availableCents).toBeNull();
    expect(totals.usedCents).toBe(400_000);
    expect(totals.cardsWithLimit).toBe(0);
  });

  it("zera os totais sem cartões", () => {
    expect(creditCardTotals([])).toEqual({
      limitCents: null,
      availableCents: null,
      usedCents: 0,
      cards: 0,
      cardsWithLimit: 0,
    });
  });
});

describe("usageRatio", () => {
  it("calcula a razão de uso e limita a 1", () => {
    expect(usageRatio(250_000, 1_000_000)).toBeCloseTo(0.25);
    expect(usageRatio(1_500_000, 1_000_000)).toBe(1);
  });

  it("trata limite ausente/zero e uso negativo", () => {
    expect(usageRatio(100_000, null)).toBeNull();
    expect(usageRatio(100_000, 0)).toBeNull();
    expect(usageRatio(-50_000, 1_000_000)).toBe(0);
  });
});

describe("limitUsage", () => {
  it("usa limite − disponível quando o cartão informa o disponível", () => {
    // Caso típico: a fatura aberta é R$ 12,34, mas as parcelas futuras
    // já comprometem R$ 16.000,00 do limite.
    const usage = limitUsage(
      card({
        accountId: "platinum",
        limitCents: 2_000_000,
        availableLimitCents: 400_000,
        account: {
          ...card({ accountId: "platinum" }).account,
          balanceCents: 1_234,
        },
      }),
    );

    expect(usage?.basis).toBe("available");
    expect(usage?.committedCents).toBe(1_600_000);
    expect(usage?.ratio).toBeCloseTo(0.8, 3);
  });

  it("cai para fatura/limite quando o disponível não é informado", () => {
    const usage = limitUsage(
      card({
        accountId: "sem-disponivel",
        limitCents: 1_000_000,
        availableLimitCents: null,
        account: {
          ...card({ accountId: "sem-disponivel" }).account,
          balanceCents: 400_000,
        },
      }),
    );

    expect(usage).toEqual({ ratio: 0.4, committedCents: 400_000, basis: "invoice" });
  });

  it("devolve null quando o cartão não informa limite válido", () => {
    expect(limitUsage(card({ accountId: "sem-limite", limitCents: null }))).toBeNull();
    expect(limitUsage(card({ accountId: "limite-zero", limitCents: 0 }))).toBeNull();
  });

  it("não mostra uso negativo quando o disponível passa do limite", () => {
    expect(
      limitUsage(
        card({ accountId: "folga", limitCents: 1_000_000, availableLimitCents: 1_200_000 }),
      ),
    ).toMatchObject({ ratio: 0, committedCents: 0 });
  });

  it("marca tudo usado quando o disponível é zero", () => {
    expect(
      limitUsage(card({ accountId: "tudo-usado", limitCents: 1_000_000, availableLimitCents: 0 })),
    ).toEqual({ ratio: 1, committedCents: 1_000_000, basis: "available" });
  });

  it("limita a barra a 1 quando o disponível é negativo", () => {
    // Limite estourado (juros/encargos): o clamp de 0–1 segura a barra.
    expect(
      limitUsage(
        card({ accountId: "estourado", limitCents: 1_000_000, availableLimitCents: -50_000 }),
      ),
    ).toEqual({ ratio: 1, committedCents: 1_050_000, basis: "available" });
  });
});

describe("creditCardProductLabel", () => {
  it("monta marca e nível", () => {
    expect(creditCardProductLabel({ brand: "Visa", level: "Platinum" })).toBe("Visa · Platinum");
  });

  it("cai no fallback quando o provider omite os campos", () => {
    expect(creditCardProductLabel({ brand: null, level: null })).toBe("Cartão de crédito");
    expect(creditCardProductLabel({ brand: "Elo", level: null })).toBe("Elo");
  });
});

describe("faturas", () => {
  it("ordena por vencimento decrescente sem mutar a lista", () => {
    const bills = [
      bill({ id: "old", dueDate: "2026-08-05" }),
      bill({ id: "new", dueDate: "2026-10-05" }),
      bill({ id: "mid", dueDate: "2026-09-05" }),
    ];

    expect(sortBillsByDueDate(bills).map((item) => item.id)).toEqual(["new", "mid", "old"]);
    expect(bills.map((item) => item.id)).toEqual(["old", "new", "mid"]);
  });

  it("seleciona a fatura aberta como inicial", () => {
    const bills = [
      bill({ id: "latest", dueDate: "2026-10-05", status: "closed" }),
      bill({ id: "open", dueDate: "2026-09-05", status: "open" }),
      bill({ id: "paid", dueDate: "2026-08-05", status: "paid" }),
    ];

    expect(selectInitialBillId(bills)).toBe("open");
  });

  it("usa a fatura mais recente quando nenhuma está aberta", () => {
    const bills = [
      bill({ id: "older", dueDate: "2026-08-05", status: "paid" }),
      bill({ id: "newer", dueDate: "2026-10-05", status: "closed" }),
    ];

    expect(selectInitialBillId(bills)).toBe("newer");
    expect(selectInitialBillId([])).toBeNull();
  });

  it("escolhe a próxima fatura a vencer", () => {
    const bills = [
      upcomingBill({ id: "later", dueDate: "2026-12-05", daysUntilDue: 25 }),
      upcomingBill({ id: "next", dueDate: "2026-11-15", daysUntilDue: 5 }),
    ];

    expect(nextDueBill(bills)?.id).toBe("next");
  });

  it("sem faturas futuras, aponta a mais atrasada", () => {
    const bills = [
      upcomingBill({ id: "yesterday", dueDate: "2026-11-09", daysUntilDue: -1 }),
      upcomingBill({ id: "last-month", dueDate: "2026-10-05", daysUntilDue: -36 }),
    ];

    expect(nextDueBill(bills)?.id).toBe("last-month");
    expect(nextDueBill([])).toBeNull();
  });
});

describe("isDueSoon", () => {
  it("destaca vencimentos em até 7 dias e faturas já vencidas", () => {
    expect(isDueSoon(7)).toBe(true);
    expect(isDueSoon(0)).toBe(true);
    expect(isDueSoon(-3)).toBe(true);
    expect(isDueSoon(8)).toBe(false);
  });
});

describe("nextBillForCard", () => {
  const bill = (id: string, accountId: string, dueDate: string, daysUntilDue: number) =>
    ({ id, accountId, dueDate, daysUntilDue }) as UpcomingBill;

  it("escolhe a próxima fatura só do cartão pedido", () => {
    const bills = [
      bill("a", "card-1", "2026-12-20", 30),
      bill("b", "card-2", "2026-12-05", 15),
      bill("c", "card-1", "2026-12-10", 20),
    ];

    expect(nextBillForCard(bills, "card-1")?.id).toBe("c");
    expect(nextBillForCard(bills, "card-2")?.id).toBe("b");
  });

  it("devolve null quando o cartão não tem fatura na janela", () => {
    expect(nextBillForCard([bill("a", "card-1", "2026-12-20", 30)], "card-9")).toBeNull();
    expect(nextBillForCard([], "card-1")).toBeNull();
  });
});
