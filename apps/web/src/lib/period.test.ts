import { describe, expect, it } from "vitest";

import {
  currentMonthInAppTimeZone,
  addDaysIso,
  daysBetweenIso,
  periodSearchSchema,
  periodSelectionFromSearch,
  previousPeriod,
  resolvePeriod,
  type PeriodSelection,
} from "./period";

const NOW = new Date("2026-11-10T12:00:00.000Z");

describe("resolvePeriod", () => {
  it("resolve janelas móveis incluindo hoje", () => {
    expect(resolvePeriod({ period: "7d" }, NOW)).toMatchObject({
      from: "2026-11-04",
      to: "2026-11-10",
    });
    expect(resolvePeriod({ period: "30d" }, NOW)).toMatchObject({
      from: "2026-10-12",
      to: "2026-11-10",
    });
    expect(resolvePeriod({ period: "90d" }, NOW)).toMatchObject({
      from: "2026-08-13",
      to: "2026-11-10",
    });
  });

  it("resolve 12 meses desde o primeiro dia do mês inicial", () => {
    expect(resolvePeriod({ period: "12m" }, NOW)).toMatchObject({
      from: "2025-12-01",
      to: "2026-11-10",
    });
  });

  it("usa o dia corrente no fuso de São Paulo, não em UTC", () => {
    // 2026-11-11T02:30Z = 2026-11-10 23:30 em America/Sao_Paulo.
    expect(resolvePeriod({ period: "7d" }, new Date("2026-11-11T02:30:00.000Z"))).toMatchObject({
      from: "2026-11-04",
      to: "2026-11-10",
    });
  });

  it("resolve o ano corrente (YTD)", () => {
    expect(resolvePeriod({ period: "ytd" }, NOW)).toMatchObject({
      from: "2026-01-01",
      to: "2026-11-10",
      label: "Este ano",
    });
  });

  it("resolve 'Este mês' do dia 1º até hoje", () => {
    expect(resolvePeriod({ period: "mtd" }, NOW)).toEqual({
      period: "mtd",
      from: "2026-11-01",
      to: "2026-11-10",
      label: "Este mês",
    });
    expect(resolvePeriod({ period: "mtd" }, new Date("2026-11-01T15:00:00.000Z"))).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-01",
    });
  });

  it("resolve 'Mês passado' como o mês anterior completo", () => {
    expect(resolvePeriod({ period: "last-month" }, NOW)).toEqual({
      period: "last-month",
      from: "2026-10-01",
      to: "2026-10-31",
      label: "Mês passado",
    });
  });

  it("atravessa a virada do ano em 'Mês passado'", () => {
    expect(
      resolvePeriod({ period: "last-month" }, new Date("2026-01-15T12:00:00.000Z")),
    ).toMatchObject({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(
      resolvePeriod({ period: "last-month" }, new Date("2026-03-31T12:00:00.000Z")),
    ).toMatchObject({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  it("mantém intervalo personalizado e normaliza a ordem", () => {
    expect(resolvePeriod({ period: "custom", from: "2026-03-01", to: "2026-02-01" }, NOW)).toEqual({
      period: "custom",
      from: "2026-02-01",
      to: "2026-03-01",
      label: "Personalizado",
    });
  });

  it("cai no padrão de 30 dias quando custom não tem datas", () => {
    expect(resolvePeriod({ period: "custom" }, NOW)).toMatchObject({
      period: "30d",
      from: "2026-10-12",
      to: "2026-11-10",
    });
  });
});

describe("periodSearchSchema", () => {
  it("usa 30 dias como padrão, sem serializar na URL", () => {
    expect(periodSearchSchema.parse({})).toEqual({});
  });

  it("aceita período válido e ignora datas fora de custom", () => {
    expect(
      periodSearchSchema.parse({ period: "90d", from: "2026-01-01", to: "2026-02-01" }),
    ).toEqual({ period: "90d" });
  });

  it("aceita intervalo personalizado válido", () => {
    expect(
      periodSearchSchema.parse({ period: "custom", from: "2026-01-01", to: "2026-01-31" }),
    ).toEqual({ period: "custom", from: "2026-01-01", to: "2026-01-31" });
  });

  it("aceita os presets de calendário", () => {
    expect(periodSearchSchema.parse({ period: "mtd" })).toEqual({ period: "mtd" });
    expect(periodSearchSchema.parse({ period: "last-month" })).toEqual({ period: "last-month" });
    expect(periodSearchSchema.parse({ period: "ytd" })).toEqual({ period: "ytd" });
  });

  it("não quebra com período ou datas inválidas", () => {
    expect(periodSearchSchema.parse({ period: "ontem" })).toEqual({});
    expect(periodSearchSchema.parse({ period: "custom", from: "01/01/2026" })).toEqual({});
    expect(
      periodSearchSchema.parse({ period: "custom", from: "2026-02-31", to: "2026-03-01" }),
    ).toEqual({});
  });

  it("normaliza a search opcional para o contrato do PeriodFilter", () => {
    const selection: PeriodSelection = periodSelectionFromSearch(
      periodSearchSchema.parse({ period: "12m" }),
    );
    expect(selection.period).toBe("12m");
    expect(periodSelectionFromSearch({}).period).toBe("30d");
  });
});

describe("aritmética de datas civis", () => {
  it("soma dias sem depender do fuso local", () => {
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysIso("2026-11-10", 30)).toBe("2026-12-10");
  });

  it("calcula a distância em dias", () => {
    expect(daysBetweenIso("2026-10-12", "2026-11-10")).toBe(29);
    expect(daysBetweenIso("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("resolve o período anterior de mesmo tamanho", () => {
    expect(previousPeriod({ from: "2026-10-12", to: "2026-11-10" })).toEqual({
      from: "2026-09-12",
      to: "2026-10-11",
    });
    expect(previousPeriod({ from: "2026-01-01", to: "2026-01-01" })).toEqual({
      from: "2025-12-31",
      to: "2025-12-31",
    });
  });
});

describe("currentMonthInAppTimeZone", () => {
  it("usa o mês de São Paulo, não o UTC", () => {
    // 2026-12-01T02:30Z = 30/11 23:30 em São Paulo.
    expect(currentMonthInAppTimeZone(new Date("2026-12-01T02:30:00Z"))).toBe("2026-11");
    expect(currentMonthInAppTimeZone(new Date("2026-12-01T03:30:00Z"))).toBe("2026-12");
  });
});
