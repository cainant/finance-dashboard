import { expect, test, type Page } from "@playwright/test";

import { ensureDemoData } from "./demo-data";

/**
 * Shell mobile (abaixo de `lg`): barra de abas inferior, tela "Mais" e barra
 * superior de vidro. O desktop não muda e é coberto pelos demais specs.
 */
test.setTimeout(120_000);
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test.beforeAll(async ({ request }) => {
  await ensureDemoData(request);
});

const tabBar = (page: Page) => page.getByRole("navigation", { name: "Navegação principal" });

const TABS = [
  { name: "Visão geral", path: "/", heading: "Visão geral" },
  { name: "Transações", path: "/transactions", heading: "Transações" },
  { name: "Contas", path: "/accounts", heading: "Contas" },
  { name: "Cartões", path: "/credit-cards", heading: "Cartões" },
  { name: "Mais", path: "/more", heading: "Mais" },
] as const;

async function waitForSkeletonsGone(page: Page) {
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('[data-slot="skeleton"]')].some((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }),
    null,
    { timeout: 30_000 },
  );
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `${label}: overflow horizontal`).toBeLessThanOrEqual(1);
}

test("barra de abas navega pelos 5 destinos e marca a aba ativa", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();

  // Sem menu hambúrguer nem Sheet lateral.
  await expect(page.getByRole("button", { name: "Abrir menu de navegação" })).toHaveCount(0);
  await expect(tabBar(page).getByRole("link")).toHaveCount(5);

  for (const tab of TABS) {
    await tabBar(page).getByRole("link", { name: tab.name, exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === tab.path);
    await expect(page.getByRole("heading", { level: 1, name: tab.heading })).toBeVisible();

    const current = tabBar(page).locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAccessibleName(tab.name);

    // Alvo de toque mínimo de 44px.
    const box = await tabBar(page).getByRole("link", { name: tab.name, exact: true }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);

    await expectNoHorizontalOverflow(page, tab.name);
  }
});

test("as abas preservam o período da URL", async ({ page }) => {
  await page.goto("/transactions?period=custom&from=2026-09-01&to=2026-09-30");
  await expect(page.getByRole("heading", { level: 1, name: "Transações" })).toBeVisible();

  await tabBar(page).getByRole("link", { name: "Contas", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/accounts");
  const accountsUrl = new URL(page.url());
  expect(accountsUrl.searchParams.get("period")).toBe("custom");
  expect(accountsUrl.searchParams.get("from")).toBe("2026-09-01");
  expect(accountsUrl.searchParams.get("to")).toBe("2026-09-30");

  await tabBar(page).getByRole("link", { name: "Mais", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mais" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("period")).toBe("custom");
});

test("rota filha mantém a aba pai ativa e mostra o botão voltar", async ({ page }) => {
  await page.goto("/accounts");
  await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
  await page
    .getByRole("link", { name: /Conta Corrente/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/accounts\/[^/?]+/);
  await expect(page.getByRole("heading", { level: 1, name: "Conta Corrente" })).toBeVisible();

  await expect(tabBar(page).locator('[aria-current="page"]')).toHaveAccessibleName("Contas");

  const back = page.getByRole("link", { name: "Voltar para Contas" });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL((url) => url.pathname === "/accounts");
});

test("tela Mais leva a Análises, Conexões e Configurações e as abas ficam sob Mais", async ({
  page,
}) => {
  const destinations = [
    { link: "Análises", heading: "Análises", path: "/analytics" },
    { link: "Conexões", heading: "Conexões", path: "/connections" },
    { link: "Configurações", heading: "Configurações", path: "/settings" },
  ];

  for (const destination of destinations) {
    await page.goto("/more");
    await expect(page.getByRole("heading", { level: 1, name: "Mais" })).toBeVisible();
    await page.getByRole("main").getByRole("link", { name: destination.link }).click();
    await expect(page).toHaveURL((url) => url.pathname === destination.path);
    await expect(page.getByRole("heading", { level: 1, name: destination.heading })).toBeVisible();
    // Páginas sob "Mais" acendem a aba Mais.
    await expect(tabBar(page).locator('[aria-current="page"]')).toHaveAccessibleName("Mais");
  }
});

test("Mais concentra tema, ocultar valores e busca", async ({ page }) => {
  await page.goto("/more");
  await expect(page.getByRole("heading", { level: 1, name: "Mais" })).toBeVisible();

  // O toggle de tema saiu da barra superior no mobile.
  await expect(page.getByRole("button", { name: /^Ativar tema/ })).toBeHidden();

  const dark = page.getByRole("switch", { name: "Tema escuro" });
  const wasDark = (await dark.getAttribute("aria-checked")) === "true";
  await dark.click();
  await expect(dark).toHaveAttribute("aria-checked", String(!wasDark));
  await dark.click();
  await expect(dark).toHaveAttribute("aria-checked", String(wasDark));

  const hide = page.getByRole("switch", { name: "Ocultar valores" });
  await hide.click();
  await expect(hide).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "Mostrar valores" })).toBeVisible();
  await hide.click();

  await page.getByRole("main").getByRole("button", { name: "Buscar ou ir para…" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("barra superior mostra o título compacto só depois do h1 sair da tela", async ({ page }) => {
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { level: 1, name: "Transações" })).toBeVisible();

  const compact = page.locator('[data-slot="topbar-compact-title"]');
  await expect(compact).toHaveCount(0);

  await waitForSkeletonsGone(page);
  await expect
    .poll(async () => {
      await page.evaluate(() => window.scrollTo(0, 400));
      return compact.count();
    })
    .toBe(1);
  await expect(compact).toHaveText("Transações");

  // Tocar na aba já ativa volta ao topo.
  await tabBar(page).getByRole("link", { name: "Transações", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
  await expect(compact).toHaveCount(0);
});

test("controles da barra superior têm alvo de toque de 44px", async ({ page }) => {
  await page.goto("/accounts");
  await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();

  const controls = [
    page.getByRole("button", { name: "Ocultar valores" }),
    page.getByRole("button", { name: /^Abrir menu da conta/ }),
  ];
  await page
    .getByRole("link", { name: /Conta Corrente/ })
    .first()
    .click();
  await expect(page.getByRole("link", { name: "Voltar para Contas" })).toBeVisible();
  controls.push(page.getByRole("link", { name: "Voltar para Contas" }));

  for (const control of controls) {
    const box = await control.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("tocar na aba ativa a partir de uma rota filha volta à raiz da aba", async ({ page }) => {
  await page.goto("/accounts");
  await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
  await page
    .getByRole("link", { name: /Conta Corrente/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/accounts\/[^/?]+/);

  await tabBar(page).getByRole("link", { name: "Contas", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/accounts");
  await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
});

test("Mais: Sincronizar agora sincroniza a conexão", async ({ page }) => {
  await page.goto("/more");
  await expect(page.getByRole("heading", { level: 1, name: "Mais" })).toBeVisible();
  const sync = page.getByRole("button", { name: "Sincronizar agora" });
  await expect(sync).toBeEnabled({ timeout: 30_000 });
  await sync.click();
  await expect(page.getByText("Sincronização concluída")).toBeVisible({ timeout: 90_000 });
});

test("Mais: contas por instituição levam a Contas com o filtro aplicado", async ({ page }) => {
  await page.goto("/more");
  await expect(page.getByRole("heading", { level: 1, name: "Mais" })).toBeVisible();
  const group = page.getByRole("region", { name: "Contas por instituição" });
  const first = group.getByRole("link").first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  const name = (await first.locator("span.truncate").innerText()).trim();
  await first.click();

  await expect(page).toHaveURL((url) => url.pathname === "/accounts" && url.search.length > 1);
  await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
  await expect(page.locator('[data-slot="accounts-institution-filter"]')).toContainText(name);
});

test("o conteúdo termina acima da barra de abas, sem overflow horizontal", async ({ page }) => {
  for (const tab of TABS) {
    await page.goto(tab.path);
    await expect(page.getByRole("heading", { level: 1, name: tab.heading })).toBeVisible();
    await waitForSkeletonsGone(page);
    // Rola ao fim a cada tentativa: a página pode crescer depois (listas que
    // chegam da API) e o fim do conteúdo nunca pode ficar sob a cápsula.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            const wrapper = document.querySelector("main > div");
            const bar = document.querySelector('[data-slot="mobile-tab-bar"] ul');
            return bar && wrapper
              ? bar.getBoundingClientRect().top - wrapper.getBoundingClientRect().bottom
              : -999;
          }),
        { timeout: 15_000, message: `${tab.name}: conteúdo escondido pela barra de abas` },
      )
      .toBeGreaterThanOrEqual(0);

    await expectNoHorizontalOverflow(page, tab.name);
  }
});

test("no desktop não há barra de abas", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();
  await expect(page.locator('[data-slot="mobile-tab-bar"]')).toBeHidden();
  await expect(page.getByRole("complementary", { name: "Navegação principal" })).toBeVisible();
});
