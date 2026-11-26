import { describe, expect, it } from "vitest";

import { MOBILE_TABS, activeMobileTab } from "./nav";

describe("activeMobileTab", () => {
  it.each([
    ["/", "overview"],
    ["/transactions", "transactions"],
    ["/accounts", "accounts"],
    ["/accounts/acc_1", "accounts"],
    ["/credit-cards", "credit-cards"],
    ["/more", "more"],
    ["/analytics", "more"],
    ["/connections", "more"],
    ["/settings", "more"],
  ])("%s ativa %s", (pathname, expected) => {
    expect(activeMobileTab(pathname)).toBe(expected);
  });

  it("não reconhece caminhos desconhecidos nem prefixos parciais", () => {
    expect(activeMobileTab("/nada")).toBeNull();
    expect(activeMobileTab("/accountsx")).toBeNull();
  });

  it("tem exatamente 5 abas, com Mais por último", () => {
    expect(MOBILE_TABS.map((tab) => tab.id)).toEqual([
      "overview",
      "transactions",
      "accounts",
      "credit-cards",
      "more",
    ]);
  });
});
