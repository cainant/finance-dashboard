import { expect, test, type Page } from "@playwright/test";

import { ensureDemoData } from "./demo-data";

/**
 * Sidebar › Contas: cada instituição precisa abrir uma vista filtrada e ficar
 * ativa quando o filtro da URL corresponde a ela. O estado ativo é exposto em
 * `data-active` para não depender de classes utilitárias.
 */
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await ensureDemoData(request);
});

function visibleSidebar(page: Page) {
  const sidebar = page.locator('[data-slot="app-sidebar"]:visible');
  return sidebar;
}

test("cada instituição de Contas abre a lista filtrada e fica ativa", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();

  const sidebar = visibleSidebar(page);
  const allAccounts = sidebar.getByRole("link", { name: "Todas as contas" });
  await expect(allAccounts).toBeVisible({ timeout: 30_000 });
  await expect(allAccounts).toHaveAttribute("data-active", "false");
  await expect(allAccounts).toHaveAttribute("href", /^\/accounts$/);

  const institutions = sidebar.locator('a[data-slot="sidebar-account-group"]');
  await expect(institutions.first()).toBeVisible({ timeout: 30_000 });
  expect(await institutions.count()).toBeGreaterThanOrEqual(3);

  const hrefs = await institutions.evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );
  for (const href of hrefs) {
    expect(href, "sub-item sem filtro de conexão").toContain("connection=");
    expect(href).toMatch(/^\/accounts\?/);
  }
  // Dois itens nunca podem apontar para a mesma vista.
  expect(new Set(hrefs).size, "hrefs repetidos na sidebar").toBe(hrefs.length);

  const aurora = sidebar.getByRole("link", { name: "Banco Aurora" });
  await expect(aurora).toHaveAttribute("data-active", "false");
  await aurora.click();

  await expect(page).toHaveURL(/\/accounts\?.*connection=/);
  await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
  await expect(page.locator('[data-slot="institution-card"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="institution-card"]')).toContainText("Banco Aurora");
  await expect(aurora).toHaveAttribute("data-active", "true");
  await expect(allAccounts).toHaveAttribute("data-active", "false");
  // `aria-current="page"` não pode vazar para "Todas as contas" por match
  // parcial de search, e só um sub-item pode ser a página atual.
  await expect(aurora).toHaveAttribute("aria-current", "page");
  await expect(allAccounts).not.toHaveAttribute("aria-current", "page");
  await expect(
    sidebar.locator(
      'a[data-slot="sidebar-account-group"][aria-current="page"], a[data-slot="sidebar-all-accounts"][aria-current="page"]',
    ),
  ).toHaveCount(1);

  // O estado ativo vem da URL: sobrevive a um reload direto no filtro.
  await page.reload();
  await expect(sidebar.getByRole("link", { name: "Banco Aurora" })).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(page.locator('[data-slot="institution-card"]')).toHaveCount(1);

  // A busca local é do usuário e continua ao trocar de instituição; o estado
  // vazio passa a citar o recorte atual para o resultado não parecer bug.
  const searchBox = page.getByRole("searchbox", { name: "Buscar contas" });
  await searchBox.fill("poupança");
  await expect(page.locator('[data-slot="institution-card"]')).toHaveCount(1);
  await sidebar.getByRole("link", { name: "Nuvem Bank" }).click();
  await expect(page.getByText("Nenhuma conta de Nuvem Bank com esses filtros")).toBeVisible();
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.locator('[data-slot="institution-card"]')).toHaveCount(3);

  // O chip "Ver todas as contas" limpa o recorte e devolve o foco à busca.
  await sidebar.getByRole("link", { name: "Banco Aurora" }).click();
  await expect(page).toHaveURL(/\/accounts\?.*connection=/);
  await page.getByRole("link", { name: "Ver todas as contas" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.locator('[data-slot="institution-card"]')).toHaveCount(3);
  await expect(searchBox).toBeFocused();

  // "Todas as contas" na sidebar também volta para a lista completa.
  await sidebar.getByRole("link", { name: "Banco Aurora" }).click();
  await expect(page).toHaveURL(/\/accounts\?.*connection=/);
  await sidebar.getByRole("link", { name: "Todas as contas" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.locator('[data-slot="institution-card"]')).toHaveCount(3);
  await expect(allAccounts).toHaveAttribute("data-active", "true");
  await expect(allAccounts).toHaveAttribute("aria-current", "page");
  await expect(sidebar.getByRole("link", { name: "Banco Aurora" })).toHaveAttribute(
    "data-active",
    "false",
  );
  await expect(sidebar.getByRole("link", { name: "Banco Aurora" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("filtro de instituição inexistente é limpo da URL", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/accounts?connection=nao-existe&institution=Banco+Fantasma");

  await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
  // O recorte inválido não fica na barra de endereço nem deixa a sidebar sem item ativo.
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.locator('[data-slot="institution-card"]')).toHaveCount(3);
  const allAccounts = visibleSidebar(page).getByRole("link", { name: "Todas as contas" });
  await expect(allAccounts).toHaveAttribute("data-active", "true");
  await expect(allAccounts).toHaveAttribute("aria-current", "page");
});
