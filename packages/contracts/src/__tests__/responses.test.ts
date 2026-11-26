import { describe, expect, it } from "vitest";

import {
  apiErrorSchema,
  authProvidersResponse,
  cashflowResponse,
  categoryBreakdownResponse,
  monthlyResponse,
  netWorthResponse,
  overviewResponse,
  providersResponse,
  transactionsResponse,
  uncategorizedCountResponse,
  upcomingBillSchema,
  upcomingBillsResponse,
} from "../index";

const kpi = {
  currentCents: 100_000,
  previousCents: 80_000,
  deltaCents: 20_000,
  deltaPercent: 25,
};

const overview = {
  period: { from: "2026-10-12", to: "2026-11-10" },
  previousPeriod: { from: "2026-09-12", to: "2026-10-11" },
  currency: "BRL",
  kpis: { balance: kpi, income: kpi, expenses: kpi, result: kpi, netWorth: kpi },
};

describe("overviewResponse", () => {
  it("faz parse dos KPIs com deltas", () => {
    expect(overviewResponse.parse(overview)).toEqual(overview);
  });

  it("aceita deltaPercent nulo (período anterior zerado)", () => {
    const parsed = overviewResponse.parse({
      ...overview,
      kpis: { ...overview.kpis, income: { ...kpi, previousCents: 0, deltaPercent: null } },
    });

    expect(parsed.kpis.income.deltaPercent).toBeNull();
  });

  it("rejeita KPI faltando e dinheiro fracionado", () => {
    expect(
      overviewResponse.safeParse({
        ...overview,
        kpis: { ...overview.kpis, netWorth: undefined },
      }).success,
    ).toBe(false);
    expect(
      overviewResponse.safeParse({
        ...overview,
        kpis: { ...overview.kpis, balance: { ...kpi, currentCents: 10.5 } },
      }).success,
    ).toBe(false);
  });
});

describe("cashflowResponse", () => {
  it("faz parse de pontos de fluxo de caixa", () => {
    const payload = {
      data: [
        { date: "2026-11-01", incomeCents: 500_000, expenseCents: 120_000, netCents: 380_000 },
      ],
      period: { from: "2026-11-01", to: "2026-11-30" },
      granularity: "day",
    };

    expect(cashflowResponse.parse(payload)).toEqual(payload);
  });

  it("rejeita granularidade desconhecida", () => {
    const payload = {
      data: [],
      period: { from: "2026-11-01", to: "2026-11-30" },
      granularity: "year",
    };

    expect(cashflowResponse.safeParse(payload).success).toBe(false);
  });
});

describe("categoryBreakdownResponse", () => {
  const payload = {
    data: [
      {
        categoryId: "cat_mercado",
        name: "Mercado",
        slug: "mercado",
        icon: "ShoppingCart",
        color: "#22c55e",
        amountCents: 120_000,
        percentage: 42.5,
        transactionCount: 12,
      },
    ],
    period: { from: "2026-11-01", to: "2026-11-30" },
    type: "expense",
    totalCents: 282_352,
  };

  it("faz parse do ranking", () => {
    expect(categoryBreakdownResponse.parse(payload)).toEqual(payload);
  });

  it("rejeita percentual fora de 0-100", () => {
    const invalid = {
      ...payload,
      data: [{ ...payload.data[0], percentage: 120 }],
    };

    expect(categoryBreakdownResponse.safeParse(invalid).success).toBe(false);
  });
});

describe("netWorthResponse", () => {
  it("faz parse de pontos patrimoniais", () => {
    const payload = {
      data: [
        {
          date: "2026-11-10",
          assetsCents: 5_000_000,
          liabilitiesCents: 1_000_000,
          netWorthCents: 4_000_000,
        },
      ],
      period: { from: "2026-10-12", to: "2026-11-10" },
    };

    expect(netWorthResponse.parse(payload)).toEqual(payload);
  });
});

describe("monthlyResponse", () => {
  it("aceita mês YYYY-MM", () => {
    const payload = {
      data: [{ month: "2026-11", incomeCents: 900_000, expenseCents: 500_000, netCents: 400_000 }],
    };

    expect(monthlyResponse.parse(payload)).toEqual(payload);
  });

  it("rejeita mês fora do formato/intervalo", () => {
    expect(
      monthlyResponse.safeParse({
        data: [{ month: "2026-13", incomeCents: 0, expenseCents: 0, netCents: 0 }],
      }).success,
    ).toBe(false);
  });
});

describe("envelopes", () => {
  it("transactionsResponse é paginado por cursor", () => {
    const payload = { data: [], page: { cursor: null, nextCursor: "next_1", total: 0 } };

    expect(transactionsResponse.parse(payload)).toEqual(payload);
    expect(transactionsResponse.safeParse({ data: [] }).success).toBe(false);
  });

  it("uncategorizedCountResponse exige contagem inteira não negativa", () => {
    expect(uncategorizedCountResponse.parse({ count: 12 })).toEqual({ count: 12 });
    expect(uncategorizedCountResponse.safeParse({ count: 0 }).success).toBe(true);
    expect(uncategorizedCountResponse.safeParse({ count: -1 }).success).toBe(false);
    expect(uncategorizedCountResponse.safeParse({ count: 1.5 }).success).toBe(false);
    expect(uncategorizedCountResponse.safeParse({}).success).toBe(false);
  });

  it("apiErrorSchema segue { error: { code, message, details? } }", () => {
    expect(
      apiErrorSchema.parse({ error: { code: "unauthorized", message: "Sessão expirada" } }),
    ).toEqual({ error: { code: "unauthorized", message: "Sessão expirada" } });
    expect(apiErrorSchema.safeParse({ error: { code: "x" } }).success).toBe(false);
  });
});

describe("respostas de providers e auth", () => {
  it("providersResponse informa configuração", () => {
    const payload = {
      data: [
        {
          id: "demo",
          name: "Demonstração",
          configured: true,
          description: null,
          supportsConnectWidget: false,
        },
        {
          id: "pluggy",
          name: "Pluggy",
          configured: false,
          description: "Open Finance",
          supportsConnectWidget: true,
        },
      ],
    };

    expect(providersResponse.parse(payload)).toEqual(payload);
  });

  it("authProvidersResponse informa métodos habilitados", () => {
    const payload = {
      password: { enabled: true },
      github: { enabled: false, loginUrl: "/api/auth/github" },
      setupRequired: false,
    };

    expect(authProvidersResponse.parse(payload)).toEqual(payload);
  });

  it("upcomingBillsResponse estende a fatura com dados de exibição", () => {
    const payload = {
      data: [
        {
          id: "bill_1",
          accountId: "acc_card",
          externalId: "ext_bill_1",
          dueDate: "2026-11-15",
          closingDate: "2026-11-07",
          totalCents: 100_076,
          minimumPaymentCents: 30_000,
          status: "open",
          accountName: "Cartão Aurora Black",
          creditCardBrand: "MASTERCARD",
          daysUntilDue: 5,
          estimated: false,
        },
      ],
    };

    expect(upcomingBillsResponse.parse(payload)).toEqual(payload);
  });

  it("upcomingBill marca a fatura derivada como estimada", () => {
    const parsed = upcomingBillSchema.parse({
      id: "open-invoice:acc_card:2026-12-07",
      accountId: "acc_card",
      externalId: "open-invoice-2026-12-07",
      dueDate: "2026-12-07",
      closingDate: null,
      totalCents: 55_675,
      minimumPaymentCents: null,
      status: "open",
      accountName: "GOLD",
      creditCardBrand: "MASTERCARD",
      daysUntilDue: 26,
      estimated: true,
    });

    expect(parsed.estimated).toBe(true);
  });
});
