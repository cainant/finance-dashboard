import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { ensureDemoData } from "./demo-data";

/**
 * Visão geral mobile (abaixo de `lg`): KPIs e listas tocáveis com o período da
 * URL preservado, scrub do gráfico de patrimônio e ausência de overflow.
 */
test.setTimeout(120_000);
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test.beforeAll(async ({ request }) => {
  await ensureDemoData(request);
});

const PERIOD = "period=custom&from=2026-09-01&to=2026-09-30";

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

async function openOverview(page: Page, search = PERIOD) {
  await page.goto(`/?${search}`);
  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();
  await waitForSkeletonsGone(page);
}

function expectPeriod(url: URL) {
  expect(url.searchParams.get("period")).toBe("custom");
  expect(url.searchParams.get("from")).toBe("2026-09-01");
  expect(url.searchParams.get("to")).toBe("2026-09-30");
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `${label}: overflow horizontal`).toBeLessThanOrEqual(1);
}

test("Receitas e Despesas levam a Transações por tipo, com o período", async ({ page }) => {
  const cases = [
    { name: /Receitas/, type: "income" },
    { name: /Despesas/, type: "expense" },
  ];

  for (const item of cases) {
    await openOverview(page);
    await page
      .locator('[data-slot="overview-kpis"]')
      .getByRole("link", { name: item.name })
      .click();
    await expect(page).toHaveURL((url) => url.pathname === "/transactions");
    const url = new URL(page.url());
    expectPeriod(url);
    expect(url.searchParams.get("type")).toBe(item.type);
    await expect(page.getByRole("heading", { level: 1, name: "Transações" })).toBeVisible();
  }
});

test("Resultado e Poupança levam a Análises, com o período", async ({ page }) => {
  for (const name of [/Resultado/, /Poupança/]) {
    await openOverview(page);
    await page.locator('[data-slot="overview-kpis"]').getByRole("link", { name }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/analytics");
    expectPeriod(new URL(page.url()));
    await expect(page.getByRole("heading", { level: 1, name: "Análises" })).toBeVisible();
  }
});

test("categoria leva a Transações filtrada por ela, só despesas, com o período", async ({
  page,
}) => {
  await openOverview(page, "");
  const rows = page.locator('[data-slot="overview-category-row"]');
  // Sem período explícito na URL, o link não inventa um.
  await expect(rows.first()).toBeVisible();
  await rows.first().click();
  await expect(page).toHaveURL((url) => url.pathname === "/transactions");
  expect(new URL(page.url()).searchParams.get("type")).toBe("expense");
  expect(
    new URL(page.url()).searchParams.get("categoryId") ??
      new URL(page.url()).searchParams.get("uncategorized"),
  ).toBeTruthy();

  await openOverview(page);
  await rows.first().click();
  await expect(page).toHaveURL((url) => url.pathname === "/transactions");
  expectPeriod(new URL(page.url()));
  expect(new URL(page.url()).searchParams.get("type")).toBe("expense");
});

test("conta leva ao detalhe da conta", async ({ page }) => {
  await openOverview(page);

  const account = page.locator('[data-slot="overview-account-row"]').first();
  await expect(account).toBeVisible();
  await account.click();
  await expect(page).toHaveURL(/\/accounts\/[^/?]+/);
  expectPeriod(new URL(page.url()));
});

interface CardSummary {
  accountId: string;
  account: { name: string };
}
interface BillSummary {
  id: string;
}

/** Confere que o cartão e a fatura do link estão abertos na tela de detalhe. */
async function expectCardAndBillOpen(
  page: Page,
  request: APIRequestContext,
  target: { accountId: string; billId: string },
) {
  await expect(page).toHaveURL((url) => url.pathname === `/credit-cards/${target.accountId}`);
  const url = new URL(page.url());
  expectPeriod(url);
  expect(url.searchParams.get("bill")).toBe(target.billId);
  expect(url.searchParams.has("card")).toBe(false);

  const cards = ((await (await request.get("/api/credit-cards")).json()) as { data: CardSummary[] })
    .data;
  const card = cards.find((item) => item.accountId === target.accountId);
  expect(card).toBeTruthy();
  await expect(page.getByRole("heading", { level: 1, name: card!.account.name })).toBeVisible();

  const bills = (
    (await (await request.get(`/api/credit-cards/${target.accountId}/bills`)).json()) as {
      data: BillSummary[];
    }
  ).data;
  const index = bills.findIndex((bill) => bill.id === target.billId);
  expect(index).toBeGreaterThanOrEqual(0);

  const rows = page.locator('[data-slot="credit-card-detail"] [data-slot="bill-row"]');
  await expect(rows.nth(index)).toHaveAttribute("aria-pressed", "true");
  await expect(rows.locator('xpath=self::*[@aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="bill-transactions"]')).toBeVisible();
}

async function firstOverviewBill(page: Page) {
  const bill = page.locator('[data-slot="overview-bill-row"]').first();
  await expect(bill).toBeVisible();
  const href = (await bill.getAttribute("href")) ?? "";
  const match = /\/credit-cards\/([^/?]+)\?.*bill=([^&]+)/.exec(href);
  expect(match, `href da fatura: ${href}`).toBeTruthy();

  return { bill, accountId: match![1]!, billId: decodeURIComponent(match![2]!) };
}

test("fatura abre o cartão e a fatura certos; voltar retorna à Visão geral", async ({
  page,
  request,
}) => {
  await openOverview(page);
  const first = await firstOverviewBill(page);
  const target = { accountId: first.accountId, billId: first.billId };

  // Botão voltar da barra superior (volta no histórico).
  await first.bill.click();
  await expectCardAndBillOpen(page, request, target);
  await page.getByRole("link", { name: "Voltar para Visão geral" }).tap();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  expectPeriod(new URL(page.url()));
  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();

  // Gesto/botão voltar do navegador.
  await waitForSkeletonsGone(page);
  await page.locator('[data-slot="overview-bill-row"]').first().click();
  await expectCardAndBillOpen(page, request, target);
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();
});

test("fatura da faixa de atenção abre o cartão e a fatura certos", async ({ page, request }) => {
  const upcoming = (await (await request.get("/api/bills/upcoming?days=30&limit=5")).json()) as {
    data: { id: string; accountId: string; daysUntilDue: number; estimated: boolean }[];
  };
  const due = upcoming.data.find((bill) => bill.daysUntilDue <= 7 && !bill.estimated);
  test.skip(!due, "o seed não tem fatura real vencendo em até 7 dias: a faixa não mostra o item");

  await openOverview(page);
  const attention = page.locator('[data-slot="overview-attention"]');
  await expect(attention).toBeVisible();
  const link = attention.locator(`a[href*="/credit-cards/${due!.accountId}"]`).first();
  await expect(link).toBeVisible();
  expect(await link.getAttribute("href")).toContain(`bill=${due!.id}`);

  await link.tap();
  await expectCardAndBillOpen(page, request, { accountId: due!.accountId, billId: due!.id });
});

test("link antigo /credit-cards?card=&bill= abre o detalhe no mobile, sem entrada extra", async ({
  page,
  request,
}) => {
  await openOverview(page);
  const first = await firstOverviewBill(page);
  const before = await page.evaluate(() => history.length);

  await page.goto(
    `/credit-cards?${PERIOD}&card=${first.accountId}&bill=${encodeURIComponent(first.billId)}`,
  );
  await expectCardAndBillOpen(page, request, { accountId: first.accountId, billId: first.billId });
  // `replace`: a lista nunca entra no histórico (só a navegação do goto).
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(before + 1);

  // Cartão inexistente cai na lista, sem erro.
  await page.goto(`/credit-cards?${PERIOD}&card=inexistente&bill=x`);
  await expect(page).toHaveURL((url) => url.pathname === "/credit-cards");
  await expect(page.getByRole("heading", { level: 1, name: "Cartões" })).toBeVisible();
  await expect(page.locator('[data-slot="credit-card-row"]').first()).toBeVisible();
});

test("no desktop ?card=&bill= continua selecionando na própria página de Cartões", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const cards = ((await (await request.get("/api/credit-cards")).json()) as { data: CardSummary[] })
    .data;
  const accountId = cards[0]!.accountId;
  const bills = (
    (await (await request.get(`/api/credit-cards/${accountId}/bills`)).json()) as {
      data: BillSummary[];
    }
  ).data;
  const index = bills.length > 1 ? 1 : 0;

  await page.goto(
    `/credit-cards?${PERIOD}&card=${accountId}&bill=${encodeURIComponent(bills[index]!.id)}`,
  );
  await expect(page.locator('[data-slot="bills-card"]')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/credit-cards");
  await expect(
    page.locator('[data-slot="bills-card"] [data-slot="bill-row"]').nth(index),
  ).toHaveAttribute("aria-pressed", "true");
});

test("links da Visão geral têm alvo de toque de 44px", async ({ page }) => {
  await openOverview(page);
  const selectors = [
    '[data-slot="overview-kpis"] a',
    '[data-slot="overview-category-row"]',
    '[data-slot="overview-account-row"]',
    '[data-slot="overview-balance-link"]',
  ];

  for (const selector of selectors) {
    const links = page.locator(selector);
    const count = await links.count();
    expect(count, selector).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const box = await links.nth(index).boundingBox();
      expect(box?.height ?? 0, selector).toBeGreaterThanOrEqual(44);
    }
  }
});

test("scrub no gráfico troca o valor em destaque e restaura ao soltar", async ({ page }) => {
  await openOverview(page);

  const hero = page.locator('[data-slot="hero-value"]');
  const chart = page.locator('[data-slot="net-worth-scrub"]');
  await expect(chart).toBeVisible();
  const current = (await hero.innerText()).trim();
  const currentDelta = (await page.locator('[data-slot="hero-delta"]').textContent()) ?? "";

  // A rolagem vertical iniciada sobre o gráfico continua com o navegador.
  await expect(chart).toHaveCSS("touch-action", "pan-y");

  const box = (await chart.boundingBox())!;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number | null) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: x === null ? [] : [{ x, y }],
    });

  await touch("touchStart", box.x + box.width - 4);
  for (let step = 1; step <= 12; step += 1) {
    await touch("touchMove", box.x + box.width - 4 - (box.width * step) / 14);
  }

  await expect.poll(async () => (await hero.innerText()).trim()).not.toBe(current);
  await expect(page.locator('[data-slot="hero-delta"]')).toContainText("até ");

  await touch("touchEnd", null);
  await expect.poll(async () => (await hero.innerText()).trim()).toBe(current);
  await expect
    .poll(() => page.locator('[data-slot="hero-delta"]').textContent())
    .toBe(currentDelta);
});

test("com valores ocultos o scrub não revela o patrimônio", async ({ page }) => {
  await openOverview(page);
  await page.getByRole("button", { name: "Ocultar valores" }).click();
  await expect(page.getByRole("button", { name: "Mostrar valores" })).toBeVisible();

  const label = await page.locator('[data-slot="net-worth-scrub"] svg').getAttribute("aria-label");
  expect(label).toContain("Valores ocultos");
  expect(label).not.toMatch(/R\$\s*\d/);
  await expect(page.locator('[data-slot="hero-value"]')).toHaveAttribute("data-hidden", "true");
});

test("com valores ocultos, arrastar sobre o gráfico mantém valor, variação e aria-label mascarados", async ({
  page,
}) => {
  await openOverview(page);
  await page.getByRole("button", { name: "Ocultar valores" }).click();
  await expect(page.getByRole("button", { name: "Mostrar valores" })).toBeVisible();

  const hero = page.locator('[data-slot="hero-value"]');
  const delta = page.locator('[data-slot="hero-delta"]');
  const chart = page.locator('[data-slot="net-worth-scrub"]');
  const svg = chart.locator("svg");
  // Qualquer cifra legível: "R$ 1.234", "1.234,56" ou percentual com dígitos.
  const leak = /R$s*d|d[d.]*,d{2}|ds*%/;

  const box = (await chart.boundingBox())!;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number | null) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: x === null ? [] : [{ x, y }],
    });

  const maskedBefore = (await hero.innerText()).trim();
  const deltaBefore = (await delta.innerText()).trim();

  await touch("touchStart", box.x + box.width - 4);
  for (let step = 1; step <= 12; step += 1) {
    await touch("touchMove", box.x + box.width - 4 - (box.width * step) / 14);
    // Confere a cada passo do gesto, não só no fim.
    expect(await hero.innerText()).not.toMatch(leak);
    expect(await delta.innerText()).not.toMatch(leak);
    expect(await svg.getAttribute("aria-label")).not.toMatch(leak);
  }

  // O gesto chegou ao gráfico: o texto da variação passou a falar do ponto ("até …").
  await expect(delta).toContainText("até ");
  await expect(hero).toHaveAttribute("data-hidden", "true");
  expect(await svg.getAttribute("aria-label")).toContain("Valores ocultos");
  expect((await hero.innerText()).trim()).toBe(maskedBefore);

  await touch("touchEnd", null);
  await expect.poll(async () => (await delta.innerText()).trim()).toBe(deltaBefore);
});

test("sem overflow horizontal em 360 e 390px", async ({ page }) => {
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await openOverview(page);
    await expectNoHorizontalOverflow(page, `${width}px`);

    // Nenhum tile de KPI trunca o valor.
    const truncated = await page.evaluate(
      () =>
        [...document.querySelectorAll('[data-slot="overview-kpis"] [data-slot="money"]')].filter(
          (element) => element.scrollWidth > element.clientWidth + 1,
        ).length,
    );
    expect(truncated, `${width}px: KPI truncado`).toBe(0);
  }
});

test("no desktop a Visão geral continua com os quatro KPIs e sem layout mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();
  await waitForSkeletonsGone(page);
  await expect(page.getByRole("region", { name: "Indicadores principais" })).toBeVisible();
  await expect(page.locator('[data-slot="overview-hero"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="overview-kpis"]')).toHaveCount(0);
});
