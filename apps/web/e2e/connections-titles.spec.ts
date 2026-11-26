import { expect, test } from "@playwright/test";

/**
 * Produção (`ENABLE_DEMO_PROVIDER=false`) com dois itens MeuPluggy, um por banco.
 * O conector é o mesmo nas duas conexões, então o título precisa vir da
 * instituição autorizada — antes os dois cards se chamavam "MeuPluggy".
 * O aviso das 24h do MeuPluggy também aparecia uma vez por card.
 */
const MEU_PLUGGY_INSTITUTION = {
  id: "i-200",
  provider: "pluggy",
  externalId: "200",
  name: "MeuPluggy",
  logoUrl: null,
  primaryColor: "ef294b",
  type: "PERSONAL_BANK",
};

const PROVIDERS = {
  data: [
    {
      id: "pluggy",
      name: "Pluggy",
      configured: true,
      description: "Open Finance via MeuPluggy: leitura dos seus próprios bancos, com dados reais.",
      supportsConnectWidget: true,
    },
  ],
};

const CONNECTIONS = {
  data: [
    {
      id: "c-inter",
      provider: "pluggy",
      externalId: "item-inter",
      institutionId: "i-200",
      status: "active",
      statusDetail: null,
      lastSyncedAt: "2026-11-11T09:00:00.000Z",
      createdAt: "2026-11-01T09:00:00.000Z",
      updatedAt: "2026-11-11T09:00:00.000Z",
      institution: MEU_PLUGGY_INSTITUTION,
      consentExpiresAt: "2027-11-01T09:00:00.000Z",
    },
    {
      id: "c-nubank",
      provider: "pluggy",
      externalId: "item-nubank",
      institutionId: "i-200",
      status: "active",
      statusDetail: null,
      lastSyncedAt: "2026-11-11T08:00:00.000Z",
      createdAt: "2026-11-02T09:00:00.000Z",
      updatedAt: "2026-11-11T08:00:00.000Z",
      institution: MEU_PLUGGY_INSTITUTION,
      consentExpiresAt: "2027-11-02T09:00:00.000Z",
    },
  ],
};

function account(overrides: Record<string, unknown>) {
  return {
    userId: "u-demo",
    subtype: null,
    numberMasked: null,
    currency: "BRL",
    balanceCents: 100_000,
    availableCents: 100_000,
    updatedAt: "2026-11-11T09:00:00.000Z",
    provider: "pluggy",
    institutionName: null,
    ...overrides,
  };
}

/** #38: o cartão do item herda o banco da conta corrente, mesmo com nome "GOLD". */
const ACCOUNTS = {
  data: [
    account({
      id: "a-inter-checking",
      connectionId: "c-inter",
      externalId: "acc-inter-1",
      type: "checking",
      subtype: "CHECKING_ACCOUNT",
      name: "Conta corrente",
      institutionName: "Banco Inter",
    }),
    account({
      id: "a-inter-card",
      connectionId: "c-inter",
      externalId: "acc-inter-2",
      type: "credit_card",
      name: "GOLD",
      institutionName: "Banco Inter",
    }),
    account({
      id: "a-nubank-checking",
      connectionId: "c-nubank",
      externalId: "acc-nubank-1",
      type: "checking",
      subtype: "CHECKING_ACCOUNT",
      name: "Conta corrente",
      institutionName: "Nubank",
    }),
    account({
      id: "a-nubank-card",
      connectionId: "c-nubank",
      externalId: "acc-nubank-2",
      type: "credit_card",
      name: "platinum",
      institutionName: "Nubank",
    }),
  ],
};

test.describe("conexões MeuPluggy", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/providers", async (route) => {
      await route.fulfill({ json: PROVIDERS });
    });
    await page.route("**/api/connections", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: CONNECTIONS });
        return;
      }
      await route.continue();
    });
    await page.route("**/api/accounts", async (route) => {
      await route.fulfill({ json: ACCOUNTS });
    });
  });

  test("o título de cada conexão é a instituição autorizada", async ({ page }) => {
    await page.goto("/connections");

    const list = page.getByRole("region", { name: "Suas conexões" });
    await expect(list.getByRole("heading", { level: 3 })).toHaveText(["Banco Inter", "Nubank"], {
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { level: 3, name: "MeuPluggy" })).toHaveCount(0);
    await expect(list.getByText("via MeuPluggy")).toHaveCount(2);
    // O título já é a instituição: a linha "Contas autorizadas" não repete o banco.
    await expect(list.getByText(/Contas autorizadas/)).toHaveCount(0);
  });

  test("o aviso das 24h aparece uma vez na página, no topo da lista", async ({ page }) => {
    await page.goto("/connections");

    const cards = page.getByRole("region", { name: "Suas conexões" }).getByRole("heading", {
      level: 3,
    });
    await expect(cards).toHaveCount(2, { timeout: 20_000 });
    await expect(page.getByText(/atualiza os dados a cada 24h/)).toHaveCount(1);
    await expect(
      page.getByRole("region", { name: "Suas conexões" }).getByText(/atualiza os dados a cada 24h/),
    ).toHaveCount(1);
    await expect(
      page
        .getByRole("region", { name: "Adicionar conexão" })
        .getByText(/atualiza os dados a cada 24h/),
    ).toHaveCount(0);
  });

  test("as ações citam a instituição da conexão", async ({ page }) => {
    await page.goto("/connections");

    const cards = page.getByRole("region", { name: "Suas conexões" }).getByRole("heading", {
      level: 3,
    });
    await expect(cards).toHaveCount(2, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Atualizar Banco Inter" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Histórico de Banco Inter" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remover conexão Banco Inter" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Atualizar Nubank" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Histórico de Nubank" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remover conexão Nubank" })).toBeVisible();
  });

  test("dois itens do mesmo banco ganham desempate pela data de criação", async ({ page }) => {
    await page.route("**/api/connections", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          json: {
            data: [
              { ...CONNECTIONS.data[0], id: "c-aurora-1", createdAt: "2026-11-02T12:00:00.000Z" },
              { ...CONNECTIONS.data[0], id: "c-aurora-2", createdAt: "2026-11-05T12:00:00.000Z" },
            ],
          },
        });
        return;
      }
      await route.continue();
    });
    await page.route("**/api/accounts", async (route) => {
      await route.fulfill({
        json: {
          data: [1, 2].map((index) => ({
            ...ACCOUNTS.data[0],
            id: `a-aurora-${index}`,
            connectionId: `c-aurora-${index}`,
            externalId: `acc-aurora-${index}`,
          })),
        },
      });
    });

    await page.goto("/connections");

    const list = page.getByRole("region", { name: "Suas conexões" });
    await expect(list.getByRole("heading", { level: 3 })).toHaveText(
      ["Banco Inter · criada em 02/11/2026", "Banco Inter · criada em 05/11/2026"],
      { timeout: 20_000 },
    );
    await expect(
      page.getByRole("button", { name: "Remover conexão Banco Inter · criada em 02/11/2026" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Remover conexão Banco Inter · criada em 05/11/2026" }),
    ).toBeVisible();
  });

  test("sem instituição em conta nenhuma, o título usa o nome das contas", async ({ page }) => {
    await page.route("**/api/accounts", async (route) => {
      await route.fulfill({
        json: {
          data: ACCOUNTS.data.map((item) => ({ ...item, institutionName: null })),
        },
      });
    });

    await page.goto("/connections");

    const list = page.getByRole("region", { name: "Suas conexões" });
    // "Conta corrente · GOLD" (Aurora) e "Conta corrente · platinum" (Nuvem).
    await expect(list.getByRole("heading", { level: 3 })).toHaveText(
      ["Conta corrente · GOLD", "Conta corrente · platinum"],
      { timeout: 20_000 },
    );
    await expect(page.getByRole("heading", { level: 3, name: "MeuPluggy" })).toHaveCount(0);
  });

  test("o diálogo de remover cita a instituição da conexão", async ({ page }) => {
    await page.goto("/connections");

    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(2, { timeout: 20_000 });
    await page.getByRole("button", { name: "Remover conexão Banco Inter" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Remover conexão?" })).toBeVisible();
    await expect(dialog).toContainText("Banco Inter");
    await expect(dialog).not.toContainText("MeuPluggy");
  });

  test("o diálogo de reconectar cita a instituição da conexão", async ({ page }) => {
    await page.route("**/api/connections", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          json: { data: [{ ...CONNECTIONS.data[0], status: "login_required" }] },
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/connections");

    await page.getByRole("button", { name: "Reconectar" }).click({ timeout: 20_000 });

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Reconectar Banco Inter" })).toBeVisible();
  });

  test("enquanto as contas carregam, o título não mostra o conector", async ({ page }) => {
    await page.route("**/api/accounts", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.fulfill({ json: ACCOUNTS });
    });

    await page.goto("/connections");

    const list = page.getByRole("region", { name: "Suas conexões" });
    await expect(
      list.locator('[data-slot="connection-card"] [data-slot="skeleton"]').first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 3, name: "MeuPluggy" })).toHaveCount(0);
    await expect(list.getByRole("heading", { level: 3 })).toHaveText(["Banco Inter", "Nubank"], {
      timeout: 20_000,
    });
  });

  test("sem conexão MeuPluggy, o aviso aparece no bloco de adicionar", async ({ page }) => {
    await page.route("**/api/connections", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: { data: [] } });
        return;
      }
      await route.continue();
    });

    await page.goto("/connections");

    const add = page.getByRole("region", { name: "Adicionar conexão" });
    await expect(add.getByText(/atualiza os dados a cada 24h/)).toHaveCount(1, {
      timeout: 20_000,
    });
    await expect(page.getByText(/atualiza os dados a cada 24h/)).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
  });
});
