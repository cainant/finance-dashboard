/**
 * Regras de data/valor da fatura aberta derivada. Datas literais e relógio
 * fixo: a derivação é o contrato com a UI e não pode depender do dia em que o
 * CI roda.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  billStatusOnDate,
  derivedClosingDate,
  derivedOpenBillId,
  derivedOpenBillRow,
  derivedOpenBillTotalCents,
  nextDueDate,
  type OpenBillCard,
} from "./bills";

function card(overrides: Partial<OpenBillCard> = {}): OpenBillCard {
  return {
    accountId: "acc-card",
    accountName: "GOLD",
    brand: "MASTERCARD",
    balanceCents: 123_456,
    closingDay: null,
    dueDay: 7,
    lastBillDueDate: "2026-11-07",
    lastClosingDate: "2026-10-30",
    cycleNetCents: 61_234,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("nextDueDate", () => {
  it("usa o primeiro due_day estritamente depois da última fatura, paga inclusive", () => {
    // A fatura de 07/11 está paga; entre 31/10 e 07/11 a próxima é 07/12.
    expect(nextDueDate(7, "2026-11-07", "2026-10-31")).toBe("2026-12-07");
    expect(nextDueDate(7, "2026-11-07", "2026-11-07")).toBe("2026-12-07");
    expect(nextDueDate(7, "2026-11-07", "2026-11-11")).toBe("2026-12-07");
  });

  it("sem fatura conhecida, inclui hoje quando hoje é o dia do vencimento", () => {
    expect(nextDueDate(7, null, "2026-11-07")).toBe("2026-11-07");
    expect(nextDueDate(7, null, "2026-11-08")).toBe("2026-12-07");
  });

  it("nunca devolve vencimento no passado", () => {
    // Última fatura de 22/03 (não paga): a corrente é a próxima, não 07/04.
    expect(nextDueDate(7, "2026-03-22", "2026-11-11")).toBe("2026-12-07");
    expect(nextDueDate(7, "2026-11-07", "2027-03-01")).toBe("2027-03-07");
  });

  it("vira o ano e limita o dia ao fim do mês", () => {
    expect(nextDueDate(7, "2026-12-07", "2026-12-20")).toBe("2027-01-07");
    expect(nextDueDate(31, null, "2026-02-10")).toBe("2026-02-28");
    expect(nextDueDate(31, null, "2028-02-10")).toBe("2028-02-29");
    expect(nextDueDate(29, null, "2027-02-10")).toBe("2027-02-28");
    expect(nextDueDate(30, null, "2026-02-10")).toBe("2026-02-28");
    expect(nextDueDate(31, null, "2026-04-10")).toBe("2026-04-30");
  });

  it("devolve null sem due_day válido", () => {
    expect(nextDueDate(null, "2026-11-07", "2026-11-11")).toBeNull();
    expect(nextDueDate(0, null, "2026-11-11")).toBeNull();
    expect(nextDueDate(32, null, "2026-11-11")).toBeNull();
  });
});

describe("derivedClosingDate", () => {
  it("usa o primeiro closing_day depois do último fechamento", () => {
    expect(derivedClosingDate(15, "2026-10-15", "2026-11-22")).toBe("2026-11-15");
    expect(derivedClosingDate(30, "2026-10-30", "2026-12-07")).toBe("2026-11-30");
    expect(derivedClosingDate(31, "2026-12-31", "2027-02-07")).toBe("2027-01-31");
  });

  it("sem closing_day no cartão, o fechamento é um mês depois do último", () => {
    expect(derivedClosingDate(null, "2026-10-30", "2026-12-07")).toBe("2026-11-30");
    expect(derivedClosingDate(null, "2026-01-31", "2026-03-07")).toBe("2026-02-28");
  });

  it("sem histórico, usa o último closing_day antes do vencimento", () => {
    expect(derivedClosingDate(20, null, "2026-11-22")).toBe("2026-11-20");
    expect(derivedClosingDate(28, null, "2026-12-05")).toBe("2026-11-28");
    expect(derivedClosingDate(null, null, "2026-12-05")).toBeNull();
  });

  it("nunca devolve fechamento depois do vencimento", () => {
    expect(derivedClosingDate(25, "2026-10-25", "2026-11-22")).toBeNull();
  });
});

describe("derivedOpenBillTotalCents", () => {
  it("com histórico de faturas usa as compras líquidas do ciclo", () => {
    expect(
      derivedOpenBillTotalCents(card({ balanceCents: 1_000_000, cycleNetCents: 61_234 })),
    ).toBe(61_234);
  });

  it("o saldo devedor é teto: ciclo já pago não gera fatura maior que a dívida", () => {
    expect(derivedOpenBillTotalCents(card({ balanceCents: 1_234, cycleNetCents: 512_300 }))).toBe(
      1_234,
    );
    expect(derivedOpenBillTotalCents(card({ balanceCents: 0, cycleNetCents: 512_300 }))).toBe(0);
  });

  it("sem histórico de faturas cai no saldo devedor do cartão", () => {
    expect(
      derivedOpenBillTotalCents(
        card({
          lastBillDueDate: null,
          lastClosingDate: null,
          balanceCents: 7_123,
          cycleNetCents: 0,
        }),
      ),
    ).toBe(7_123);
  });

  it("fatura sem closing_date não deriva (contaria em dobro)", () => {
    expect(
      derivedOpenBillTotalCents(
        card({ lastClosingDate: null, balanceCents: 50_000, cycleNetCents: 30_000 }),
      ),
    ).toBe(0);
    expect(derivedOpenBillRow(card({ lastClosingDate: null }), "2026-11-11")).toBeNull();
  });
});

describe("derivedOpenBillRow", () => {
  it("monta a fatura corrente do GOLD de produção", () => {
    expect(derivedOpenBillRow(card(), "2026-11-11")).toEqual({
      id: "open-invoice:acc-card:2026-12-07",
      accountId: "acc-card",
      externalId: "open-invoice-2026-12-07",
      dueDate: "2026-12-07",
      closingDate: "2026-11-30",
      totalCents: 61_234,
      minimumPaymentCents: null,
      status: "open",
    });
  });

  it("é estável dentro do mesmo ciclo", () => {
    const first = derivedOpenBillRow(card(), "2026-11-11");
    const second = derivedOpenBillRow(card(), "2026-11-12");

    expect(first?.id).toBe(second?.id);
    expect(derivedOpenBillId("acc-card", "2026-12-07")).toBe(first?.id);
  });

  it("vira 'closed' quando o fechamento já passou", () => {
    const row = derivedOpenBillRow(card(), "2026-12-01");

    expect(row?.closingDate).toBe("2026-11-30");
    expect(billStatusOnDate(row!, "2026-12-01")).toBe("closed");
    expect(billStatusOnDate(row!, "2026-11-29")).toBe("open");
  });

  it("não deriva sem valor em aberto", () => {
    expect(derivedOpenBillRow(card({ cycleNetCents: 0 }), "2026-11-11")).toBeNull();
    expect(
      derivedOpenBillRow(
        card({ lastClosingDate: null, balanceCents: 0, cycleNetCents: 0 }),
        "2026-11-11",
      ),
    ).toBeNull();
  });

  it("sem histórico de faturas usa o saldo do cartão", () => {
    const row = derivedOpenBillRow(
      card({ lastBillDueDate: null, lastClosingDate: null, balanceCents: 7_000, dueDay: 15 }),
      "2026-11-11",
    );

    expect(row).toMatchObject({
      dueDate: "2026-11-15",
      closingDate: null,
      totalCents: 7_000,
      status: "open",
    });
  });

  it("usa o relógio do sistema (UTC) quando 'today' não é passado", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-11T23:30:00.000Z"));

    expect(derivedOpenBillRow(card())?.dueDate).toBe("2026-12-07");
  });

  it("não deriva cartão sem due_day", () => {
    expect(derivedOpenBillRow(card({ dueDay: null }), "2026-11-11")).toBeNull();
  });
});
