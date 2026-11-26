import { expect, test, type Page } from "@playwright/test";

import { ensureDemoData } from "./demo-data";

/**
 * Regressões de layout: valores grandes nos KPIs (5 colunas) e páginas em
 * mobile/tablet sem overflow horizontal. O banco do CI começa sem dados demo,
 * então o setup garante o dataset antes de medir.
 */
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await ensureDemoData(request);
});

async function waitForOverviewData(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();
  await expect(
    page.locator('[data-slot="kpi-card"]').first().locator('[data-slot="money"]'),
  ).toContainText(/R\$/, { timeout: 30_000 });
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('[data-slot="skeleton"]')].some((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }),
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(250);
}

for (const width of [1280, 1440, 1920]) {
  test(`KPIs não estouram o card em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await waitForOverviewData(page);

    const problems = await page.evaluate(() => {
      const found: string[] = [];
      const viewportOverflow = document.documentElement.scrollWidth - window.innerWidth;
      if (viewportOverflow > 1) {
        found.push(`página com overflow horizontal de ${viewportOverflow}px`);
      }

      for (const card of document.querySelectorAll<HTMLElement>('[data-slot="kpi-card"]')) {
        const cardRect = card.getBoundingClientRect();
        const label =
          card.querySelector<HTMLElement>('[data-slot="money"]')?.textContent?.trim() ??
          card.textContent?.trim().slice(0, 40) ??
          "KPI";

        if (card.scrollWidth > card.clientWidth + 1) {
          found.push(`"${label}" estoura o card (${card.scrollWidth} > ${card.clientWidth})`);
        }

        const money = card.querySelector<HTMLElement>('[data-slot="money"]');
        if (money) {
          const moneyRect = money.getBoundingClientRect();
          // 20px é o padding interno (p-5); exigimos uma folga real, não só
          // que o texto termine antes da borda externa.
          if (moneyRect.right > cardRect.right - 16) {
            found.push(
              `"${label}" encosta na borda (${Math.round(moneyRect.right)} vs ${Math.round(cardRect.right)}`,
            );
          }
          if (moneyRect.left < cardRect.left + 12) {
            found.push(`"${label}" encosta na borda esquerda`);
          }
        }
      }

      return found;
    });

    expect(problems).toEqual([]);
  });
}

for (const viewport of [
  { width: 390, height: 844, label: "mobile" },
  { width: 768, height: 1024, label: "tablet" },
]) {
  test(`páginas sem overflow horizontal no ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    const pages: Array<{ path: string; heading: string }> = [
      { path: "/", heading: "Visão geral" },
      { path: "/accounts", heading: "Contas" },
      { path: "/transactions", heading: "Transações" },
      { path: "/credit-cards", heading: "Cartões" },
      { path: "/analytics", heading: "Análises" },
      { path: "/connections", heading: "Conexões" },
      { path: "/settings", heading: "Configurações" },
    ];

    for (const { path, heading } of pages) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll('[data-slot="skeleton"]')].some((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }),
        null,
        { timeout: 30_000 },
      );
      await page.waitForTimeout(150);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${heading} em ${viewport.width}px`).toBeLessThanOrEqual(1);
    }
  });
}

test("sidebar: saldos e status cabem nos 256px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const sidebar = page.locator('[data-slot="app-sidebar"]');
  await expect(sidebar).toBeVisible();
  await expect(sidebar.locator('[data-slot="sidebar-item-meta"]').first()).toBeVisible();
  await expect(sidebar.locator('[data-slot="sidebar-sync-text"]')).toContainText("Sincronizado");

  const problems = await page.evaluate(() => {
    const found: string[] = [];
    const element = document.querySelector<HTMLElement>('[data-slot="app-sidebar"]');
    if (!element) {
      return ["sidebar não encontrada"];
    }

    const bounds = element.getBoundingClientRect();
    // Só o grupo Contas mostra dinheiro; o grupo Cartões mostra prazo ("vence em 3 d").
    const accountsGroup = element
      .querySelector<HTMLElement>('a[aria-label="Contas"]')
      ?.closest("li");

    for (const meta of element.querySelectorAll<HTMLElement>('[data-slot="sidebar-item-meta"]')) {
      const rect = meta.getBoundingClientRect();
      const text = meta.textContent?.trim() ?? "";
      // Valores de conta são dinheiro: nunca um número solto (parecia contagem).
      if (accountsGroup?.contains(meta) && !/^-?R\$\s/.test(text)) {
        found.push(`valor sem moeda: ${text}`);
      }
      if (meta.scrollWidth > meta.clientWidth + 1) {
        found.push(`valor truncado: ${meta.textContent}`);
      }
      if (rect.right > bounds.right - 12) {
        found.push(`valor encosta na borda direita: ${meta.textContent}`);
      }
    }

    const status = element.querySelector<HTMLElement>('[data-slot="sidebar-sync-text"]');
    if (status && status.scrollWidth > status.clientWidth + 1) {
      found.push(`status truncado: ${status.textContent}`);
    }

    return found;
  });

  expect(problems).toEqual([]);
});

test("transações usam cartões no mobile, sem overflow horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { level: 1, name: "Transações" })).toBeVisible();
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('[data-slot="skeleton"]')].some((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }),
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(150);

  // A tabela larga não é montada abaixo de `md`; a lista de cartões assume.
  await expect(page.locator('[data-slot="transactions-table"]')).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);

  const cards = page.locator('[data-slot="transactions-cards"]');
  await expect(cards).toBeVisible();

  // No mobile a busca ocupa a linha inteira e os demais filtros descem.
  const searchBox = await page.getByRole("searchbox", { name: "Buscar transações" }).boundingBox();
  const typeFilter = await page.locator('[data-kind="all"]').boundingBox();
  expect(searchBox?.width ?? 0).toBeGreaterThan(340);
  expect(typeFilter?.y ?? 0).toBeGreaterThan((searchBox?.y ?? 0) + (searchBox?.height ?? 0));

  // O dia também é um item de lista (com o h3); a linha é a que tem `data-swipe`.
  const firstCard = cards.locator("li[data-swipe]").first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard.locator('[data-slot="transaction-description"]')).toHaveText(/\S/);
  await expect(firstCard.locator('[data-slot="transaction-category"]')).toHaveText(/\S/);
  await expect(firstCard.getByRole("button", { name: /^Ver detalhes de/ })).toBeVisible();
  await expect(firstCard.locator('[data-slot="money"]')).toContainText(/R\$/);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "transações em 390px").toBeLessThanOrEqual(1);
});

/**
 * Regressão M11: o cabeçalho ocupava duas linhas no mobile (~430px) e o título
 * aparecia duas vezes (topbar + h1). Com conexão ativa, "Conectar conta" não é
 * mais o CTA azul do cabeçalho.
 */
test("cabeçalho no mobile: ações numa linha, um título e conectar como secundária", async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 932 });

  for (const { path, heading } of [
    { path: "/", heading: "Visão geral" },
    { path: "/transactions", heading: "Transações" },
    { path: "/accounts", heading: "Contas" },
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();

    // Título uma única vez: a barra superior não repete o h1 da página.
    await expect(
      page.locator('[data-slot="app-topbar"]').getByText(heading, { exact: true }),
    ).toHaveCount(0);

    // Todas as ações do cabeçalho dividem a mesma linha. Alturas diferentes
    // (controles de 32px e botões de 36px) são centralizadas no `items-center`;
    // quebrar linha joga o topo de 32px para baixo.
    const actions = page.locator('[data-slot="page-header-actions"] > *');
    await expect(actions.first()).toBeVisible();
    const tops = await actions.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().top),
    );
    expect(
      Math.max(...tops) - Math.min(...tops),
      `${heading}: ações do cabeçalho em mais de uma linha`,
    ).toBeLessThan(8);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${heading} em 430px`).toBeLessThanOrEqual(1);
  }

  // Com conexões demo, o convite a conectar é secundário (outline). O selo
  // "Demonstração" (deriva da query de conexões) marca o dado carregado.
  await page.goto("/transactions");
  await expect(page.locator('[data-slot="page-header"] [data-slot="demo-badge"]')).toBeVisible();
  await expect(page.getByRole("link", { name: "Conectar conta", exact: true })).toHaveAttribute(
    "data-variant",
    "outline",
  );
});

/**
 * Regressão da revisão do M11: sem esperar `/api/connections`, o CTA ficava
 * azul no primeiro paint (dados ainda indefinidos) e piscava para secundário
 * quando a resposta chegava. Numa consulta lenta ele nunca deve ser primário.
 */
test("conectar não pisca como primária enquanto /api/connections não responde", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  let release: () => void = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route("**/api/connections", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await released;
    await route.continue();
  });

  await page.goto("/transactions");
  await expect(page.getByRole("heading", { level: 1, name: "Transações" })).toBeVisible();

  const connect = page.getByRole("link", { name: "Conectar conta", exact: true });
  await expect(connect).toBeVisible();
  await expect(connect).toHaveAttribute("data-variant", "outline", { timeout: 5_000 });

  release();

  // Depois da resposta (com conexões demo) continua secundária.
  await expect(page.locator('[data-slot="page-header"] [data-slot="demo-badge"]')).toBeVisible();
  await expect(connect).toHaveAttribute("data-variant", "outline");
});
