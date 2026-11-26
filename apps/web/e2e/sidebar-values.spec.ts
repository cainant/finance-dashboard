import { expect, test, type Page } from "@playwright/test";

/**
 * Valores do grupo "Contas" na sidebar com o formato de produção: um item
 * MeuPluggy com contas de bancos diferentes, um cartão no mesmo banco (total
 * líquido), cartões em grupos próprios e uma conexão que precisa de atenção.
 * O bug original mostrava saldos (sem moeda, pareciam contagens) e "0"
 * nos grupos só de cartão, escondendo a fatura em aberto.
 */
const NU_INSTITUTION = "Nu Pagamentos S.A. - Instituição de Pagamento";

const CONNECTIONS = {
  data: [
    {
      id: "c-meupluggy",
      provider: "pluggy",
      externalId: "item-1",
      institutionId: "i-meupluggy",
      status: "active",
      statusDetail: null,
      lastSyncedAt: "2026-11-11T12:00:00.000Z",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-11T12:00:00.000Z",
      institution: {
        id: "i-meupluggy",
        provider: "pluggy",
        externalId: "200",
        name: "MeuPluggy",
        logoUrl: null,
        primaryColor: null,
        type: "PERSONAL_BANK",
      },
    },
    {
      id: "c-nu",
      provider: "pluggy",
      externalId: "item-2",
      institutionId: "i-nu",
      status: "login_required",
      statusDetail: "WAITING_USER_INPUT",
      lastSyncedAt: null,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-11T12:00:00.000Z",
      institution: {
        id: "i-nu",
        provider: "pluggy",
        externalId: "260",
        name: NU_INSTITUTION,
        logoUrl: null,
        primaryColor: null,
        type: "PERSONAL_BANK",
      },
    },
  ],
};

function account(
  id: string,
  institutionName: string,
  balanceCents: number,
  type: "checking" | "credit_card",
  connectionId = "c-meupluggy",
) {
  return {
    id,
    userId: "u1",
    connectionId,
    externalId: `ext-${id}`,
    type,
    subtype: type === "credit_card" ? "CREDIT_CARD" : "CHECKING_ACCOUNT",
    name: `Conta ${institutionName}`,
    numberMasked: null,
    currency: "BRL",
    balanceCents,
    availableCents: null,
    updatedAt: "2026-11-11T12:00:00.000Z",
    provider: "pluggy",
    institutionName,
  };
}

const ACCOUNTS = {
  data: [
    account("a-inter", "Banco Inter", 42_000, "checking"),
    // Mesmo banco com fatura: a linha mostra o líquido (420 − 200 = 220).
    account("a-inter-card", "Banco Inter", 20_000, "credit_card"),
    account("a-nubank", "Nubank", 7_300, "checking"),
    account("a-itau-card", "Banco Itaú", 123_456, "credit_card"),
    account("a-c6-card", "C6 Bank", 1_234, "credit_card"),
    // Conexão que pede atenção, com saldo negativo e nome longo.
    account("a-nu", NU_INSTITUTION, -25_000, "checking", "c-nu"),
  ],
};

/** Região da navegação (aside com `aria-label`) — evita casar com links do conteúdo. */
function sidebarOf(page: Page) {
  return page.getByRole("complementary", { name: "Navegação principal" });
}

/** Link do item da sidebar cujo texto acessível casa com o rótulo. */
function sidebarItem(page: Page, label: string) {
  return sidebarOf(page).getByRole("link", { name: new RegExp(label) });
}

/** Valor ao lado do item do grupo Contas. */
function itemMeta(page: Page, label: string) {
  return sidebarItem(page, label).locator('[data-slot="sidebar-item-meta"]');
}

test.describe("sidebar: valores do grupo Contas", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/connections(\?.*)?$/, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: CONNECTIONS });
        return;
      }
      await route.continue();
    });
    await page.route(/\/api\/accounts(\?.*)?$/, async (route) => {
      await route.fulfill({ json: ACCOUNTS });
    });
  });

  test("mostra moeda, o líquido da instituição e a fatura negativa dos cartões", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(itemMeta(page, "Todas as contas")).toHaveText(/^R\$\s*243$/, {
      timeout: 30_000,
    });

    // "Todas as contas" = "Em contas": 420 + 73 − 250 (cartões e investimentos fora).
    const total = itemMeta(page, "Todas as contas");
    await expect(total).toHaveAttribute(
      "title",
      /Saldo das contas, sem faturas nem investimentos: R\$/,
    );

    // Instituição com cartão mostra o líquido: 420 − 200.
    const inter = itemMeta(page, "Banco Inter");
    await expect(inter).toHaveText(/^R\$\s*220$/);
    await expect(inter).toHaveAttribute("title", /^Líquido \(saldos − faturas\): /);
    // O contexto não fica só no title: leitores de tela ouvem a dica.
    await expect(sidebarItem(page, "Banco Inter")).toHaveAccessibleName(/R\$.*líquido/);

    const nubank = itemMeta(page, "Nubank");
    await expect(nubank).toHaveText(/^R\$\s*73$/);
    await expect(nubank).toHaveAttribute("title", /^Saldo: /);
    await expect(sidebarItem(page, "Nubank")).not.toHaveAccessibleName(/líquido|fatura aberta/);

    // Grupos só de cartão exibem a dívida, não "0".
    const itauCard = itemMeta(page, "Banco Itaú");
    await expect(itauCard).toHaveText(/^-R\$\s*1\.234$/);
    await expect(itauCard).toHaveClass(/text-negative/);
    await expect(itauCard).toHaveAttribute("title", /^Fatura aberta: /);
    await expect(sidebarItem(page, "Banco Itaú")).toHaveAccessibleName(/R\$.*fatura aberta/);

    const c6Card = itemMeta(page, "C6 Bank");
    await expect(c6Card).toHaveText(/^-R\$\s*12,34$/);
    await expect(c6Card).toHaveClass(/text-negative/);
  });

  test("conexão que pede atenção mantém o valor e não estoura a largura", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const nu = sidebarItem(page, "Nu Pagamentos");
    await expect(nu).toContainText("-R$", { timeout: 30_000 });
    await expect(nu.getByRole("img", { name: "Conexão precisa de atenção" })).toBeVisible();
    await expect(nu.locator('[data-slot="sidebar-item-meta"]')).toHaveText(/^-R\$\s*250$/);

    // O nome longo trunca com o texto completo no tooltip do nome.
    const name = nu.getByText(NU_INSTITUTION, { exact: true });
    await expect(name).toHaveAttribute("title", NU_INSTITUTION);
    expect(await name.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

    const problems = await sidebarOf(page).evaluate((element) => {
      const found: string[] = [];
      const bounds = element.getBoundingClientRect();

      for (const meta of element.querySelectorAll<HTMLElement>('[data-slot="sidebar-item-meta"]')) {
        if (meta.scrollWidth > meta.clientWidth + 1) {
          found.push(`valor truncado: ${meta.textContent}`);
        }
        if (meta.getBoundingClientRect().right > bounds.right - 12) {
          found.push(`valor encosta na borda direita: ${meta.textContent}`);
        }
      }

      for (const link of element.querySelectorAll<HTMLElement>('a[href="/accounts"]')) {
        if (link.scrollWidth > link.clientWidth + 1) {
          found.push(`linha estoura a sidebar: ${link.textContent}`);
        }
      }

      return found;
    });

    expect(problems).toEqual([]);
  });

  test("modo Ocultar valores mascara os valores da sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const inter = sidebarItem(page, "Banco Inter");
    await expect(inter).toContainText("R$", { timeout: 30_000 });

    await page.getByRole("button", { name: "Ocultar valores" }).click();

    const masked = itemMeta(page, "Banco Inter");
    await expect(masked).toHaveText("••••");
    await expect(masked).not.toHaveAttribute("title");
    // Quem lê a máscara é o texto "Valor oculto", nunca um número, e a dica
    // "líquido" também some junto com o valor.
    await expect(sidebarItem(page, "Banco Inter")).toHaveAccessibleName(/Valor oculto/);
    await expect(sidebarItem(page, "Banco Inter")).not.toHaveAccessibleName(/líquido/);
    await expect(itemMeta(page, "Banco Itaú")).toHaveText("••••");
    await expect(sidebarItem(page, "Banco Itaú")).not.toHaveAccessibleName(/fatura aberta/);
    // Máscara não é dívida: nada de vermelho com os valores ocultos.
    await expect(itemMeta(page, "Banco Itaú")).not.toHaveClass(/text-negative/);
  });
});
