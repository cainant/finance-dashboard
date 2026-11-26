import { describe, expect, it } from "vitest";

import {
  addDays,
  cashflowQuery,
  createCashflowQuery,
  createPeriodQuery,
  createTransactionsQuery,
  monthlyQuery,
  paginationQuery,
  periodQuery,
  syncRunsQuery,
  transactionsQuery,
  upcomingBillsQuery,
} from "../index";

const fixedNow = () => new Date("2026-11-10T12:00:00.000Z");

describe("periodQuery", () => {
  it("aplica default dos últimos 30 dias inclusivos", () => {
    const parsed = createPeriodQuery(fixedNow).parse({});

    expect(parsed).toEqual({ from: "2026-10-12", to: "2026-11-10" });
  });

  it("respeita from/to informados", () => {
    const parsed = createPeriodQuery(fixedNow).parse({ from: "2026-01-01", to: "2026-01-31" });

    expect(parsed).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("preenche from relativo ao to informado", () => {
    const parsed = createPeriodQuery(fixedNow).parse({ to: "2026-03-01" });

    expect(parsed).toEqual({ from: "2026-01-31", to: "2026-03-01" });
  });

  it("rejeita from posterior a to", () => {
    const result = periodQuery.safeParse({ from: "2026-02-01", to: "2026-01-01" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["from"]);
    }
  });

  it("rejeita data em formato inválido", () => {
    expect(periodQuery.safeParse({ from: "10/11/2026" }).success).toBe(false);
    expect(periodQuery.safeParse({ from: "2026-13-01" }).success).toBe(false);
  });
});

describe("transactionsQuery", () => {
  const schema = createTransactionsQuery(fixedNow);

  it("aplica defaults de período, limite e ordenação", () => {
    const parsed = schema.parse({});

    expect(parsed).toMatchObject({
      from: "2026-10-12",
      to: "2026-11-10",
      limit: 50,
      sort: "date_desc",
    });
  });

  it("converte limit de string e aceita filtros", () => {
    const parsed = schema.parse({
      limit: "25",
      accountId: "acc_1",
      type: "expense",
      q: "  mercado  ",
      sort: "amount_desc",
    });

    expect(parsed.limit).toBe(25);
    expect(parsed.q).toBe("mercado");
    expect(parsed.type).toBe("expense");
    expect(parsed.sort).toBe("amount_desc");
  });

  it("rejeita limit acima de 200", () => {
    expect(schema.safeParse({ limit: "201" }).success).toBe(false);
    expect(schema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it("rejeita tipo e ordenação desconhecidos", () => {
    expect(schema.safeParse({ type: "transferencia" }).success).toBe(false);
    expect(schema.safeParse({ sort: "recent" }).success).toBe(false);
  });

  it("descarta q vazio", () => {
    const parsed = transactionsQuery.parse({ q: "   " });

    expect(parsed.q).toBeUndefined();
  });

  it("interpreta uncategorized como booleano de query string", () => {
    expect(schema.parse({ uncategorized: "true" }).uncategorized).toBe(true);
    expect(schema.parse({ uncategorized: "false" }).uncategorized).toBe(false);
    expect(schema.parse({}).uncategorized).toBeUndefined();
    expect(schema.safeParse({ uncategorized: "talvez" }).success).toBe(false);
  });
});

describe("queries agregadas", () => {
  it("cashflow usa granularidade day por default", () => {
    const parsed = createCashflowQuery(fixedNow).parse({});

    expect(parsed.granularity).toBe("day");
    expect(parsed.from).toBe("2026-10-12");
    expect(cashflowQuery.safeParse({ granularity: "year" }).success).toBe(false);
  });

  it("monthly limita entre 1 e 36 meses", () => {
    expect(monthlyQuery.parse({})).toEqual({ months: 12 });
    expect(monthlyQuery.parse({ months: "24" })).toEqual({ months: 24 });
    expect(monthlyQuery.safeParse({ months: "37" }).success).toBe(false);
  });

  it("pagination limita a 200", () => {
    expect(paginationQuery.parse({})).toEqual({ limit: 50 });
    expect(paginationQuery.safeParse({ limit: "201" }).success).toBe(false);
  });

  it("upcoming bills e sync runs têm defaults", () => {
    expect(upcomingBillsQuery.parse({})).toEqual({ days: 30, limit: 5 });
    expect(syncRunsQuery.parse({})).toEqual({ limit: 20 });
  });
});

describe("addDays", () => {
  it("atravessa virada de mês e de ano em UTC", () => {
    expect(addDays("2026-11-10", -29)).toBe("2026-10-12");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });
});
