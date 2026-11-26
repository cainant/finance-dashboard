import type { ProviderInfo } from "@fd/contracts";
import { describe, expect, it } from "vitest";

import {
  accountsEmptyDescription,
  connectionsEmptyDescription,
  connectionsIntro,
  connectionsPageDescription,
  creditCardsEmptyDescription,
  overviewConnectCopy,
  overviewPrimaryActionLabel,
  transactionsEmptyDescription,
} from "./demo-visibility";
import { isDemoProviderEnabled, isPluggyConfigured } from "./providers";

const DEMO_PATTERN = /demo|demonstra/i;

function demoProvider(configured = true): Pick<ProviderInfo, "id" | "configured"> {
  return { id: "demo", configured };
}

function pluggyProvider(configured = true): Pick<ProviderInfo, "id" | "configured"> {
  return { id: "pluggy", configured };
}

describe("visibilidade do provider demo", () => {
  it("só habilita a demonstração quando a API a lista como configurada", () => {
    expect(isDemoProviderEnabled([demoProvider(), pluggyProvider()])).toBe(true);
    expect(isDemoProviderEnabled([demoProvider(false), pluggyProvider()])).toBe(false);
    expect(isDemoProviderEnabled([pluggyProvider()])).toBe(false);
    expect(isDemoProviderEnabled(null)).toBe(false);
  });

  it("reconhece o Pluggy configurado", () => {
    expect(isPluggyConfigured([pluggyProvider()])).toBe(true);
    expect(isPluggyConfigured([pluggyProvider(false)])).toBe(false);
    expect(isPluggyConfigured(undefined)).toBe(false);
  });
});

describe("textos de UI — modo demonstração habilitado", () => {
  it("oferece o fluxo demo e ainda menciona o Pluggy", () => {
    expect(overviewConnectCopy(true).title.length).toBeGreaterThan(0);
    expect(overviewConnectCopy(true).description).toMatch(DEMO_PATTERN);
    expect(overviewPrimaryActionLabel(true)).toBe("Conectar demonstração");
    expect(connectionsPageDescription(true)).toMatch(DEMO_PATTERN);
    expect(connectionsIntro(true)).toMatch(DEMO_PATTERN);
    expect(connectionsEmptyDescription(true)).toMatch(DEMO_PATTERN);
    expect(accountsEmptyDescription(true)).toMatch(DEMO_PATTERN);
    expect(creditCardsEmptyDescription(true)).toMatch(DEMO_PATTERN);
    expect(transactionsEmptyDescription(true)).toMatch(DEMO_PATTERN);
  });
});

describe("textos de UI — produção sem demonstração", () => {
  it("não menciona demo em nenhum empty state e convida ao MeuPluggy", () => {
    const copies = [
      overviewConnectCopy(false).title,
      overviewConnectCopy(false).description,
      overviewPrimaryActionLabel(false),
      connectionsPageDescription(false),
      connectionsIntro(false),
      connectionsEmptyDescription(false),
      accountsEmptyDescription(false),
      creditCardsEmptyDescription(false),
      transactionsEmptyDescription(false),
    ];

    for (const copy of copies) {
      expect(copy).not.toMatch(DEMO_PATTERN);
    }
    expect(overviewConnectCopy(false).title).toBe("Conecte seu MeuPluggy");
    expect(overviewPrimaryActionLabel(false)).toBe("Conectar MeuPluggy");
    expect(connectionsIntro(false)).toContain("MeuPluggy");
  });
});
