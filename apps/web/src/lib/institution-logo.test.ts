import { KNOWN_ACCOUNT_BANK_NAMES } from "@fd/financial-providers";
import { describe, expect, it } from "vitest";

import fixture from "./fixtures/pluggy-bank-logos.json";
import {
  INSTITUTION_LOGO_ALIASES,
  PLUGGY_CONNECTOR_ICON_BASE,
  normalizeInstitutionName,
  resolveInstitutionLogo,
} from "./institution-logo";

/** URLs verificadas no catálogo real (`GET /connectors?countries=BR`). */
const CATALOG_URLS = new Set(fixture.connectors.map((connector) => connector.imageUrl));

/** Bancos que o mapper emite e que não têm conector/logo no catálogo do Pluggy. */
const BANKS_WITHOUT_LOGO = new Set(["Agibank", "Banco Original", "Banco Votorantim", "Will Bank"]);

describe("resolveInstitutionLogo", () => {
  it("resolve o banco mesmo com acento, caixa e pontuação diferentes", () => {
    expect(resolveInstitutionLogo("Itaú")).toBe(`${PLUGGY_CONNECTOR_ICON_BASE}/201.svg`);
    expect(resolveInstitutionLogo("itau")).toBe(`${PLUGGY_CONNECTOR_ICON_BASE}/201.svg`);
    expect(resolveInstitutionLogo("  NUBANK ")).toBe(`${PLUGGY_CONNECTOR_ICON_BASE}/212.svg`);
    expect(resolveInstitutionLogo("Caixa Econômica Federal")).toBe(
      `${PLUGGY_CONNECTOR_ICON_BASE}/219.svg`,
    );
  });

  it("aceita os aliases que o mapeamento de instituição produz", () => {
    expect(resolveInstitutionLogo("Banco Inter")).toBe(`${PLUGGY_CONNECTOR_ICON_BASE}/215.svg`);
    expect(resolveInstitutionLogo("Banco do Brasil")).toBe(`${PLUGGY_CONNECTOR_ICON_BASE}/211.svg`);
    expect(resolveInstitutionLogo("BTG Pactual")).toBe(`${PLUGGY_CONNECTOR_ICON_BASE}/214.svg`);
    expect(resolveInstitutionLogo("XP Investimentos")).toBe(
      `${PLUGGY_CONNECTOR_ICON_BASE}/202.svg`,
    );
    expect(resolveInstitutionLogo("Stone")).toBe(`${PLUGGY_CONNECTOR_ICON_BASE}/787.svg`);
  });

  it("não inventa logo para demo, MeuPluggy, conector sandbox ou banco sem catálogo", () => {
    expect(resolveInstitutionLogo("Banco Aurora")).toBeNull();
    expect(resolveInstitutionLogo("Demonstração")).toBeNull();
    expect(resolveInstitutionLogo("MeuPluggy")).toBeNull();
    expect(resolveInstitutionLogo("Pluggy Bank")).toBeNull();
    expect(resolveInstitutionLogo("Sandbox Open Finance")).toBeNull();
    expect(resolveInstitutionLogo("Agibank")).toBeNull();
    expect(resolveInstitutionLogo("")).toBeNull();
    expect(resolveInstitutionLogo(null)).toBeNull();
    expect(resolveInstitutionLogo(undefined)).toBeNull();
  });

  it("não casa por substring (nome de cartão não vira logo de banco)", () => {
    expect(resolveInstitutionLogo("Cartão Internacional")).toBeNull();
    expect(resolveInstitutionLogo("Conta Corrente Next")).toBeNull();
  });

  it("não usa atalhos ambíguos que o mapper não emite", () => {
    expect(resolveInstitutionLogo("Caixa")).toBeNull();
    expect(resolveInstitutionLogo("BB")).toBeNull();
    expect(resolveInstitutionLogo("XP")).toBeNull();
    expect(resolveInstitutionLogo("C6")).toBeNull();
  });

  it("só devolve URLs do catálogo verificado do Pluggy", () => {
    for (const alias of INSTITUTION_LOGO_ALIASES) {
      const url = resolveInstitutionLogo(alias);
      expect(url).not.toBeNull();
      expect(CATALOG_URLS.has(url!)).toBe(true);
    }
  });
});

describe("normalizeInstitutionName", () => {
  it("remove acento, caixa e pontuação e colapsa espaços", () => {
    expect(normalizeInstitutionName("  Itaú   Unibanco S.A. ")).toBe("itau unibanco sa");
    expect(normalizeInstitutionName("C6 Bank")).toBe("c6 bank");
  });
});

describe("bancos que o mapper emite", () => {
  it("cada nome do financial-providers tem logo ou está na lista explícita sem logo", () => {
    for (const bank of KNOWN_ACCOUNT_BANK_NAMES) {
      if (BANKS_WITHOUT_LOGO.has(bank)) {
        expect(resolveInstitutionLogo(bank), `${bank} não deveria ter logo`).toBeNull();
      } else {
        expect(resolveInstitutionLogo(bank), `${bank} sem logo`).not.toBeNull();
      }
    }
  });

  it("a lista sem logo não esconde banco que já resolve", () => {
    for (const bank of BANKS_WITHOUT_LOGO) {
      expect(KNOWN_ACCOUNT_BANK_NAMES).toContain(bank);
      expect(resolveInstitutionLogo(bank)).toBeNull();
    }
  });

  it("o mapper continua emitindo os bancos principais", () => {
    expect(KNOWN_ACCOUNT_BANK_NAMES).toEqual(
      expect.arrayContaining([
        "Banco do Brasil",
        "Itaú",
        "Nubank",
        "Bradesco",
        "Caixa Econômica Federal",
        "Banco Inter",
        "BTG Pactual",
        "C6 Bank",
        "XP Investimentos",
        "Stone",
        "Neon",
        "Next",
      ]),
    );
  });
});

describe("fixture do catálogo Pluggy", () => {
  it("cada conector da fixture resolve para o seu próprio imageUrl", () => {
    for (const connector of fixture.connectors) {
      expect(resolveInstitutionLogo(connector.name)).toBe(connector.imageUrl);
    }
  });

  it("não inclui o ícone sandbox do MeuPluggy/Pluggy Bank", () => {
    const sandbox = fixture.connectors.filter((connector) =>
      connector.imageUrl.includes("sandbox"),
    );

    expect(sandbox).toEqual([]);
  });
});
