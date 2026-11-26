import { describe, expect, it } from "vitest";

import { createMoneyFormatter, HIDDEN_COMPACT_TEXT, HIDDEN_MONEY_TEXT } from "./privacy-context";

function plain(value: string): string {
  return value.replace(/\u00a0/g, " ");
}

describe("createMoneyFormatter", () => {
  it("formata a sidebar com R$ e mantém a moeda no formato completo", () => {
    const money = createMoneyFormatter(false);

    expect(plain(money.formatCompactMoney(42_000))).toBe("R$ 420");
    expect(plain(money.formatCompactMoney(-123_456))).toBe("-R$ 1.234");
    expect(plain(money.formatCompact(1_234_567))).toBe("R$ 12,3 mil");
  });

  it("mascara valores compactos e deixa o eixo sem números", () => {
    const money = createMoneyFormatter(true);

    expect(money.formatCompactMoney(4_945_015)).toBe(HIDDEN_COMPACT_TEXT);
    expect(money.formatCurrency(4_945_015)).toBe(HIDDEN_MONEY_TEXT);
    expect(money.formatAxis(4_945_015)).toBe("");
  });
});
