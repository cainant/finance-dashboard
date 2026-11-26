import type { Account, Connection } from "@fd/contracts";
import { describe, expect, it } from "vitest";

import {
  authorizedInstitutionNames,
  consentExpiryLabel,
  connectionDisplayName,
  connectionLastSyncLabel,
  connectionPrimaryName,
  connectionProviderFreshnessLabel,
  connectionProviderMeta,
  connectionTitle,
  connectionTitles,
  demoConnectProgressLabel,
  demoConnectStatusLabel,
  isMeuPluggyConnection,
  meuPluggyNoticePlacement,
  providerLabel,
  syncRunDurationLabel,
  syncSliceLabel,
} from "./connection-view";

function connection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: "c1",
    provider: "pluggy",
    externalId: "ext-1",
    institutionId: null,
    status: "active",
    statusDetail: null,
    lastSyncedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-10T12:00:00.000Z",
    ...overrides,
  };
}

/** Item MeuPluggy: o conector é a instituição da conexão, igual para todas as contas. */
function meuPluggy(overrides: Partial<Connection> = {}): Connection {
  return connection({
    institution: {
      id: "i-200",
      provider: "pluggy",
      externalId: "200",
      name: "MeuPluggy",
      logoUrl: null,
      primaryColor: "ef294b",
      type: "PERSONAL_BANK",
    },
    ...overrides,
  });
}

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: "a1",
    userId: "u1",
    connectionId: "c1",
    externalId: "acc-1",
    type: "checking",
    subtype: null,
    name: "Conta corrente",
    numberMasked: null,
    currency: "BRL",
    balanceCents: 0,
    availableCents: null,
    updatedAt: "2026-11-10T12:00:00.000Z",
    ...overrides,
  };
}

describe("providerLabel", () => {
  it("traduz os providers do contrato", () => {
    expect(providerLabel("demo")).toBe("Provider demo");
    expect(providerLabel("pluggy")).toBe("Pluggy · Open Finance");
  });
});

describe("connectionDisplayName", () => {
  it("prefere a instituição da conexão", () => {
    const withInstitution = connection({
      institution: {
        id: "i1",
        provider: "pluggy",
        externalId: "inst-1",
        name: "Banco Aurora",
        logoUrl: null,
        primaryColor: "ef294b",
        type: "PERSONAL_BANK",
      },
    });

    expect(connectionDisplayName(withInstitution)).toBe("Banco Aurora");
  });

  it("usa um nome claro quando não há instituição", () => {
    expect(connectionDisplayName(connection({ provider: "demo" }))).toBe("Demonstração");
    expect(connectionDisplayName(connection({ provider: "pluggy" }))).toBe("Pluggy");
  });
});

describe("MeuPluggy", () => {
  it("reconhece o conector 200 e o nome normalizado", () => {
    expect(isMeuPluggyConnection(meuPluggy())).toBe(true);
    expect(
      isMeuPluggyConnection(
        connection({
          institution: {
            id: "i-x",
            provider: "pluggy",
            externalId: "other",
            name: "Meu Pluggy",
            logoUrl: null,
            primaryColor: null,
            type: "PERSONAL_BANK",
          },
        }),
      ),
    ).toBe(true);
    expect(isMeuPluggyConnection(connection())).toBe(false);
  });

  it("explica a validade do consentimento", () => {
    const now = new Date("2026-11-10T12:00:00.000Z");
    expect(consentExpiryLabel("2027-11-10T12:00:00.000Z", now)).toBe(
      "Autorização válida até 10/11/2027",
    );
    expect(consentExpiryLabel("2026-12-01T12:00:00.000Z", now)).toContain("expira em");
    expect(consentExpiryLabel("2026-01-01T12:00:00.000Z", now)).toContain("expirada");
    expect(consentExpiryLabel(null, now)).toBeNull();
  });
});

describe("authorizedInstitutionNames", () => {
  it("lê a instituição de cada conta e descarta vazios", () => {
    expect(
      authorizedInstitutionNames([
        account({ institutionName: "Banco Inter" }),
        account({ institutionName: null }),
        account({ institutionName: "   " }),
      ]),
    ).toEqual(["Banco Inter"]);
  });

  it("não repete a mesma instituição em contas diferentes", () => {
    expect(
      authorizedInstitutionNames([
        account({ institutionName: "Banco Inter" }),
        account({ type: "credit_card", institutionName: "banco inter" }),
      ]),
    ).toEqual(["Banco Inter"]);
  });
});

describe("connectionTitle", () => {
  // Produção: dois itens MeuPluggy, um por banco. O conector não diferencia nada.
  it("usa a instituição autorizada no lugar do conector", () => {
    const bancoInter = meuPluggy({ id: "c-inter" });

    expect(
      connectionTitle(bancoInter, [
        account({ connectionId: "c-inter", institutionName: "Banco Inter" }),
        account({
          connectionId: "c-inter",
          type: "credit_card",
          name: "GOLD",
          institutionName: null,
        }),
      ]),
    ).toBe("Banco Inter");
    expect(
      connectionTitle(meuPluggy({ id: "c-nubank" }), [
        account({ connectionId: "c-nubank", institutionName: "Nubank" }),
      ]),
    ).toBe("Nubank");
  });

  it("lista mais de uma instituição na ordem das contas", () => {
    expect(
      connectionTitle(meuPluggy(), [
        account({ institutionName: "Banco Inter" }),
        account({ type: "savings", institutionName: "Nubank" }),
        account({ type: "credit_card", institutionName: "Banco Inter" }),
      ]),
    ).toBe("Banco Inter · Nubank");
  });

  it("cai no nome da conexão enquanto as contas não chegaram", () => {
    expect(connectionTitle(meuPluggy(), [])).toBe("MeuPluggy");
    expect(connectionTitle(connection({ provider: "demo" }), [])).toBe("Demonstração");
    expect(connectionTitle(connection({ institution: null }), [])).toBe("Pluggy");
  });

  // Item sem COMPE em conta nenhuma: antes caía em "MeuPluggy" nos dois cards.
  it("cai no nome das contas quando nenhuma conta tem instituição", () => {
    expect(
      connectionTitle(meuPluggy(), [
        account({ name: "Conta corrente", institutionName: null }),
        account({ name: "GOLD", type: "credit_card", institutionName: null }),
      ]),
    ).toBe("Conta corrente · GOLD");
  });

  it("limita o título a três nomes e resume o resto em +N", () => {
    expect(
      connectionTitle(
        meuPluggy(),
        ["Um", "Dois", "Três", "Quatro", "Cinco"].map((institutionName) =>
          account({ institutionName }),
        ),
      ),
    ).toBe("Um · Dois · Três +2");
  });

  it("ignora as contas fora do MeuPluggy", () => {
    const demo = connection({
      provider: "demo",
      institution: {
        id: "i-demo",
        provider: "demo",
        externalId: "demo-1",
        name: "Banco Aurora",
        logoUrl: null,
        primaryColor: null,
        type: "PERSONAL_BANK",
      },
    });
    const sandbox = connection({
      institution: {
        id: "i-sandbox",
        provider: "pluggy",
        externalId: "1",
        name: "Pluggy Bank",
        logoUrl: null,
        primaryColor: null,
        type: "PERSONAL_BANK",
      },
    });

    expect(connectionTitle(demo, [account({ institutionName: "Ignorado" })])).toBe("Banco Aurora");
    expect(connectionTitle(sandbox, [account({ institutionName: "Ignorado" })])).toBe(
      "Pluggy Bank",
    );
  });
});

describe("connectionPrimaryName", () => {
  it("usa só a primeira instituição (o avatar busca logo por nome)", () => {
    expect(
      connectionPrimaryName(meuPluggy(), [
        account({ institutionName: "Banco Inter" }),
        account({ type: "savings", institutionName: "Nubank" }),
      ]),
    ).toBe("Banco Inter");
    expect(connectionPrimaryName(meuPluggy(), [])).toBe("MeuPluggy");
  });
});

describe("connectionTitles", () => {
  // Reconectar pode criar um item novo para o mesmo banco: sem desempate, os
  // dois cards (e os aria-labels, inclusive no remover) ficariam idênticos.
  it("desempata itens do mesmo banco pela data de criação", () => {
    const titles = connectionTitles(
      [
        meuPluggy({ id: "c1", createdAt: "2026-11-02T12:00:00.000Z" }),
        meuPluggy({ id: "c2", createdAt: "2026-11-05T12:00:00.000Z" }),
      ],
      [
        { connectionId: "c1", institutionName: "Banco Inter", name: "Conta corrente" },
        { connectionId: "c2", institutionName: "Banco Inter", name: "Conta corrente" },
      ],
    );

    expect(titles.get("c1")).toBe("Banco Inter · criada em 02/11/2026");
    expect(titles.get("c2")).toBe("Banco Inter · criada em 05/11/2026");
  });

  it("mantém o título curto quando não há empate", () => {
    const titles = connectionTitles(
      [
        meuPluggy({ id: "c1", createdAt: "2026-11-02T12:00:00.000Z" }),
        meuPluggy({ id: "c2", createdAt: "2026-11-05T12:00:00.000Z" }),
      ],
      [
        { connectionId: "c1", institutionName: "Banco Inter", name: "Conta corrente" },
        { connectionId: "c2", institutionName: "Nubank", name: "Conta corrente" },
      ],
    );

    expect(titles.get("c1")).toBe("Banco Inter");
    expect(titles.get("c2")).toBe("Nubank");
  });

  it("desempata também quando todos caem no nome das contas", () => {
    const titles = connectionTitles(
      [
        meuPluggy({ id: "c1", createdAt: "2026-11-02T12:00:00.000Z" }),
        meuPluggy({ id: "c2", createdAt: "2026-11-05T12:00:00.000Z" }),
      ],
      [
        { connectionId: "c1", institutionName: null, name: "Conta corrente" },
        { connectionId: "c2", institutionName: null, name: "Conta corrente" },
      ],
    );

    expect(titles.get("c1")).toBe("Conta corrente · criada em 02/11/2026");
    expect(titles.get("c2")).toBe("Conta corrente · criada em 05/11/2026");
  });

  it("devolve título para toda conexão, mesmo sem contas", () => {
    const titles = connectionTitles([meuPluggy({ id: "c1" })], []);

    expect(titles.get("c1")).toBe("MeuPluggy");
  });
});

describe("meuPluggyNoticePlacement", () => {
  it("com conexão MeuPluggy, o aviso fica no topo da lista", () => {
    expect(meuPluggyNoticePlacement([meuPluggy()])).toEqual({ list: true, add: false });
    expect(meuPluggyNoticePlacement([connection({ provider: "demo" }), meuPluggy()])).toEqual({
      list: true,
      add: false,
    });
  });

  // Quem conecta pela primeira vez precisa do aviso no bloco de adicionar.
  it("sem conexão MeuPluggy, o aviso fica no bloco de adicionar", () => {
    expect(meuPluggyNoticePlacement([])).toEqual({ list: false, add: true });
    expect(meuPluggyNoticePlacement([connection({ provider: "demo" })])).toEqual({
      list: false,
      add: true,
    });
  });
});

describe("connectionProviderMeta", () => {
  it("mostra o conector como meta em itens MeuPluggy", () => {
    expect(connectionProviderMeta(meuPluggy())).toBe("via MeuPluggy");
  });

  it("mantém o rótulo do provider nas demais conexões", () => {
    expect(connectionProviderMeta(connection({ provider: "demo" }))).toBe("Provider demo");
    expect(connectionProviderMeta(connection())).toBe("Pluggy · Open Finance");
  });
});

describe("connectionLastSyncLabel", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");

  it("usa o tempo relativo em pt-BR", () => {
    expect(connectionLastSyncLabel("2026-11-10T11:55:00.000Z", now)).toBe(
      "Última sincronização há 5 minutos",
    );
  });

  it("explica quando nunca houve sincronização", () => {
    expect(connectionLastSyncLabel(null)).toBe("Nunca sincronizada");
  });
});

describe("connectionProviderFreshnessLabel", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");

  it("mostra o frescor do dado no provider, separado da leitura local", () => {
    expect(connectionProviderFreshnessLabel("2026-11-10T07:00:00.000Z", now)).toBe(
      "Dados do banco atualizados há 5 horas",
    );
  });

  it("omite quando o provider não informa a data", () => {
    expect(connectionProviderFreshnessLabel(null, now)).toBeNull();
    expect(connectionProviderFreshnessLabel(undefined, now)).toBeNull();
  });

  it("omite data inválida em vez de escrever 'Data inválida' no card", () => {
    expect(connectionProviderFreshnessLabel("ontem", now)).toBeNull();
  });
});

describe("syncRunDurationLabel", () => {
  it("formata segundos e minutos", () => {
    expect(syncRunDurationLabel("2026-11-10T12:00:00.000Z", "2026-11-10T12:00:12.000Z")).toBe(
      "12 s",
    );
    expect(syncRunDurationLabel("2026-11-10T12:00:00.000Z", "2026-11-10T12:01:30.000Z")).toBe(
      "1 min 30 s",
    );
    expect(syncRunDurationLabel("2026-11-10T12:00:00.000Z", "2026-11-10T12:02:00.000Z")).toBe(
      "2 min",
    );
  });

  it("devolve null para execuções em andamento ou datas inválidas", () => {
    expect(syncRunDurationLabel("2026-11-10T12:00:00.000Z", null)).toBeNull();
    expect(syncRunDurationLabel("data inválida", "2026-11-10T12:00:00.000Z")).toBeNull();
    expect(syncRunDurationLabel("2026-11-10T12:00:00.000Z", "2026-11-10T11:59:00.000Z")).toBeNull();
  });
});

describe("demoConnectProgressLabel", () => {
  it("descreve cada passo do fluxo de demonstração", () => {
    expect(demoConnectProgressLabel("idle")).toBe("Conectar demonstração");
    expect(demoConnectProgressLabel("creating")).toBe("Criando conexão…");
    expect(demoConnectProgressLabel("syncing")).toBe("Sincronizando dados…");
    expect(demoConnectProgressLabel("done")).toBe("Demonstração conectada");
  });

  it("mostra o progresso 2/3 enquanto sincroniza", () => {
    expect(demoConnectProgressLabel("syncing", { completed: 1, total: 3 })).toBe(
      "Sincronizando 2/3…",
    );
    expect(demoConnectProgressLabel("syncing", { completed: 3, total: 3 })).toBe("Finalizando…");
  });

  it("prioriza a fatia do histórico quando a API pagina o sync", () => {
    expect(demoConnectProgressLabel("syncing", { completed: 0, total: 3, slice: 2 })).toBe(
      "Importando… fatia 2",
    );
    expect(demoConnectStatusLabel("syncing", { completed: 1, total: 3, slice: 2 })).toBe(
      "Importando histórico… fatia 2",
    );
    expect(syncSliceLabel(4)).toBe("Importando histórico… fatia 4");
    expect(syncSliceLabel(0)).toBeNull();
    expect(syncSliceLabel(null)).toBeNull();
  });
});

describe("demoConnectStatusLabel", () => {
  it("detalha a sincronização das conexões demo", () => {
    expect(demoConnectStatusLabel("creating", null)).toBe("Criando conexão de demonstração…");
    expect(demoConnectStatusLabel("syncing", { completed: 0, total: 3 })).toBe(
      "Sincronizando 1/3 conexões demo…",
    );
    expect(demoConnectStatusLabel("syncing", { completed: 1, total: 3 })).toBe(
      "Sincronizando 2/3 conexões demo…",
    );
    expect(demoConnectStatusLabel("syncing", { completed: 3, total: 3 })).toBe(
      "Finalizando sincronização…",
    );
  });
});
