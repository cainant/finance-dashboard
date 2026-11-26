import { expect, test, type Page } from "@playwright/test";

import { ensureDemoData } from "./demo-data";

test("shell: sidebar navega entre as páginas e o título acompanha a rota", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Seções do painel" })).toBeVisible();

  await page.getByRole("link", { name: "Contas", exact: true }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contas", exact: true })).toHaveAttribute(
    "data-status",
    "active",
  );

  await page.getByRole("link", { name: "Transações", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(page.getByRole("heading", { level: 1, name: "Transações" })).toBeVisible();

  await page.getByRole("link", { name: "Análises", exact: true }).click();
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole("heading", { level: 1, name: "Análises" })).toBeVisible();
});

test("shell: sidebar recolhe, persiste e volta a expandir", async ({ page }) => {
  await page.goto("/");

  const sidebar = page.locator('[data-slot="app-sidebar"]');
  await expect(sidebar).toHaveAttribute("data-collapsed", "false");

  await page.getByRole("button", { name: "Recolher menu lateral" }).click();
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  await expect(page.getByRole("button", { name: "Expandir menu lateral" })).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-slot="app-sidebar"]')).toHaveAttribute("data-collapsed", "true");

  await page.getByRole("button", { name: "Expandir menu lateral" }).click();
  await expect(page.locator('[data-slot="app-sidebar"]')).toHaveAttribute(
    "data-collapsed",
    "false",
  );
});

test("tema: dark por padrão, alterna para light e persiste sem flash", async ({ page }) => {
  await page.goto("/");

  const html = page.locator("html");
  await expect(html).toHaveClass(/dark/);
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "dark");

  await page.getByRole("button", { name: "Ativar tema claro" }).click();
  await expect(html).not.toHaveClass(/dark/);
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "light");
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("lumen:theme")))
    .toBe("light");

  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "Ativar tema escuro" })).toBeVisible();
});

test("período: presets viram search params e sobrevivem à navegação", async ({ page }) => {
  await page.goto("/");

  // O controle vive no cabeçalho da página: toggles 7D/30D/90D/12M + menu.
  await page.getByRole("radio", { name: "Últimos 90 dias" }).click();
  await expect(page).toHaveURL(/\?period=90d$/);

  await page.getByRole("link", { name: "Transações", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions\?period=90d$/);

  await page.getByRole("button", { name: /^Período: / }).click();
  await page.getByRole("button", { name: "Este ano" }).click();
  await expect(page).toHaveURL(/\/transactions\?period=ytd$/);

  // Intervalo personalizado: aplica from/to e valida no schema.
  await page.getByRole("button", { name: /^Período: / }).click();
  await page.getByLabel("De", { exact: true }).fill("2026-01-01");
  await page.getByLabel("Até", { exact: true }).fill("2026-01-31");
  await page.getByRole("button", { name: "Aplicar período" }).click();
  await expect(page).toHaveURL(/period=custom/);
  await expect(page).toHaveURL(/from=2026-01-01/);
  await expect(page).toHaveURL(/to=2026-01-31/);
});

test("período: menu aberto na navegação não fecha quando a página termina de carregar", async ({
  page,
}) => {
  await page.goto("/");

  // Abre o menu logo após navegar, antes de a lista de transações carregar.
  await page.getByRole("link", { name: "Transações", exact: true }).click();
  await page.getByRole("button", { name: /^Período: / }).click();

  const yearPreset = page.getByRole("button", { name: "Este ano" });
  await expect(yearPreset).toBeVisible();

  // O menu pertence ao cabeçalho da página de destino e sobrevive ao fim do
  // carregamento (antes, a rota remontava e o popover fechava sozinho).
  await expect(page.getByRole("heading", { level: 1, name: "Transações" })).toBeVisible();
  await expect(page.locator('[data-slot="transactions-table"]').first()).toBeVisible();
  await expect(yearPreset).toBeVisible();

  await yearPreset.click();
  await expect(page).toHaveURL(/\/transactions\?period=ytd$/);
});

test("paleta: Ctrl+K abre e navega para uma seção", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();

  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog");
  await expect(palette).toBeVisible();
  await expect(palette.getByPlaceholder("Buscar telas, ações e contas…")).toBeVisible();

  await palette.getByRole("option", { name: "Transações", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(page.getByRole("heading", { level: 1, name: "Transações" })).toBeVisible();
});

test("paleta: Ocultar valores mascara as contas em R$ ••••", async ({ page, request }) => {
  await ensureDemoData(request);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();

  await page.getByRole("button", { name: "Ocultar valores" }).click();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog");
  await expect(palette).toBeVisible();

  // A seção Contas usa o mesmo formatador do resto do app: com a preferência
  // ligada, o valor é a máscara real (não blur) e anuncia "Valor oculto".
  const maskedAccountValue = palette
    .locator('[data-slot="command-shortcut"][aria-label="Valor oculto"]')
    .first();
  await expect(maskedAccountValue).toBeVisible();
  await expect(maskedAccountValue).toHaveText(/R\$\s*••••/);
});

test("valores: ocultar mascara os KPIs e persiste após recarregar", async ({ page }) => {
  await page.goto("/");

  const kpiValue = page.locator('[data-slot="kpi-card"]').first().locator('[data-slot="money"]');
  await expect(kpiValue).toContainText(/R\$/);

  await page.getByRole("button", { name: "Ocultar valores" }).click();
  await expect(kpiValue).toHaveText(/R\$\s*••••/);

  await page.reload();
  await expect(
    page.locator('[data-slot="kpi-card"]').first().locator('[data-slot="money"]'),
  ).toHaveText(/R\$\s*••••/);

  await page.getByRole("button", { name: "Mostrar valores" }).click();
});

test("filtro: Sem categoria vira search param e chip removível", async ({ page }) => {
  await page.goto("/transactions");

  await page.getByLabel("Filtrar por categoria").click();
  await page.getByRole("option", { name: "Sem categoria" }).click();

  await expect(page).toHaveURL(/uncategorized=true/);
  await expect(
    page.locator('[data-slot="filter-chip"]').filter({ hasText: "Sem categoria" }),
  ).toBeVisible();
});

test("mobile: barra de abas navega e a sidebar fica oculta", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.locator('[data-slot="app-sidebar"]')).toBeHidden();

  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Cartões", exact: true })
    .click();
  await expect(page).toHaveURL(/\/credit-cards$/);
  await expect(page.getByRole("heading", { level: 1, name: "Cartões" })).toBeVisible();
});

test.describe("acesso", () => {
  // Este bloco testa as telas públicas, sem o cookie salvo pelo setup.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login: valida campos e autentica com o usuário demo", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();

    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByText("Informe um e-mail válido")).toBeVisible();
    await expect(page.getByText("Informe a senha")).toBeVisible();

    await page.getByLabel("E-mail").fill("demo@finance.local");
    await page.getByLabel("Senha").fill("demo1234");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();
  });

  test("guard: rota protegida redireciona para o login com redirect", async ({ page }) => {
    await page.goto("/transactions");

    await expect(page).toHaveURL(/\/login\?redirect=/);
    await expect(page.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();
  });

  test("setup: com usuário existente, redireciona para o login", async ({ page }) => {
    await page.goto("/setup");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();
  });
});

test("404: rota inexistente oferece volta para a visão geral", async ({ page }) => {
  await page.goto("/rota-que-nao-existe");

  await expect(
    page.getByRole("heading", { level: 1, name: "Página não encontrada" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Ir para a visão geral" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();
});

test("API responde pelo proxy do Vite", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({ status: "ok" });
});

const SETTINGS_JARGON = [
  "search params",
  "primeiro paint",
  "sem flash",
  "endpoint",
  "simulado",
  "provider",
  "clientsecret",
  "itemid",
  "pt-br",
  "brl",
] as const;

const CONNECTIONS_JARGON = [
  "clientsecret",
  "connect token",
  "itemid",
  "opção avançada",
  "provider",
  "widget",
  "secret",
  "worker",
  "wrangler",
  "api",
] as const;

/**
 * Termos inteiros (`\b`): "api" não pode casar com "demo@finance.local" nem
 * com "meu.pluggy.ai", e a checagem por card nunca olha o nome/e-mail do
 * usuário.
 */
function findJargon(text: string, terms: readonly string[]): string | null {
  for (const term of terms) {
    const pattern = new RegExp(`\\b${term.replace(/ /g, "\\s+")}\\b`, "i");
    if (pattern.test(text)) {
      return term;
    }
  }

  return null;
}

async function expectNoJargon(page: Page, terms: readonly string[]): Promise<void> {
  for (const card of await page.locator('main [data-slot="card"]').all()) {
    const term = findJargon(await card.innerText(), terms);
    expect(term, `jargão "${term}" encontrado na tela`).toBeNull();
  }
}

function providersPayload(options: { configured: boolean; supportsConnectWidget: boolean }) {
  return {
    data: [
      {
        id: "pluggy",
        name: "Pluggy",
        configured: options.configured,
        description: "Open Finance via MeuPluggy: leitura dos seus próprios bancos.",
        supportsConnectWidget: options.supportsConnectWidget,
      },
    ],
  };
}

/**
 * Microcopy de usuário final: nada de jargão de implementação, nada de título
 * repetindo o botão e a segurança explicada em linguagem simples.
 */
test("textos: Configurações e Adicionar conexão sem jargão de implementação", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Configurações" })).toBeVisible();

  // "Providers" virou "Integrações" em pt-BR.
  await expect(page.getByRole("heading", { level: 2, name: "Integrações" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Providers" })).toHaveCount(0);

  // Tema: resumo legível, sem os códigos pt-BR/BRL e sem parágrafo repetido.
  await expect(
    page.getByText(/^Na sua conta: (Escuro|Claro|Sistema) · Português \(Brasil\) · Real/).first(),
  ).toBeVisible();

  // A linha leva descrição + botão: o verbo é o mesmo do antigo título.
  await expect(page.getByRole("button", { name: "Ver no painel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aplicar ao painel" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remover todas as conexões" })).toBeVisible();

  await expectNoJargon(page, SETTINGS_JARGON);

  await page.goto("/connections");
  await expect(page.getByRole("heading", { level: 1, name: "Conexões" })).toBeVisible();
  await expect(
    page.getByText(/Suas senhas bancárias nunca passam pelo Lumen/).first(),
  ).toBeVisible();

  // Ramo "não configurado": só a frase de usuário final aparece (o passo a
  // passo de credenciais/Worker/wrangler fica atrás de import.meta.env.DEV).
  await page.route("**/api/providers", async (route) => {
    await route.fulfill({
      json: providersPayload({ configured: false, supportsConnectWidget: true }),
    });
  });
  await page.reload();

  await expect(
    page.getByText("A conexão com o MeuPluggy ainda não está disponível."),
  ).toBeVisible();

  // Ramo configurado: bloco recolhido do código de conexão, sem jargão.
  await page.unroute("**/api/providers");
  await page.route("**/api/providers", async (route) => {
    await route.fulfill({
      json: providersPayload({ configured: true, supportsConnectWidget: true }),
    });
  });
  await page.reload();

  await page.getByText("Já conectou seus bancos no MeuPluggy?").click();
  await expect(page.getByLabel("Código da conexão")).toBeVisible();
  await expect(page.getByRole("button", { name: "Usar este código" })).toBeVisible();
  await expect(
    page.getByText(/senhas bancárias são digitadas na janela do MeuPluggy/).first(),
  ).toBeVisible();

  await expectNoJargon(page, CONNECTIONS_JARGON);
});
