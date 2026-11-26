import type { Account, Connection } from "@fd/contracts";
import { describe, expect, it } from "vitest";

import { createMoneyFormatter, HIDDEN_MONEY_TEXT } from "@/components/privacy/privacy-context";

import { paletteAccountItem } from "./palette-account-item";

function connection(overrides: Partial<Connection> & Pick<Connection, "id">): Connection {
  return {
    provider: "pluggy",
    externalId: `ext-${overrides.id}`,
    institutionId: null,
    status: "active",
    statusDetail: null,
    lastSyncedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-10T12:00:00.000Z",
    ...overrides,
  };
}

function account(overrides: Partial<Account> & Pick<Account, "id">): Account {
  return {
    userId: "u1",
    connectionId: "c1",
    externalId: `ext-${overrides.id}`,
    type: "checking",
    subtype: null,
    name: `Conta ${overrides.id}`,
    numberMasked: null,
    currency: "BRL",
    balanceCents: 0,
    availableCents: null,
    updatedAt: "2026-11-10T12:00:00.000Z",
    ...overrides,
  };
}

// Item MeuPluggy: o conector é "MeuPluggy"; o banco real vem por conta.
// Dados fictícios: nenhum número, saldo ou apelido de conta real.
const meuPluggy = connection({
  id: "c1",
  institution: {
    id: "i1",
    provider: "pluggy",
    externalId: "200",
    name: "MeuPluggy",
    logoUrl: null,
    primaryColor: null,
    type: "PERSONAL_BANK",
  },
});

const money = createMoneyFormatter(false);

/** O Intl separa "R$" do número com espaço não separável. */
const brl = (value: string) => `R$\u00A0${value}`;

describe("paletteAccountItem", () => {
  it("prefixa a instituição e usa o número quando o nome repete o banco", () => {
    const item = paletteAccountItem(
      account({
        id: "banco-exemplo",
        name: "BANCO EXEMPLO",
        institutionName: "Banco Exemplo",
        numberMasked: "00012345-6",
        balanceCents: 123456,
      }),
      [meuPluggy],
      money,
    );

    expect(item.label).toBe("Banco Exemplo · 00012345-6");
    expect(item.amountLabel).toBe(brl("1.234,56"));
  });

  it("rotula a conta pelo banco, não só pelo nome cru do provedor", () => {
    const item = paletteAccountItem(
      account({
        id: "banco-digital",
        name: "Instituição de Pagamento Exemplo S.A.",
        institutionName: "Banco Digital",
        numberMasked: "00054321-0",
        balanceCents: 7890,
      }),
      [meuPluggy],
      money,
    );

    expect(item.label).toBe("Banco Digital · Instituição de Pagamento Exemplo S.A.");
    expect(item.amountLabel).toBe(brl("78,90"));
    expect(item.searchText).toContain("Banco Digital");
    expect(item.searchText).toContain("00054321-0");
  });

  it("inverte o sinal do cartão (dívida positiva no domínio) e usa o número", () => {
    const cards = [
      account({
        id: "gold",
        type: "credit_card",
        name: "GOLD",
        numberMasked: "1111",
        balanceCents: 250000,
      }),
      account({
        id: "platinum",
        type: "credit_card",
        name: "platinum",
        numberMasked: "2222",
        balanceCents: 1500,
      }),
    ];

    const gold = paletteAccountItem(cards[0]!, [meuPluggy], money);
    const platinum = paletteAccountItem(cards[1]!, [meuPluggy], money);

    expect(gold.label).toBe("GOLD · 1111");
    expect(gold.amountCents).toBe(-250000);
    expect(gold.amountLabel).toBe(`-${brl("2.500,00")}`);
    expect(platinum.label).toBe("platinum · 2222");
    expect(platinum.amountLabel).toBe(`-${brl("15,00")}`);
  });

  it("não repete a instituição do item MeuPluggy nem omite o nome sem número", () => {
    const item = paletteAccountItem(
      account({ id: "sem-numero", name: "Conta digital", balanceCents: 0 }),
      [meuPluggy],
      money,
    );

    expect(item.label).toBe("Conta digital");
    expect(item.amountLabel).toBe(brl("0,00"));
  });

  it("usa a instituição da conexão e a busca acha o banco sem acento e o número", () => {
    const demo = connection({
      id: "c2",
      provider: "demo",
      institution: {
        id: "i2",
        provider: "demo",
        externalId: "demo-inst-banco-agil",
        name: "Banco Ágil",
        logoUrl: null,
        primaryColor: "ef294b",
        type: "PERSONAL_BANK",
      },
    });
    const item = paletteAccountItem(
      account({
        id: "agil",
        connectionId: "c2",
        name: "Conta Corrente",
        numberMasked: "00099999-9",
        balanceCents: 456789,
      }),
      [demo],
      money,
    );

    expect(item.label).toBe("Banco Ágil · Conta Corrente");
    expect(item.amountLabel).toBe(brl("4.567,89"));
    expect(item.searchText).toContain("Banco Agil");
    expect(item.searchText).toContain("00099999-9");
  });

  it("respeita Ocultar valores", () => {
    const item = paletteAccountItem(
      account({
        id: "gold",
        type: "credit_card",
        name: "GOLD",
        numberMasked: "1111",
        balanceCents: 250000,
      }),
      [meuPluggy],
      createMoneyFormatter(true),
    );

    expect(item.amountLabel).toBe(HIDDEN_MONEY_TEXT);
  });
});
