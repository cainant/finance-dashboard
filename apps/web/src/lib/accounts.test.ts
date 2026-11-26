import type { Account, Connection } from "@fd/contracts";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import {
  accountDisplayCents,
  accountGroupKey,
  accountGroupKeyFromSearch,
  accountGroupLinkSearch,
  accountGroupSearch,
  accountSearchText,
  accountTypeCaption,
  accountTypeLabel,
  buildAccountMetaIndex,
  deriveBalanceSeries,
  type AccountGroup,
  groupAccountsByInstitution,
  groupDisplayCents,
  groupHasCardDebt,
  groupsAccountsBalanceCents,
  isDemoAccount,
  sortGroupsByDisplayCents,
  stripDiacritics,
  summarizeAccounts,
  totalBalanceCents,
  totalCreditCardCents,
  transactionAccountParts,
} from "./accounts";
import { accountsSearchSchema } from "./search";

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

function connection(overrides: Partial<Connection> & Pick<Connection, "id">): Connection {
  return {
    provider: "demo",
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

function interAccounts(): Account[] {
  return [
    account({
      id: "inter-checking",
      name: "BANCO INTER",
      type: "checking",
      subtype: "CHECKING_ACCOUNT",
      numberMasked: "00000000-0",
      balanceCents: 123_456,
    }),
    account({
      id: "inter-savings",
      name: "BANCO INTER",
      type: "savings",
      subtype: "SAVINGS_ACCOUNT",
      numberMasked: "00000000-0",
      balanceCents: 0,
    }),
  ];
}

describe("accountTypeLabel", () => {
  it("separa as duas contas do Inter com type/subtype reais do provider", () => {
    const [checking, savings] = interAccounts();

    expect(accountTypeLabel(checking!.type, checking!.subtype)).toBe("Conta corrente");
    expect(accountTypeLabel(savings!.type, savings!.subtype)).toBe("Poupança");
  });

  it("traduz os subtipos que o Pluggy envia para conta", () => {
    expect(accountTypeLabel("checking", "CHECKING_ACCOUNT")).toBe("Conta corrente");
    expect(accountTypeLabel("savings", "SAVINGS_ACCOUNT")).toBe("Poupança");
    expect(accountTypeLabel("credit_card", "CREDIT_CARD")).toBe("Cartão de crédito");
  });

  it("cai no rótulo do tipo quando o subtipo é ausente ou desconhecido", () => {
    expect(accountTypeLabel("savings", null)).toBe("Poupança");
    expect(accountTypeLabel("investment")).toBe("Investimentos");
    expect(accountTypeLabel("other", "UNKNOWN_SUBTYPE")).toBe("Outra");
  });
});

describe("accountTypeCaption", () => {
  it("mostra o rótulo quando o nome não diz o tipo", () => {
    const [checking, savings] = interAccounts();

    expect(accountTypeCaption(checking!)).toBe("Conta corrente");
    expect(accountTypeCaption(savings!)).toBe("Poupança");
  });

  it("omite o rótulo que o nome da conta já contém", () => {
    expect(
      accountTypeCaption(
        account({ id: "a1", name: "Poupança", type: "savings", subtype: "SAVINGS_ACCOUNT" }),
      ),
    ).toBeNull();
    expect(
      accountTypeCaption(
        account({
          id: "a2",
          name: "Conta Corrente",
          type: "checking",
          subtype: "CHECKING_ACCOUNT",
        }),
      ),
    ).toBeNull();
    expect(
      accountTypeCaption(
        account({ id: "a3", name: "poupanca", type: "savings", subtype: "SAVINGS_ACCOUNT" }),
      ),
    ).toBeNull();
  });

  it("reconhece 'cartão' no nome do cartão mesmo sem o rótulo completo", () => {
    expect(
      accountTypeCaption(
        account({
          id: "a4",
          name: "Cartão Aurora Visa",
          type: "credit_card",
          subtype: "CREDIT_CARD",
        }),
      ),
    ).toBeNull();
    expect(
      accountTypeCaption(
        account({ id: "a5", name: "platinum", type: "credit_card", subtype: "CREDIT_CARD" }),
      ),
    ).toBe("Cartão de crédito");
  });
});

describe("stripDiacritics", () => {
  it("remove acentos para a busca da paleta (cmdk não normaliza)", () => {
    expect(stripDiacritics("Poupança")).toBe("Poupanca");
    expect(stripDiacritics("Cartão de crédito")).toBe("Cartao de credito");
  });
});

describe("accountSearchText", () => {
  it("inclui nome, instituição e tipo com e sem acentos", () => {
    const [, savings] = interAccounts();
    const text = accountSearchText({ ...savings!, institutionName: "Banco Inter" });

    expect(text).toContain("BANCO INTER");
    expect(text).toContain("Banco Inter");
    expect(text).toContain("Poupança");
    expect(text).toContain("Poupanca");
  });
});

describe("groupAccountsByInstitution", () => {
  it("agrupa por conexão e separa faturas do saldo consolidado", () => {
    const connections = [
      connection({
        id: "c1",
        institution: {
          id: "i1",
          provider: "demo",
          externalId: "aurora",
          name: "Banco Aurora",
          logoUrl: null,
          primaryColor: "ef294b",
          type: "PERSONAL_BANK",
        },
      }),
      connection({ id: "c2", provider: "pluggy" }),
    ];

    const groups = groupAccountsByInstitution(
      [
        account({ id: "a1", connectionId: "c1", balanceCents: 100_000 }),
        account({ id: "a2", connectionId: "c1", type: "savings", balanceCents: 50_000 }),
        account({ id: "a3", connectionId: "c1", type: "credit_card", balanceCents: 30_000 }),
        account({ id: "a4", connectionId: "c2", balanceCents: 20_000 }),
      ],
      connections,
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      key: "c1",
      institutionName: "Banco Aurora",
      provider: "demo",
      totalCents: 150_000,
      creditCardCents: 30_000,
      netCents: 120_000,
    });
    expect(groups[0]!.accounts).toHaveLength(3);
    expect(groups[1]).toMatchObject({ key: "c2", institutionName: "Sem instituição" });
  });

  it("usa 'Demonstração' quando a conexão demo não tem instituição", () => {
    const [group] = groupAccountsByInstitution(
      [account({ id: "a1", connectionId: "c1" })],
      [connection({ id: "c1" })],
    );

    expect(group?.institutionName).toBe("Demonstração");
  });

  it("separa contas de bancos diferentes dentro do mesmo item MeuPluggy", () => {
    const groups = groupAccountsByInstitution(
      [
        account({
          id: "a1",
          connectionId: "c1",
          institutionName: "Itaú",
          balanceCents: 100_000,
        }),
        account({
          id: "a2",
          connectionId: "c1",
          institutionName: "Nubank",
          type: "credit_card",
          balanceCents: 30_000,
        }),
        account({
          id: "a3",
          connectionId: "c1",
          institutionName: "Itaú",
          type: "savings",
          balanceCents: 50_000,
        }),
      ],
      [
        connection({
          id: "c1",
          provider: "pluggy",
          institution: {
            id: "i200",
            provider: "pluggy",
            externalId: "200",
            name: "MeuPluggy",
            logoUrl: null,
            primaryColor: null,
            type: "PERSONAL_BANK",
          },
        }),
      ],
    );

    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.institutionName === "Itaú")).toMatchObject({
      key: "c1:Itaú",
      totalCents: 150_000,
      creditCardCents: 0,
    });
    expect(groups.find((group) => group.institutionName === "Nubank")).toMatchObject({
      key: "c1:Nubank",
      totalCents: 0,
      creditCardCents: 30_000,
    });
  });

  it("ordena grupos pelo saldo consolidado", () => {
    const groups = groupAccountsByInstitution(
      [
        account({ id: "a1", connectionId: "c1", balanceCents: 10_000 }),
        account({ id: "a2", connectionId: "c2", balanceCents: 90_000 }),
      ],
      [connection({ id: "c1" }), connection({ id: "c2" })],
    );

    expect(groups.map((group) => group.key)).toEqual(["c2", "c1"]);
  });
});

describe("groupDisplayCents", () => {
  function groupOf(accounts: Account[]): AccountGroup {
    const [group] = groupAccountsByInstitution(accounts, [connection({ id: "c1" })]);
    if (!group) {
      throw new Error("grupo não criado");
    }

    return group;
  }

  it("sem cartão, usa o saldo das contas", () => {
    const group = groupOf([account({ id: "a1", balanceCents: 42_000 })]);

    expect(groupDisplayCents(group)).toBe(42_000);
  });

  it("com fatura aberta, usa o líquido (saldos - faturas)", () => {
    const group = groupOf([
      account({ id: "a1", balanceCents: 42_000 }),
      account({ id: "a2", type: "credit_card", balanceCents: 20_000 }),
    ]);

    expect(groupDisplayCents(group)).toBe(22_000);
  });

  it("grupo só de cartão mostra a dívida negativa em vez de zero", () => {
    const group = groupOf([account({ id: "a1", type: "credit_card", balanceCents: 123_456 })]);

    expect(group.totalCents).toBe(0);
    expect(groupHasCardDebt(group)).toBe(true);
    expect(groupDisplayCents(group)).toBe(-123_456);
  });
});

describe("groupsAccountsBalanceCents", () => {
  it("reproduz 'Em contas': sem cartões e sem investimentos", () => {
    const groups = groupAccountsByInstitution(
      [
        account({ id: "a1", balanceCents: 42_000 }),
        account({ id: "a2", type: "investment", balanceCents: 500_000 }),
        account({ id: "a3", type: "credit_card", balanceCents: 20_000 }),
        account({ id: "a4", connectionId: "c2", balanceCents: 7_300 }),
      ],
      [connection({ id: "c1" }), connection({ id: "c2" })],
    );

    expect(groupsAccountsBalanceCents(groups)).toBe(49_300);
    expect(groupsAccountsBalanceCents([])).toBe(0);
  });

  it("ignora os grupos filtrados (demo) que a sidebar não exibe", () => {
    const groups = groupAccountsByInstitution(
      [account({ id: "a1", balanceCents: 5_000 })],
      [connection({ id: "c1" })],
    );

    expect(groupsAccountsBalanceCents(groups)).toBe(5_000);
    expect(groupsAccountsBalanceCents([])).toBe(0);
  });
});

describe("sortGroupsByDisplayCents", () => {
  it("ordena pelo valor exibido, não pelo saldo bruto", () => {
    const groups = groupAccountsByInstitution(
      [
        // Inter: 420 em conta e 2.000 de fatura → exibe -1.580.
        account({ id: "a1", connectionId: "c1", balanceCents: 42_000 }),
        account({ id: "a2", connectionId: "c1", type: "credit_card", balanceCents: 200_000 }),
        // Nubank: 100 sem cartão → exibe 100.
        account({ id: "a3", connectionId: "c2", balanceCents: 10_000 }),
      ],
      [connection({ id: "c1" }), connection({ id: "c2" })],
    );

    // Por `totalCents` o Inter (420) viria antes do Nubank (100).
    expect(groups.map((group) => group.totalCents)).toEqual([42_000, 10_000]);
    expect(sortGroupsByDisplayCents(groups).map((group) => groupDisplayCents(group))).toEqual([
      10_000, -158_000,
    ]);
  });

  it("desempata pelo nome da instituição", () => {
    const groups = groupAccountsByInstitution(
      [
        account({ id: "a1", connectionId: "c1", institutionName: "Nubank", balanceCents: 0 }),
        account({ id: "a2", connectionId: "c2", institutionName: "Banco Inter", balanceCents: 0 }),
      ],
      [connection({ id: "c1" }), connection({ id: "c2" })],
    );

    expect(sortGroupsByDisplayCents(groups).map((group) => group.institutionName)).toEqual([
      "Banco Inter",
      "Nubank",
    ]);
  });
});

describe("identidade do grupo de contas", () => {
  it("monta a chave com a conexão e o banco da conta", () => {
    expect(accountGroupKey("c1", "Itaú")).toBe("c1:Itaú");
    expect(accountGroupKey("c1", "  Nubank  ")).toBe("c1:Nubank");
    expect(accountGroupKey("c1", null)).toBe("c1");
    expect(accountGroupKey(undefined, undefined)).toBe("unknown");
  });

  it("converte a chave em search params de /accounts", () => {
    expect(accountGroupSearch("c1:Itaú")).toEqual({ connection: "c1", institution: "Itaú" });
    expect(accountGroupSearch("c1")).toEqual({ connection: "c1" });
    // Nome de banco pode conter dois-pontos; só o primeiro separa a conexão.
    expect(accountGroupSearch("c1:Banco: matriz")).toEqual({
      connection: "c1",
      institution: "Banco: matriz",
    });
  });

  it("volta para a mesma chave a partir dos search params", () => {
    for (const key of ["c1:Itaú", "c1", "unknown:Sem banco"]) {
      expect(accountGroupKeyFromSearch(accountGroupSearch(key))).toBe(key);
    }
  });

  it("devolve null quando a URL não filtra por grupo", () => {
    expect(accountGroupKeyFromSearch({})).toBeNull();
    expect(accountGroupKeyFromSearch({ institution: "Itaú" })).toBeNull();
    expect(accountGroupKeyFromSearch({ connection: "c1", institution: "Itaú" })).toBe("c1:Itaú");
  });

  it("preserva acentos e espaços no nome do banco", () => {
    expect(accountGroupKey("c1", "Itaú")).toBe("c1:Itaú");
    expect(accountGroupSearch("c1:Banco Inter")).toEqual({
      connection: "c1",
      institution: "Banco Inter",
    });
    expect(accountGroupKeyFromSearch(accountGroupSearch("c1:Itaú"))).toBe("c1:Itaú");
  });

  it("dá URLs distintas a dois itens MeuPluggy com o mesmo nome", () => {
    const institution = {
      id: "i200",
      provider: "pluggy" as const,
      externalId: "200",
      name: "MeuPluggy",
      logoUrl: null,
      primaryColor: null,
      type: "PERSONAL_BANK" as const,
    };
    const groups = groupAccountsByInstitution(
      [account({ id: "a1", connectionId: "c1" }), account({ id: "a2", connectionId: "c2" })],
      [
        connection({ id: "c1", provider: "pluggy", institution }),
        connection({ id: "c2", provider: "pluggy", institution }),
      ],
    );

    const searches = groups.map((group) => JSON.stringify(accountGroupSearch(group.key)));
    expect(groups).toHaveLength(2);
    expect(new Set(searches).size).toBe(2);
  });

  it("separa o item sem banco da conta com banco próprio na mesma conexão", () => {
    const groups = groupAccountsByInstitution(
      [
        account({ id: "a1", connectionId: "c1" }),
        account({ id: "a2", connectionId: "c1", institutionName: "Itaú" }),
      ],
      [connection({ id: "c1" })],
    );

    const searches = groups.map((group) => accountGroupSearch(group.key));
    expect(searches).toEqual(
      expect.arrayContaining([{ connection: "c1" }, { connection: "c1", institution: "Itaú" }]),
    );
    expect(new Set(searches.map((item) => JSON.stringify(item))).size).toBe(2);
  });
});

describe("link do sub-item de Contas", () => {
  /**
   * Sem React e sem dados da API: monta só a rota /accounts com o schema real e
   * pergunta ao router qual URL o updater do sub-item produz.
   */
  function buildAccountsRouter(initialEntry: string) {
    const rootRoute = createRootRoute();
    const accountsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/accounts",
      validateSearch: (search) => accountsSearchSchema.parse(search),
    });

    return createRouter({
      routeTree: rootRoute.addChildren([accountsRoute]),
      history: createMemoryHistory({ initialEntries: [initialEntry] }),
    });
  }

  it("não herda a instituição de outro banco num grupo só da conexão", async () => {
    const router = buildAccountsRouter("/accounts?connection=c1&institution=Ita%C3%BA");
    await router.load();

    const next = router.buildLocation({
      to: "/accounts",
      search: (previous) => accountGroupLinkSearch(previous, accountGroupSearch("c2")),
    });

    expect(next.search).toEqual({ connection: "c2" });
    expect(next.href).toBe("/accounts?connection=c2");
  });
});

describe("totais", () => {
  it("soma apenas contas que não são cartão no saldo consolidado", () => {
    const accounts = [
      account({ id: "a1", balanceCents: 100 }),
      account({ id: "a2", type: "credit_card", balanceCents: 400 }),
    ];

    expect(totalBalanceCents(accounts)).toBe(100);
    expect(totalCreditCardCents(accounts)).toBe(400);
  });
});

describe("summarizeAccounts", () => {
  it("separa contas, investimentos e faturas e desconta a dívida do patrimônio", () => {
    const summary = summarizeAccounts([
      account({ id: "a1", balanceCents: 100_000 }),
      account({ id: "a2", type: "savings", balanceCents: 25_000 }),
      account({ id: "a3", type: "investment", balanceCents: 500_000 }),
      account({ id: "a4", type: "credit_card", balanceCents: 80_000 }),
    ]);

    expect(summary).toEqual({
      accountsCents: 125_000,
      investmentsCents: 500_000,
      creditCardCents: 80_000,
      netWorthCents: 545_000,
      accounts: 2,
      investments: 1,
    });
  });

  it("inclui as posições da tabela investments no patrimônio", () => {
    const summary = summarizeAccounts(
      [
        account({ id: "a1", balanceCents: 100_000 }),
        account({ id: "a2", type: "investment", balanceCents: 30_000 }),
        account({ id: "a3", type: "credit_card", balanceCents: 20_000 }),
      ],
      [{ balanceCents: 800 }, { balanceCents: 54 }],
    );

    // Mesmo total do gráfico/KPI: contas + investimentos - faturas.
    expect(summary).toEqual({
      accountsCents: 100_000,
      investmentsCents: 30_854,
      creditCardCents: 20_000,
      netWorthCents: 110_854,
      accounts: 1,
      investments: 3,
    });
  });

  it("devolve zeros sem contas", () => {
    expect(summarizeAccounts([])).toEqual({
      accountsCents: 0,
      investmentsCents: 0,
      creditCardCents: 0,
      netWorthCents: 0,
      accounts: 0,
      investments: 0,
    });
  });
});

describe("buildAccountMetaIndex", () => {
  const meuPluggy = connection({
    id: "c1",
    provider: "pluggy",
    institution: {
      id: "i200",
      provider: "pluggy",
      externalId: "200",
      name: "MeuPluggy",
      logoUrl: null,
      primaryColor: null,
      type: "PERSONAL_BANK",
    },
  });

  it("usa o banco da conta no rótulo da transação do cartão", () => {
    const meta = buildAccountMetaIndex(
      [
        account({
          id: "card",
          connectionId: "c1",
          type: "credit_card",
          name: "GOLD",
          institutionName: "Banco Inter",
        }),
      ],
      [meuPluggy],
    );

    expect(meta.get("card")).toEqual({
      name: "GOLD",
      numberMasked: null,
      institutionName: "Banco Inter",
    });
  });

  it("cai para a instituição da conexão quando a conta não tem banco", () => {
    const meta = buildAccountMetaIndex(
      [account({ id: "card", connectionId: "c1", type: "credit_card", name: "GOLD" })],
      [meuPluggy],
    );

    expect(meta.get("card")).toEqual({
      name: "GOLD",
      numberMasked: null,
      institutionName: "MeuPluggy",
    });
  });

  it("devolve instituição nula quando a conexão nem está na lista", () => {
    const meta = buildAccountMetaIndex(
      [account({ id: "a1", connectionId: "sumiu", numberMasked: "1234" })],
      [meuPluggy],
    );

    expect(meta.get("a1")).toEqual({
      name: "Conta a1",
      numberMasked: "1234",
      institutionName: null,
    });
  });
});

describe("transactionAccountParts", () => {
  it("omite o nome da conta quando ele só repete a instituição", () => {
    expect(
      transactionAccountParts({ institutionName: "Banco Inter", name: "BANCO INTER" }),
    ).toEqual({
      institutionName: "Banco Inter",
      accountName: null,
      numberMasked: null,
      label: "Banco Inter",
    });
  });

  it("compara sem caixa, acento e espaços extras", () => {
    expect(
      transactionAccountParts({ institutionName: "Banco Inter", name: "  banco   Ínter " })
        .accountName,
    ).toBeNull();
    expect(
      transactionAccountParts({ institutionName: "Itaú", name: "ITAU" }).accountName,
    ).toBeNull();
  });

  it("expõe o número mascarado quando o nome da conta foi omitido", () => {
    const parts = transactionAccountParts({
      institutionName: "Banco Inter",
      name: "BANCO INTER",
      numberMasked: "00000000-0",
    });

    expect(parts.accountName).toBeNull();
    expect(parts.numberMasked).toBe("00000000-0");
    // O rótulo de uma linha (painel/recentes) fica sem repetição.
    expect(parts.label).toBe("Banco Inter");
  });

  it("mantém o nome da conta quando ele difere da instituição", () => {
    expect(transactionAccountParts({ institutionName: "Banco Inter", name: "GOLD" })).toEqual({
      institutionName: "Banco Inter",
      accountName: "GOLD",
      numberMasked: null,
      label: "Banco Inter · GOLD",
    });
  });

  it("mostra o nome da conta quando a instituição não existe", () => {
    expect(transactionAccountParts({ institutionName: null, name: "Conta Corrente" })).toEqual({
      institutionName: null,
      accountName: "Conta Corrente",
      numberMasked: null,
      label: "Conta Corrente",
    });
    expect(transactionAccountParts({}).label).toBeNull();
  });
});

describe("isDemoAccount", () => {
  it("usa o provider da conta e cai na conexão quando ausente", () => {
    const connections = [connection({ id: "c1", provider: "demo" })];

    expect(isDemoAccount(account({ id: "a1", provider: "pluggy" }), connections)).toBe(false);
    expect(isDemoAccount(account({ id: "a2" }), connections)).toBe(true);
  });
});

describe("deriveBalanceSeries", () => {
  it("reconstrói o saldo diário a partir do saldo atual", () => {
    const series = deriveBalanceSeries(
      [
        { date: "2026-11-01", amountCents: 100_000 },
        { date: "2026-11-03", amountCents: -20_000 },
        { date: "2026-11-03", amountCents: -5_000 },
        { date: "2026-11-05", amountCents: -10_000 },
      ],
      65_000,
    );

    expect(series).toEqual([
      { date: "2026-11-01", balanceCents: 100_000 },
      { date: "2026-11-03", balanceCents: 75_000 },
      { date: "2026-11-05", balanceCents: 65_000 },
    ]);
  });

  it("devolve série vazia sem transações", () => {
    expect(deriveBalanceSeries([], 1000)).toEqual([]);
  });
});

describe("accountDisplayCents", () => {
  it("inverte o cartão (dívida positiva no domínio) e mantém o saldo das contas", () => {
    expect(accountDisplayCents({ type: "credit_card", balanceCents: 123_456 })).toBe(-123_456);
    expect(accountDisplayCents({ type: "checking", balanceCents: 78_900 })).toBe(78_900);
    expect(accountDisplayCents({ type: "checking", balanceCents: -2_500 })).toBe(-2_500);
  });
});
