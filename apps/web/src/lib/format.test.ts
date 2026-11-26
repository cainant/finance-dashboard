import { describe, expect, it } from "vitest";

import {
  formatAxisAmountFromCents,
  formatCompactAmountFromCents,
  formatCompactCurrencyFromCents,
  formatCompactMoneyFromCents,
  formatCurrencyFromCents,
  formatDate,
  formatDateTime,
  formatDayLabel,
  formatDayMonth,
  formatMonthLong,
  formatMonthShort,
  formatNumber,
  formatPercent,
  formatPercentPoints,
} from "./format";

/** Intl usa espaço não separável depois de "R$"; normalizamos para comparar. */
function plain(value: string): string {
  return value.replace(/\u00a0/g, " ");
}

describe("formatCurrencyFromCents", () => {
  it("formata valores positivos em BRL", () => {
    expect(plain(formatCurrencyFromCents(123456))).toBe("R$ 1.234,56");
    expect(plain(formatCurrencyFromCents(0))).toBe("R$ 0,00");
  });

  it("formata valores negativos com sinal", () => {
    expect(plain(formatCurrencyFromCents(-98765))).toBe("-R$ 987,65");
  });

  it("força o sinal quando pedido", () => {
    expect(plain(formatCurrencyFromCents(5000, { signDisplay: "always" }))).toBe("+R$ 50,00");
    expect(plain(formatCurrencyFromCents(-5000, { signDisplay: "always" }))).toBe("-R$ 50,00");
  });

  it("aceita outra moeda", () => {
    expect(plain(formatCurrencyFromCents(1000, { currency: "USD" }))).toBe("US$ 10,00");
  });

  it("devolve travessão para valores inválidos", () => {
    expect(formatCurrencyFromCents(Number.NaN)).toBe("—");
    expect(formatCurrencyFromCents(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("formata de forma compacta para eixos", () => {
    expect(plain(formatCompactCurrencyFromCents(123456789))).toBe("R$ 1,2 mi");
  });
});

describe("formatCompactAmountFromCents", () => {
  it("usa notação compacta sem R$ acima de R$ 10 mil", () => {
    expect(plain(formatCompactAmountFromCents(4_945_015))).toBe("49,4 mil");
    expect(plain(formatCompactAmountFromCents(2_711_335))).toBe("27,1 mil");
    expect(plain(formatCompactAmountFromCents(-1_113_335))).toBe("-11,1 mil");
  });

  it("mostra o inteiro com milhar abaixo do limite", () => {
    expect(formatCompactAmountFromCents(106_218)).toBe("1.062");
    expect(formatCompactAmountFromCents(-150_664)).toBe("-1.507");
    expect(formatCompactAmountFromCents(0)).toBe("0");
  });

  it("devolve travessão para valores inválidos", () => {
    expect(formatCompactAmountFromCents(Number.NaN)).toBe("—");
  });
});

describe("formatCompactMoneyFromCents", () => {
  it("prefixa a moeda nos valores de reais inteiros", () => {
    expect(plain(formatCompactMoneyFromCents(51_500))).toBe("R$ 515");
    expect(plain(formatCompactMoneyFromCents(58_320))).toBe("R$ 583");
    expect(plain(formatCompactMoneyFromCents(6_800))).toBe("R$ 68");
    expect(plain(formatCompactMoneyFromCents(0))).toBe("R$ 0");
  });

  it("mostra a dívida com sinal antes da moeda", () => {
    expect(plain(formatCompactMoneyFromCents(-123_456))).toBe("-R$ 1.234");
    expect(plain(formatCompactMoneyFromCents(-1_234))).toBe("-R$ 12,34");
  });

  it("mantém os centavos em valores pequenos", () => {
    expect(plain(formatCompactMoneyFromCents(9_949))).toBe("R$ 99,49");
    expect(plain(formatCompactMoneyFromCents(515))).toBe("R$ 5,15");
  });

  it("trunca os centavos em vez de arredondar", () => {
    expect(plain(formatCompactMoneyFromCents(58_399))).toBe("R$ 583");
    expect(plain(formatCompactMoneyFromCents(-123_499))).toBe("-R$ 1.234");
    // 9.999,50 não pode virar "R$ 10.000" nem compactar antes da hora.
    expect(plain(formatCompactMoneyFromCents(999_950))).toBe("R$ 9.999");
  });

  it("compacta acima de R$ 10 mil", () => {
    expect(plain(formatCompactMoneyFromCents(2_711_335))).toBe("R$ 27,1 mil");
    expect(plain(formatCompactMoneyFromCents(-4_945_015))).toBe("-R$ 49,4 mil");
  });

  it("devolve travessão para valores inválidos", () => {
    expect(formatCompactMoneyFromCents(Number.NaN)).toBe("—");
  });
});

describe("formatAxisAmountFromCents", () => {
  it("não inclui R$ e usa notação compacta", () => {
    expect(plain(formatAxisAmountFromCents(8_000_000))).toBe("80 mil");
    expect(plain(formatAxisAmountFromCents(250_000))).toBe("2,5 mil");
    expect(plain(formatAxisAmountFromCents(120_000_000))).toBe("1,2 mi");
    expect(formatAxisAmountFromCents(0)).toBe("0");
  });
});

describe("formatPercent", () => {
  it("converte razão em percentual pt-BR", () => {
    expect(formatPercent(0.124)).toBe("12,4%");
    expect(formatPercent(-0.032)).toBe("-3,2%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("respeita casas decimais e sinal", () => {
    expect(formatPercent(0.125, { maximumFractionDigits: 2 })).toBe("12,5%");
    expect(formatPercent(0.125, { signDisplay: "always" })).toBe("+12,5%");
  });

  it("devolve travessão para valores inválidos", () => {
    expect(formatPercent(Number.NaN)).toBe("—");
  });
});

describe("formatPercentPoints", () => {
  it("formata pontos percentuais da API sem multiplicar por 100", () => {
    expect(formatPercentPoints(2.9)).toBe("2,9%");
    expect(formatPercentPoints(12.2)).toBe("12,2%");
    expect(formatPercentPoints(80.9)).toBe("80,9%");
    expect(formatPercentPoints(-3.1)).toBe("-3,1%");
    expect(formatPercentPoints(0)).toBe("0%");
  });

  it("respeita casas decimais e sinal", () => {
    expect(formatPercentPoints(12.25, { maximumFractionDigits: 2 })).toBe("12,25%");
    expect(formatPercentPoints(12.25, { signDisplay: "always" })).toBe("+12,3%");
  });

  it("devolve travessão para valores inválidos", () => {
    expect(formatPercentPoints(Number.NaN)).toBe("—");
  });
});

describe("formatDate", () => {
  it("formata datas de calendário sem deslocar o dia", () => {
    expect(formatDate("2026-11-10")).toBe("10/11/2026");
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
  });

  it("formata por extenso e por mês/ano", () => {
    expect(formatDate("2026-11-10", "medium")).toBe("10 de nov. de 2026");
    expect(formatDate("2026-11-10", "monthYear")).toBe("novembro de 2026");
  });

  it("formata timestamps no fuso de São Paulo", () => {
    expect(formatDate("2026-11-10T15:30:00.000Z")).toBe("10/11/2026");
    expect(formatDate("2026-11-10T02:00:00.000Z")).toBe("09/11/2026");
  });

  it("devolve travessão para datas inválidas", () => {
    expect(formatDate("não é data")).toBe("—");
    expect(formatDate("")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("inclui hora no fuso brasileiro", () => {
    expect(formatDateTime("2026-11-10T15:30:00.000Z")).toBe("10/11/2026, 12:30");
  });
});

describe("formatDayMonth", () => {
  it("formata dia/mês curto sem deslocar a data de calendário", () => {
    expect(formatDayMonth("2026-10-18")).toBe("18/10");
    expect(formatDayMonth("2026-01-01")).toBe("01/01");
  });

  it("devolve travessão para datas inválidas", () => {
    expect(formatDayMonth("não é data")).toBe("—");
  });
});

describe("formatNumber", () => {
  it("usa separador brasileiro", () => {
    expect(formatNumber(1234.5)).toBe("1.234,5");
    expect(plain(formatNumber(1234567, { compact: true }))).toBe("1,23 mi");
  });
});

describe("formatMonthShort", () => {
  it("formata mês YYYY-MM sem ponto e sem deslocar o fuso", () => {
    expect(formatMonthShort("2026-11")).toBe("nov");
    expect(formatMonthShort("2026-01")).toBe("jan");
    expect(formatMonthShort("2026-12")).toBe("dez");
  });

  it("devolve a entrada quando não é um mês válido", () => {
    expect(formatMonthShort("2026-13-01")).toBe("2026-13-01");
    expect(formatMonthShort("")).toBe("");
  });
});

describe("formatMonthLong", () => {
  it("formata mês por extenso com ano", () => {
    expect(formatMonthLong("2026-11")).toBe("novembro de 2026");
  });
});

describe("formatDayLabel", () => {
  const now = new Date("2026-11-16T15:00:00Z");

  it("escreve o dia por extenso, com a inicial maiúscula e sem o ano corrente", () => {
    expect(formatDayLabel("2026-11-14", now)).toBe("Sábado, 14 de novembro");
  });

  it("inclui o ano quando difere do ano atual", () => {
    expect(formatDayLabel("2025-12-31", now)).toBe("Quarta-feira, 31 de dezembro de 2025");
  });

  it("não desloca o dia pelo fuso (data de calendário)", () => {
    expect(formatDayLabel("2026-01-01", now)).toBe("Quinta-feira, 1 de janeiro");
  });

  it("devolve travessão para data inválida", () => {
    expect(formatDayLabel("nope", now)).toBe("—");
  });
});
