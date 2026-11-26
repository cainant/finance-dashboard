import { describe, expect, it } from "vitest";

import { installmentLabel } from "./transaction-detail-labels";

describe("installmentLabel", () => {
  it("mostra a parcela de compras parceladas", () => {
    expect(installmentLabel({ installmentNumber: 3, totalInstallments: 10 })).toBe("3 de 10");
  });

  it("omite à vista, 1x e sem informação", () => {
    expect(installmentLabel({ installmentNumber: null, totalInstallments: null })).toBeNull();
    expect(installmentLabel({ installmentNumber: 1, totalInstallments: 1 })).toBeNull();
    expect(installmentLabel({ installmentNumber: null, totalInstallments: 6 })).toBeNull();
  });
});
