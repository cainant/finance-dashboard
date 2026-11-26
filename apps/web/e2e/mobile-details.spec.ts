import { expect, test, type Page } from "@playwright/test";

import { ensureDemoData } from "./demo-data";

/**
 * Etapa 6 do mobile: detalhe de conta e de cartão, voltar com histórico e
 * rolagem restaurada, puxar para atualizar, transições e Conexões em 360px.
 * O desktop (`lg`+) não muda e é verificado no último bloco.
 */
test.setTimeout(120_000);

test.beforeAll(async ({ request }) => {
  await ensureDemoData(request);
});

const MOBILE = { width: 390, height: 844 };

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

async function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => Math.round(window.scrollY));
}

/** Medidas relativas ao overlay: `scrollbar-gutter: stable` muda a largura útil. */
async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `${label}: overflow horizontal`).toBeLessThanOrEqual(1);
}

/** Gesto de toque real (CDP): o Playwright não tem API de arrastar com touch. */
async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  delta: { dx: number; dy: number },
  steps = 14,
) {
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from.x, y: from.y }],
  });
  for (let step = 1; step <= steps; step += 1) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: from.x + (delta.dx * step) / steps, y: from.y + (delta.dy * step) / steps },
      ],
    });
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await client.detach();
}

async function nextFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function h1Center(page: Page) {
  const box = await page.getByRole("heading", { level: 1 }).first().boundingBox();
  expect(box, "h1 visível").not.toBeNull();
  return { x: box!.x + 20, y: box!.y + box!.height / 2 };
}

/** Registra as requisições de API (método + caminho) a partir deste ponto. */
function trackApi(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) {
      calls.push(`${request.method()} ${url.pathname}`);
    }
  });

  return {
    calls,
    count: (pattern: RegExp) => calls.filter((call) => pattern.test(call)).length,
    reset: () => {
      calls.length = 0;
    },
  };
}

test.describe("mobile (390px)", () => {
  test.use({ viewport: MOBILE, isMobile: true, hasTouch: true });

  test("linhas de conta são tocáveis (≥44px, seta) e levam ao detalhe do protótipo", async ({
    page,
  }) => {
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
    await waitForSkeletonsGone(page);

    const rows = page.locator('[data-slot="account-row"]');
    await expect(rows.first()).toBeVisible();

    for (const row of await rows.all()) {
      const box = await row.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      await expect(row.locator("svg").last()).toBeVisible(); // seta
    }

    await page.locator('[data-slot="account-row"]', { hasText: "Conta Corrente" }).first().tap();
    await expect(page).toHaveURL(/\/accounts\/[^/?]+/);
    await waitForSkeletonsGone(page);

    const detail = page.locator('[data-slot="account-detail-mobile"]');
    await expect(detail.getByRole("heading", { level: 1, name: "Conta Corrente" })).toBeVisible();
    await expect(detail.locator('[data-slot="account-hero"]')).toContainText("Saldo atual");
    await expect(detail.locator('[data-slot="account-flow"]')).toContainText("Entradas no período");
    await expect(detail.locator('[data-slot="account-flow"]')).toContainText("Saídas no período");
    await expect(detail.locator('[data-slot="account-transactions"]')).toBeVisible();
    await expect(detail.locator('[data-slot="account-details"]')).toContainText("Disponível");
    await expectNoHorizontalOverflow(page, "detalhe da conta");
  });

  test("voltar pelo botão e pelo histórico leva à lista com a rolagem restaurada", async ({
    page,
  }) => {
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
    await waitForSkeletonsGone(page);

    const maxScroll = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(maxScroll, "a lista precisa rolar para provar a restauração").toBeGreaterThan(120);
    await page.evaluate((top) => window.scrollTo(0, top), Math.min(260, maxScroll));
    await expect.poll(() => scrollY(page)).toBeGreaterThan(100);
    // Centraliza a última linha (longe da barra de abas, que o Playwright
    // contornaria rolando) e registra a posição exata em que o toque acontece.
    const lastRow = page.locator('[data-slot="account-row"]:visible').last();
    await lastRow.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await expect.poll(() => scrollY(page)).toBeGreaterThan(100);
    const listScroll = await scrollY(page);

    await lastRow.tap();
    await expect(page).toHaveURL(/\/accounts\/[^/?]+/);
    await waitForSkeletonsGone(page);
    const entries = await page.evaluate(() => history.length);

    // Botão voltar da barra superior = voltar do histórico (nenhuma entrada nova).
    const back = page.getByRole("link", { name: "Voltar para Contas" });
    await expect(back).toBeVisible();
    await back.tap();
    await expect(page).toHaveURL((url) => url.pathname === "/accounts");
    await waitForSkeletonsGone(page);
    expect(await page.evaluate(() => history.length)).toBe(entries);
    await expect
      .poll(async () => Math.abs((await scrollY(page)) - listScroll))
      .toBeLessThanOrEqual(4);

    // O voltar do navegador/sistema leva ao mesmo lugar e restaura do mesmo jeito.
    // Nova posição de rolagem, em outra altura, e clique direto (sem o Playwright rolar).
    await page.evaluate((top) => window.scrollTo(0, top), Math.max(listScroll - 80, 20));
    await nextFrames(page);
    const secondScroll = await scrollY(page);
    await page.locator('[data-slot="account-row"]:visible').last().dispatchEvent("click");
    await expect(page).toHaveURL(/\/accounts\/[^/?]+/);
    await waitForSkeletonsGone(page);
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === "/accounts");
    await waitForSkeletonsGone(page);
    await expect
      .poll(async () => Math.abs((await scrollY(page)) - secondScroll))
      .toBeLessThanOrEqual(4);
  });

  test("com deep link o botão voltar cai na lista de origem", async ({ page }) => {
    await page.goto("/accounts");
    await waitForSkeletonsGone(page);
    const href = await page.locator('[data-slot="account-row"]').first().getAttribute("href");
    expect(href).toBeTruthy();

    await page.goto(href!);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await waitForSkeletonsGone(page);

    await page.getByRole("link", { name: "Voltar para Contas" }).tap();
    await expect(page).toHaveURL((url) => url.pathname === "/accounts");
  });

  test("atalho do detalhe leva a Transações já filtradas pela conta", async ({ page }) => {
    await page.goto("/accounts");
    await waitForSkeletonsGone(page);
    await page.locator('[data-slot="account-row"]', { hasText: "Conta Corrente" }).first().tap();
    await expect(page).toHaveURL(/\/accounts\/[^/?]+/);
    await waitForSkeletonsGone(page);

    const accountId = new URL(page.url()).pathname.split("/").pop()!;
    await page.locator('[data-slot="account-transactions-link"]').tap();

    await expect(page).toHaveURL((url) => url.pathname === "/transactions");
    expect(new URL(page.url()).searchParams.get("accountId")).toBe(accountId);
    await expect(page.getByRole("heading", { level: 1, name: "Transações" })).toBeVisible();
  });

  test("cartões: linha tocável com fatura, vencimento e uso; detalhe com faturas e lançamentos", async ({
    page,
  }) => {
    await page.goto("/credit-cards");
    await expect(page.getByRole("heading", { level: 1, name: "Cartões" })).toBeVisible();
    await waitForSkeletonsGone(page);

    const rows = page.locator('[data-slot="credit-card-row"]');
    await expect(rows.first()).toBeVisible();
    // No mobile não há tile selecionável nem as faturas da página: moram no detalhe.
    await expect(page.locator('[data-slot="credit-card-tile"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="bills-card"]')).toHaveCount(0);
    await expect(rows.first()).toContainText("Fatura atual");
    await expect(rows.first()).toContainText("Uso do limite");
    expect((await rows.first().boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page, "lista de cartões");

    await rows.first().tap();
    await expect(page).toHaveURL(/\/credit-cards\/[^/?]+/);
    await waitForSkeletonsGone(page);

    const detail = page.locator('[data-slot="credit-card-detail"]');
    await expect(detail.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(detail.locator('[data-slot="card-hero"]')).toContainText("Fatura atual");
    for (const label of ["Fechamento", "Vencimento", "Limite total", "Limite disponível"]) {
      await expect(detail.locator('[data-slot="card-facts"]')).toContainText(label);
    }
    await expect(detail.locator('[data-slot="bills-card"]')).toBeVisible();
    await expect(page.locator('[data-slot="bill-transactions"]')).toBeVisible();
    await expect(page.getByRole("link", { name: "Voltar para Cartões" })).toBeVisible();
    await expectNoHorizontalOverflow(page, "detalhe do cartão");

    // Trocar de fatura usa `?bill=` com replace: nenhuma entrada nova no histórico.
    const billRows = detail.locator('[data-slot="bill-row"]');
    if ((await billRows.count()) > 1) {
      const entries = await page.evaluate(() => history.length);
      await billRows.nth(1).tap();
      await expect(page).toHaveURL(/[?&]bill=/);
      await expect(billRows.nth(1)).toHaveAttribute("aria-pressed", "true");
      expect(await page.evaluate(() => history.length)).toBe(entries);
    }

    await page.getByRole("link", { name: "Voltar para Cartões" }).tap();
    await expect(page).toHaveURL((url) => url.pathname === "/credit-cards");
  });

  test("vencimento próximo do cartão fica em warning", async ({ page, request }) => {
    const cards = (await (await request.get("/api/credit-cards")).json()) as {
      data: { accountId: string; account: { name: string } }[];
    };
    const card = cards.data[0]!;

    await page.route("**/api/bills/upcoming*", async (route) => {
      await route.fulfill({
        json: {
          data: [
            {
              id: "bill-soon",
              accountId: card.accountId,
              externalId: "bill-soon",
              dueDate: "2099-01-10",
              closingDate: null,
              totalCents: 123_45,
              minimumPaymentCents: null,
              status: "closed",
              accountName: card.account.name,
              creditCardBrand: null,
              daysUntilDue: 3,
              estimated: false,
            },
          ],
        },
      });
    });

    await page.goto("/credit-cards");
    await waitForSkeletonsGone(page);
    const due = page.locator('[data-slot="credit-card-row"] [data-slot="card-due"]').first();
    await expect(due).toHaveAttribute("data-due-soon", "true");
    await expect(due).toContainText("vence em 3 dias");
  });

  test("puxar para atualizar refaz as consultas da tela e não dispara sincronização", async ({
    page,
  }) => {
    const api = trackApi(page);
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
    await waitForSkeletonsGone(page);
    expect(await scrollY(page)).toBe(0);
    api.reset();

    const start = await h1Center(page);
    await touchDrag(page, start, { dx: 0, dy: 190 });

    await expect.poll(() => api.count(/^GET \/api\/accounts$/)).toBeGreaterThan(0);
    await expect.poll(() => api.count(/^GET \/api\/connections$/)).toBeGreaterThan(0);
    await expect(page.getByRole("status").filter({ hasText: "Dados atualizados." })).toBeAttached();
    // O indicador some quando termina e nenhuma sincronização foi pedida.
    await expect(page.locator('[data-slot="pull-indicator"]')).not.toHaveAttribute(
      "data-refreshing",
      "true",
    );
    expect(api.count(/\/sync$/)).toBe(0);
    expect(api.calls.filter((call) => call.startsWith("POST "))).toEqual([]);
  });

  test("puxar abaixo do limiar, com a página rolada ou na horizontal não atualiza", async ({
    page,
  }) => {
    const api = trackApi(page);
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
    await waitForSkeletonsGone(page);
    api.reset();

    const start = await h1Center(page);
    // Curto demais: o indicador recolhe sem atualizar.
    await touchDrag(page, start, { dx: 0, dy: 60 });
    // Gesto horizontal.
    await touchDrag(page, start, { dx: 160, dy: 40 });
    await nextFrames(page);
    expect(api.count(/^GET /)).toBe(0);

    // Página rolada: o gesto é rolagem, não puxão.
    await page.evaluate(() => window.scrollTo(0, 200));
    await expect.poll(() => scrollY(page)).toBeGreaterThan(100);
    await touchDrag(page, { x: 195, y: 300 }, { dx: 0, dy: 190 });
    await nextFrames(page);
    expect(
      api.calls.filter((call) => /^GET \/api\/(accounts|connections|investments)$/.test(call)),
      "nenhuma consulta da tela refeita após o gesto na página rolada",
    ).toEqual([]);
    await expect(page.locator('[data-slot="pull-indicator"]')).not.toHaveAttribute(
      "data-dragging",
      "true",
    );
  });

  test("o indicador é fixo, sem backdrop-filter, e o recarregar nativo está desligado", async ({
    page,
  }) => {
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
    await waitForSkeletonsGone(page);

    const indicator = page.locator('[data-slot="pull-indicator"]');
    const style = await indicator.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        position: computed.position,
        pointerEvents: computed.pointerEvents,
        backdrop: computed.backdropFilter,
        overscroll: getComputedStyle(document.documentElement).overscrollBehaviorY,
      };
    });
    expect(style.position).toBe("fixed");
    expect(style.pointerEvents).toBe("none");
    expect(style.backdrop === "none" || style.backdrop === "").toBe(true);
    expect(style.overscroll).toBe("none");
  });

  test("alternativas sem gesto: botão focável e item do menu da conta", async ({ page }) => {
    const api = trackApi(page);
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
    await waitForSkeletonsGone(page);

    // Teclado: o botão só aparece com foco (como o link "Pular para o conteúdo").
    const focusButton = page.getByRole("button", { name: "Atualizar dados", exact: true });
    await expect(focusButton).toBeAttached();
    await focusButton.focus();
    await expect(focusButton).toBeFocused();
    expect((await focusButton.boundingBox())?.width ?? 0).toBeGreaterThan(40);
    api.reset();
    await page.keyboard.press("Enter");
    await expect.poll(() => api.count(/^GET \/api\/accounts$/)).toBeGreaterThan(0);
    expect(api.calls.filter((call) => call.startsWith("POST "))).toEqual([]);
    await expect(page.getByRole("status").filter({ hasText: "Dados atualizados." })).toBeAttached();

    // Toque: item no menu da conta.
    await page.getByRole("button", { name: /^Abrir menu da conta/ }).tap();
    api.reset();
    const item = page.getByRole("menuitem", { name: "Atualizar dados" });
    await expect(item).toBeVisible();
    // O menu abre com zoom-in: mede depois da animação.
    await expect
      .poll(async () => (await item.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
    await item.tap();
    await expect.poll(() => api.count(/^GET \/api\/connections$/)).toBeGreaterThan(0);
    expect(api.calls.filter((call) => call.startsWith("POST "))).toEqual([]);
  });

  test("falha ao atualizar mostra aviso e o indicador some", async ({ page }) => {
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
    await waitForSkeletonsGone(page);

    await page.route("**/api/accounts", async (route) => {
      await route.fulfill({
        status: 500,
        json: { error: { code: "internal", message: "falhou" } },
      });
    });

    const start = await h1Center(page);
    await touchDrag(page, start, { dx: 0, dy: 190 });

    await expect(page.getByText("Não foi possível atualizar os dados.").first()).toBeAttached();
    await expect(page.locator('[data-slot="pull-indicator"]')).not.toHaveAttribute(
      "data-refreshing",
      "true",
    );
  });

  test("transições: entrar no detalhe empurra, voltar devolve, abas não animam", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __vt: unknown[] };
      w.__vt = [];
      const original = document.startViewTransition?.bind(document);
      if (original) {
        document.startViewTransition = ((arg: unknown) => {
          const types =
            typeof arg === "object" && arg !== null && "types" in arg
              ? (arg as { types: string[] }).types
              : "plain";
          w.__vt.push(types);
          return original(arg as never);
        }) as typeof document.startViewTransition;
      }
    });

    await page.goto("/accounts");
    await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
    await waitForSkeletonsGone(page);

    const supported = await page.evaluate(
      () =>
        typeof document.startViewTransition === "function" &&
        CSS.supports("selector(:active-view-transition-type(a))"),
    );
    test.skip(!supported, "este Chromium não suporta tipos de view transition");

    const log = () =>
      page.evaluate(() => (window as unknown as { __vt: unknown[] }).__vt.map((t) => String(t)));

    await page.locator('[data-slot="account-row"]').first().tap();
    await expect(page).toHaveURL(/\/accounts\/[^/?]+/);
    await expect.poll(log).toContain("nav-forward");

    await page.getByRole("link", { name: /^Voltar para/ }).tap();
    await expect(page).toHaveURL((url) => url.pathname === "/accounts");
    await expect.poll(log).toContain("nav-back");

    const before = (await log()).length;
    await page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("link", { name: "Transações", exact: true })
      .tap();
    await expect(page).toHaveURL((url) => url.pathname === "/transactions");
    await nextFrames(page);
    expect((await log()).length, "trocar de aba não inicia view transition").toBe(before);
  });

  test("com movimento reduzido não há transição", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      const w = window as unknown as { __vt: unknown[] };
      w.__vt = [];
      const original = document.startViewTransition?.bind(document);
      if (original) {
        document.startViewTransition = ((arg: unknown) => {
          w.__vt.push(arg);
          return original(arg as never);
        }) as typeof document.startViewTransition;
      }
    });

    await page.goto("/accounts");
    await waitForSkeletonsGone(page);
    await page.locator('[data-slot="account-row"]').first().tap();
    await expect(page).toHaveURL(/\/accounts\/[^/?]+/);
    await expect(page.locator('[data-slot="account-detail-mobile"]')).toBeVisible();

    const typed = await page.evaluate(() =>
      (window as unknown as { __vt: unknown[] }).__vt.filter(
        (arg) => typeof arg === "object" && arg !== null && "types" in arg,
      ),
    );
    expect(typed).toEqual([]);
  });
});

test.describe("Conexões em 360px", () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test("sem overflow, ações de 44px e Sincronizar agora ao alcance", async ({ page }) => {
    await page.goto("/connections");
    await expect(page.getByRole("heading", { level: 1, name: "Conexões" })).toBeVisible();
    await waitForSkeletonsGone(page);
    await expect(page.locator('[data-slot="connection-card"]').first()).toBeVisible();
    await expectNoHorizontalOverflow(page, "conexões");

    for (const button of await page.locator('[data-slot="connection-actions"] button').all()) {
      const box = await button.boundingBox();
      expect(box?.height ?? 0, await button.innerText()).toBeGreaterThanOrEqual(44);
    }

    const sync = page.getByRole("button", { name: "Sincronizar agora" });
    await expect(sync).toBeVisible();
    expect((await sync.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(page.locator('[data-slot="connection-status"]').first()).toBeVisible();
  });

  test("conexão com erro mostra o status e Reconectar sem estourar a largura", async ({ page }) => {
    const institution = {
      id: "i-long",
      provider: "pluggy",
      externalId: "300",
      name: "Banco com um nome institucional bastante longo S.A.",
      logoUrl: null,
      primaryColor: "ef294b",
      type: "PERSONAL_BANK",
    };
    await page.route("**/api/connections", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        json: {
          data: [
            {
              id: "c-long",
              provider: "pluggy",
              externalId: "item-long",
              institutionId: "i-long",
              status: "login_required",
              statusDetail: "USER_INPUT_TIMEOUT_E_UM_DETALHE_BEM_COMPRIDO_SEM_ESPACOS_PARA_QUEBRAR",
              lastSyncedAt: "2026-11-11T09:00:00.000Z",
              createdAt: "2026-11-01T09:00:00.000Z",
              updatedAt: "2026-11-11T09:00:00.000Z",
              institution,
              consentExpiresAt: "2027-11-01T09:00:00.000Z",
            },
          ],
        },
      });
    });

    await page.goto("/connections");
    await expect(page.getByRole("heading", { level: 1, name: "Conexões" })).toBeVisible();
    await waitForSkeletonsGone(page);

    const card = page.locator('[data-slot="connection-card"]').first();
    await expect(card).toBeVisible();
    await expect(card.locator('[data-slot="connection-status"]')).toBeVisible();
    const reconnect = card.getByRole("button", { name: /Reconectar/ });
    await expect(reconnect).toBeVisible();
    expect((await reconnect.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page, "conexão com erro");
  });
});

test.describe("desktop (1280px) inalterado", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("lista de contas, detalhe e cartões mantêm o layout de desktop", async ({ page }) => {
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
    await waitForSkeletonsGone(page);

    const row = page.locator('[data-slot="account-row"]').first();
    await expect(row).toBeVisible();
    // Sem seta de toque no desktop; sem indicador, sem botão de atualizar por foco.
    await expect(row.locator("svg").last()).toBeHidden();
    await expect(page.locator('[data-slot="pull-indicator"]')).toBeHidden();
    await expect(page.getByRole("button", { name: "Atualizar dados", exact: true })).toBeHidden();

    await row.click();
    await expect(page).toHaveURL(/\/accounts\/[^/?]+/);
    await waitForSkeletonsGone(page);
    await expect(page.locator('[data-slot="account-detail-mobile"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ver transações" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Voltar para/ })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Trilha de navegação" })).toBeVisible();

    await page.goto("/credit-cards");
    await expect(page.getByRole("heading", { level: 1, name: "Cartões" })).toBeVisible();
    await waitForSkeletonsGone(page);
    await expect(page.locator('[data-slot="credit-card-tile"]').first()).toBeVisible();
    await expect(page.locator('[data-slot="credit-card-row"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="bills-card"]')).toBeVisible();

    await page.goto("/connections");
    await waitForSkeletonsGone(page);
    await expect(page.locator('[data-slot="connections-mobile-actions"]')).toBeHidden();
  });

  test("não há view transition no desktop", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __vt: unknown[] };
      w.__vt = [];
      const original = document.startViewTransition?.bind(document);
      if (original) {
        document.startViewTransition = ((arg: unknown) => {
          w.__vt.push(arg);
          return original(arg as never);
        }) as typeof document.startViewTransition;
      }
    });
    await page.goto("/accounts");
    await waitForSkeletonsGone(page);
    await page.locator('[data-slot="account-row"]').first().click();
    await expect(page).toHaveURL(/\/accounts\/[^/?]+/);
    await expect(page.getByRole("link", { name: "Ver transações" })).toBeVisible();

    const typed = await page.evaluate(() =>
      (window as unknown as { __vt: unknown[] }).__vt.filter(
        (arg) => typeof arg === "object" && arg !== null && "types" in arg,
      ),
    );
    expect(typed).toEqual([]);
  });
});
