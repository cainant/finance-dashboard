import { expect, test, type Locator, type Page } from "@playwright/test";

import { API_HEADERS, ensureDemoData } from "./demo-data";

/**
 * Convivência da lista mobile de Transações (rolagem na janela, barra fixa,
 * sheets em `?filters=`/`?tx=`) com o que o detalhe mobile trouxe: puxar para
 * atualizar, trilha de navegação, View Transitions e restauração de rolagem.
 */
test.setTimeout(120_000);
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test.beforeAll(async ({ request }) => {
  await ensureDemoData(request);
});

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

function rows(page: Page): Locator {
  return page.locator('[data-slot="transactions-cards"] li[data-swipe]');
}

async function openList(page: Page, query = "") {
  await page.goto(`/transactions${query}`);
  await expect(rows(page).first()).toBeVisible({ timeout: 60_000 });
  await waitForSkeletonsGone(page);
}

/** Espera os lotes em segundo plano terminarem ("Fim da lista"). */
async function waitForAllBatches(page: Page) {
  await expect(page.getByText("Fim da lista")).toBeAttached({ timeout: 60_000 });
}

async function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => Math.round(window.scrollY));
}

/** Toque real (CDP): o Playwright não tem API de arrastar com touch. */
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

/** Centro da primeira linha de lançamento visível (a lista está no topo). */
async function firstRowCenter(page: Page) {
  const box = await rows(page).first().boundingBox();
  expect(box, "primeira linha visível").not.toBeNull();
  expect(box!.y + box!.height, "a linha cabe na tela").toBeLessThan(844);

  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2, box: box! };
}

/** Registra as requisições de API (método + caminho + query) a partir deste ponto. */
function trackApi(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) {
      calls.push(`${request.method()} ${url.pathname}${url.search}`);
    }
  });

  return {
    calls,
    /** Requisições da lista (a rota exata, sem `/summary`). */
    list: () => calls.filter((call) => /^GET \/api\/transactions(\?|$)/.test(call)),
    count: (pattern: RegExp) => calls.filter((call) => pattern.test(call)).length,
    reset: () => {
      calls.length = 0;
    },
  };
}

/** O que a lista mostra: ids em ordem, cabeçalhos de dia e totais, lidos do DOM. */
async function snapshotList(page: Page) {
  return page.evaluate(() => {
    const items = [...document.querySelectorAll('[data-slot="transactions-cards"] ul > li')];

    return {
      ids: items.flatMap((li) =>
        li instanceof HTMLElement && li.dataset.tx ? [li.dataset.tx] : [],
      ),
      days: items.flatMap((li) =>
        li instanceof HTMLElement && li.dataset.slot === "day-header"
          ? [(li.textContent ?? "").trim()]
          : [],
      ),
      count: document.querySelector('[data-slot="transactions-count"]')?.textContent?.trim() ?? "",
    };
  });
}

const indicator = (page: Page) => page.locator('[data-slot="pull-indicator"]');
const refreshedStatus = (page: Page) =>
  page.getByRole("status").filter({ hasText: "Dados atualizados." });

/** Restaura a categoria de uma transação que o teste alterou. */
let touched: { id: string; categoryId: string | null } | null = null;

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  if (!touched) {
    return;
  }

  const { id, categoryId } = touched;
  touched = null;
  const response = await page.request.patch(`/api/transactions/${id}`, {
    headers: API_HEADERS,
    data: { categoryId },
  });
  expect(response.ok(), "falha ao restaurar a categoria da transação do seed").toBeTruthy();
});

test.describe("puxar para atualizar na lista de Transações", () => {
  test("com vários lotes carregados custa uma requisição da lista e mantém a lista correta", async ({
    page,
  }) => {
    const api = trackApi(page);
    await openList(page);
    await waitForAllBatches(page);
    expect(api.list().length, "o seed tem mais de um lote").toBeGreaterThan(1);

    const before = await snapshotList(page);
    expect(await scrollY(page)).toBe(0);
    api.reset();

    const start = await firstRowCenter(page);
    await touchDrag(page, { x: start.x, y: start.y }, { dx: 0, dy: 190 });
    await expect(refreshedStatus(page)).toBeAttached();
    await expect(indicator(page)).not.toHaveAttribute("data-refreshing", "true");
    await nextFrames(page);

    // Uma só requisição da lista (a primeira página), nenhuma sincronização.
    expect(api.list()).toHaveLength(1);
    expect(api.list()[0]).not.toContain("cursor=");
    expect(api.calls.filter((call) => call.startsWith("POST "))).toEqual([]);

    // Nada mudou no servidor: a lista, os dias e a contagem ficam iguais, sem duplicar.
    await expect(page.getByText("Fim da lista")).toBeAttached();
    const after = await snapshotList(page);
    expect(after.ids).toEqual(before.ids);
    expect(new Set(after.ids).size).toBe(after.ids.length);
    expect(after.days).toEqual(before.days);
    expect(after.count).toBe(before.count);
  });

  test("com dado novo na primeira página a lista volta inteira, sem duplicar nem perder linhas", async ({
    page,
  }) => {
    const api = trackApi(page);
    await openList(page);
    await waitForAllBatches(page);
    const before = await snapshotList(page);
    const firstDescription = await rows(page)
      .first()
      .locator('[data-slot="transaction-description"]')
      .innerText();

    // A primeira página (sem cursor) chega com a descrição do primeiro lançamento trocada.
    const renamed = "Lançamento atualizado pelo e2e";
    await page.route(
      (url) => url.pathname === "/api/transactions" && !url.searchParams.has("cursor"),
      async (route) => {
        const response = await route.fetch();
        const body = (await response.json()) as { data: { description: string }[] };
        body.data[0]!.description = renamed;
        await route.fulfill({ response, json: body });
      },
    );
    api.reset();

    const start = await firstRowCenter(page);
    await touchDrag(page, { x: start.x, y: start.y }, { dx: 0, dy: 190 });
    await expect(refreshedStatus(page)).toBeAttached();

    await expect(rows(page).first().locator('[data-slot="transaction-description"]')).toHaveText(
      renamed,
    );
    expect(firstDescription).not.toBe(renamed);
    // O cache voltou a uma página; os lotes seguintes são rebuscados em segundo plano.
    await expect(page.getByText("Fim da lista")).toBeAttached({ timeout: 60_000 });
    await expect.poll(() => api.list().length).toBeGreaterThan(1);

    const after = await snapshotList(page);
    expect(after.ids).toEqual(before.ids);
    expect(new Set(after.ids).size).toBe(after.ids.length);
    expect(after.days).toEqual(before.days);
    expect(after.count).toBe(before.count);
  });

  test("deslizar um lançamento na horizontal abre a categoria e não dispara o puxar", async ({
    page,
  }) => {
    const api = trackApi(page);
    await openList(page);
    await waitForAllBatches(page);
    api.reset();

    const start = await firstRowCenter(page);
    // Um pouco de deriva vertical para baixo, como o dedo faz.
    await touchDrag(
      page,
      { x: start.box.x + start.box.width - 40, y: start.y },
      { dx: -170, dy: 14 },
    );

    await expect(page.getByRole("dialog", { name: "Categoria" })).toBeVisible();
    expect(api.list(), "o gesto horizontal não refaz a lista").toEqual([]);
    expect(api.calls.filter((call) => call.startsWith("POST "))).toEqual([]);
    await expect(refreshedStatus(page)).toHaveCount(0);
    await expect(indicator(page)).not.toHaveAttribute("data-dragging", "true");
  });

  test("rolar os chips na horizontal no topo não dispara o puxar", async ({ page }) => {
    const api = trackApi(page);
    await openList(page);
    await waitForAllBatches(page);
    api.reset();

    const chip = page.locator('[data-slot="quick-chip"]').first();
    const box = (await chip.boundingBox())!;
    await touchDrag(
      page,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      { dx: -150, dy: 12 },
    );
    await nextFrames(page);

    expect(api.calls.filter((call) => /^GET /.test(call))).toEqual([]);
    await expect(refreshedStatus(page)).toHaveCount(0);
    await expect(indicator(page)).not.toHaveAttribute("data-dragging", "true");
    expect(await scrollY(page)).toBe(0);
  });

  test("rolar a lista normalmente (para cima e para baixo) não atualiza", async ({ page }) => {
    const api = trackApi(page);
    await openList(page);
    await waitForAllBatches(page);
    api.reset();

    const start = await firstRowCenter(page);
    // Dedo para cima = rola para baixo; depois volta ao topo com a página já rolada.
    await touchDrag(page, { x: start.x, y: 600 }, { dx: 0, dy: -300 });
    await expect.poll(() => scrollY(page)).toBeGreaterThan(100);
    await touchDrag(page, { x: start.x, y: 300 }, { dx: 0, dy: 190 });
    await nextFrames(page);

    expect(api.list()).toEqual([]);
    await expect(refreshedStatus(page)).toHaveCount(0);
  });

  test("não age com o campo de busca focado e o teclado aberto", async ({ page }) => {
    const api = trackApi(page);
    await openList(page);
    await waitForAllBatches(page);
    await page.getByLabel("Buscar transações").focus();
    // O Chromium headless não abre teclado: simula o `visualViewport` encolhido por ele.
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport!, "height", {
        configurable: true,
        get: () => window.innerHeight * 0.55,
      });
    });
    api.reset();

    const start = await firstRowCenter(page);
    await touchDrag(page, { x: start.x, y: start.y }, { dx: 0, dy: 190 });
    await nextFrames(page);

    expect(api.list()).toEqual([]);
    await expect(refreshedStatus(page)).toHaveCount(0);
  });

  test("campo de busca com foco mas teclado fechado (voltar do Android) não bloqueia o puxar", async ({
    page,
  }) => {
    const api = trackApi(page);
    await openList(page);
    await waitForAllBatches(page);
    await page.getByLabel("Buscar transações").focus();
    api.reset();

    const start = await firstRowCenter(page);
    await touchDrag(page, { x: start.x, y: start.y }, { dx: 0, dy: 190 });
    await expect(refreshedStatus(page)).toBeAttached();
    expect(api.list()).toHaveLength(1);
  });

  test("não age com o sheet de filtros ou o detalhe abertos", async ({ page, request }) => {
    const api = trackApi(page);
    await openList(page);
    await waitForAllBatches(page);

    await page.locator('[data-slot="filters-trigger"]').tap();
    await expect(page.getByRole("dialog", { name: "Filtros" })).toBeVisible();
    api.reset();
    await touchDrag(page, { x: 195, y: 120 }, { dx: 0, dy: 190 });
    await nextFrames(page);
    expect(api.list()).toEqual([]);
    await expect(refreshedStatus(page)).toHaveCount(0);

    // Detalhe aberto por link direto.
    const first = (
      (await (await request.get("/api/transactions?limit=1")).json()) as { data: { id: string }[] }
    ).data[0]!;
    await page.goto(`/transactions?tx=${first.id}`);
    await expect(page.getByRole("dialog", { name: "Transação" })).toBeVisible({ timeout: 60_000 });
    await waitForSkeletonsGone(page);
    // Os lotes em segundo plano da carga nova não contam como o gesto.
    await waitForAllBatches(page);
    api.reset();
    await touchDrag(page, { x: 195, y: 120 }, { dx: 0, dy: 190 });
    await nextFrames(page);
    expect(api.list()).toEqual([]);
    await expect(refreshedStatus(page)).toHaveCount(0);
  });

  test("o indicador fica acima da barra fixa de busca e abaixo da barra superior", async ({
    page,
  }) => {
    await openList(page);
    const z = (selector: string) =>
      page.locator(selector).evaluate((element) => Number(getComputedStyle(element).zIndex));

    const ptr = await z('[data-slot="pull-indicator"]');
    expect(ptr).toBeGreaterThan(await z('[data-slot="tx-toolbar"]'));
    expect(ptr).toBeLessThan(await z('[data-slot="app-topbar"]'));
  });

  test("trocar a categoria e puxar em seguida não reverte a troca", async ({ page }) => {
    await openList(page);
    await waitForAllBatches(page);
    const row = rows(page).first();
    const txId = (await row.getAttribute("data-tx"))!;
    const original = (await (await page.request.get("/api/transactions?limit=200")).json()) as {
      data: { id: string; categoryId: string | null }[];
    };
    touched = {
      id: txId,
      categoryId: original.data.find((tx) => tx.id === txId)!.categoryId,
    };

    await row.getByRole("button", { name: /^Ver detalhes de/ }).focus();
    await page.keyboard.press("ArrowLeft");
    const sheet = page.getByRole("dialog", { name: "Categoria" });
    const group = sheet.getByRole("group", { name: "Categorias" });
    const target = group.locator('button[aria-pressed="false"]').first();
    const targetName = (await target.innerText()).split("\n")[0]!.trim();
    await target.tap();

    const notice = page
      .getByRole("dialog")
      .locator('[role="status"][data-slot="bottom-sheet-notice"]');
    await expect(notice).toContainText(`Categoria: ${targetName}`, { timeout: 20_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Puxa já, com o refetch da troca possivelmente ainda a caminho.
    const start = await firstRowCenter(page);
    await touchDrag(page, { x: start.x, y: start.y }, { dx: 0, dy: 190 });
    await expect(refreshedStatus(page)).toBeAttached();

    const category = page
      .locator(`[data-slot="transactions-cards"] li[data-tx="${txId}"]`)
      .locator('[data-slot="transaction-category"]')
      .first();
    await expect(category).toContainText(targetName, { timeout: 20_000 });
    await nextFrames(page);
    await expect(category).toContainText(targetName);
    const saved = (await (await page.request.get("/api/transactions?limit=200")).json()) as {
      data: { id: string; categoryId: string | null }[];
    };
    expect(saved.data.find((tx) => tx.id === txId)!.categoryId).not.toBe(touched.categoryId);
  });
});

test.describe("sheets, histórico e transições", () => {
  test("link com ?tx e ?filters juntos abre só o detalhe", async ({ page, request }) => {
    const first = (
      (await (await request.get("/api/transactions?limit=1")).json()) as { data: { id: string }[] }
    ).data[0]!;
    await page.goto(`/transactions?tx=${first.id}&filters=true`);

    await expect(page.getByRole("dialog", { name: "Transação" })).toBeVisible({ timeout: 60_000 });
    // Seletor CSS: o Radix marca o sheet de baixo como aria-hidden, e o getByRole o esconderia.
    await expect(page.locator('[role="dialog"]')).toHaveCount(1);
    await expect(
      page.locator(
        '[role="dialog"][aria-label="Filtros"], [role="dialog"]:has([data-slot="filters-apply"])',
      ),
    ).toHaveCount(0);

    // Fechar o detalhe não revela o sheet de filtros: a URL sai limpa dos dois params.
    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).search).not.toMatch(/tx=|filters=/);
  });

  test("abrir e fechar o sheet de filtros não anima como push e não muda o voltar", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __vt: string[] };
      w.__vt = [];
      const original = document.startViewTransition?.bind(document);
      if (original) {
        document.startViewTransition = ((arg: unknown) => {
          const types =
            typeof arg === "object" && arg !== null && "types" in arg
              ? (arg as { types: string[] }).types
              : "plain";
          w.__vt.push(String(types));
          return original(arg as never);
        }) as typeof document.startViewTransition;
      }
    });
    const log = () => page.evaluate(() => (window as unknown as { __vt: string[] }).__vt);

    // Conta → "Ver todas em Transações" (filtrada) → sheet → fecha → voltar.
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
    await waitForSkeletonsGone(page);
    await page.locator('[data-slot="account-row"]', { hasText: "Conta Corrente" }).first().tap();
    await expect(page).toHaveURL(/\/accounts\/[^/?]+/);
    await waitForSkeletonsGone(page);
    const detailPath = new URL(page.url()).pathname;

    await page.locator('[data-slot="account-transactions-link"]').tap();
    await expect(page).toHaveURL((url) => url.pathname === "/transactions");
    await expect(rows(page).first()).toBeVisible({ timeout: 60_000 });
    await waitForSkeletonsGone(page);
    const accountId = new URL(page.url()).searchParams.get("accountId");
    expect(accountId).toBeTruthy();
    const supported = await page.evaluate(
      () =>
        typeof document.startViewTransition === "function" &&
        CSS.supports("selector(:active-view-transition-type(a))"),
    );
    const typesBefore = (await log()).length;

    await page.locator('[data-slot="filters-trigger"]').tap();
    await expect(page.getByRole("dialog", { name: "Filtros" })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("filters")).toBe("true");
    await page
      .getByRole("dialog", { name: "Filtros" })
      .locator('[data-slot="filters-apply"]')
      .tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.has("filters")).toBe(false);
    // Os filtros de antes de abrir seguem valendo.
    expect(new URL(page.url()).searchParams.get("accountId")).toBe(accountId);
    if (supported) {
      expect((await log()).length, "sheet não inicia view transition").toBe(typesBefore);
    }

    // Voltar do sistema: o sheet já saiu da pilha, então volta ao detalhe da conta.
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === detailPath);
    await waitForSkeletonsGone(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Voltar para Contas" })).toBeVisible();
    if (supported) {
      expect(await log()).toContain("nav-back");
    }
  });

  test("conta → Transações filtradas → voltar retorna ao detalhe, com o sheet fechado", async ({
    page,
  }) => {
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
    await waitForSkeletonsGone(page);
    await page.locator('[data-slot="account-row"]', { hasText: "Conta Corrente" }).first().tap();
    await expect(page).toHaveURL(/\/accounts\/[^/?]+/);
    await waitForSkeletonsGone(page);
    const detailPath = new URL(page.url()).pathname;
    const entries = await page.evaluate(() => history.length);

    await page.locator('[data-slot="account-transactions-link"]').tap();
    await expect(page).toHaveURL((url) => url.pathname === "/transactions");
    await expect(rows(page).first()).toBeVisible({ timeout: 60_000 });
    await waitForSkeletonsGone(page);
    expect(await page.evaluate(() => history.length)).toBe(entries + 1);

    // Abre e fecha o sheet de filtros pelo botão: nenhuma entrada sobra na pilha.
    await page.locator('[data-slot="filters-trigger"]').tap();
    const sheet = page.getByRole("dialog", { name: "Filtros" });
    await expect(sheet).toBeVisible();
    await sheet.locator('[data-slot="filters-apply"]').tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === detailPath);
    expect(new URL(page.url()).searchParams.has("filters")).toBe(false);
    await waitForSkeletonsGone(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator('[data-slot="account-detail-mobile"]')).toBeVisible();
  });

  test("voltar da conta para a lista de Transações restaura a rolagem da janela", async ({
    page,
  }) => {
    await openList(page);
    await waitForAllBatches(page);
    await page.evaluate(() => window.scrollTo(0, 1500));
    await expect.poll(() => scrollY(page)).toBeGreaterThan(1000);
    const listScroll = await scrollY(page);

    await page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("link", { name: "Contas", exact: true })
      .tap();
    await expect(page).toHaveURL((url) => url.pathname === "/accounts");
    await waitForSkeletonsGone(page);
    await page.locator('[data-slot="account-row"]').first().tap();
    await expect(page).toHaveURL(/\/accounts\/[^/?]+/);
    await waitForSkeletonsGone(page);

    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === "/accounts");
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === "/transactions");
    await expect(rows(page).first()).toBeAttached({ timeout: 60_000 });
    await expect
      .poll(async () => Math.abs((await scrollY(page)) - listScroll), { timeout: 15_000 })
      .toBeLessThanOrEqual(8);
  });

  test("fechar uma transação aberta por ?tx restaura a posição da lista", async ({ page }) => {
    await openList(page);
    await waitForAllBatches(page);
    await page.evaluate(() => window.scrollTo(0, 1200));
    await expect.poll(() => scrollY(page)).toBeGreaterThan(900);
    await nextFrames(page);
    const listScroll = await scrollY(page);

    // Uma linha que já está na janela (o toque não pode rolar a página antes de abrir).
    const inView = await page.evaluate(() => {
      const li = [
        ...document.querySelectorAll<HTMLElement>('[data-slot="transactions-cards"] li[data-tx]'),
      ].find((item) => {
        const rect = item.getBoundingClientRect();
        return rect.top > 300 && rect.bottom < 700;
      });
      return li?.dataset.tx ?? null;
    });
    expect(inView, "linha dentro da janela").toBeTruthy();
    await page
      .locator(`[data-slot="transactions-cards"] li[data-tx="${inView}"]`)
      .getByRole("button", { name: /^Ver detalhes de/ })
      .tap();
    await expect(page.getByRole("dialog", { name: "Transação" })).toBeVisible();
    await expect(page).toHaveURL(/[?&]tx=/);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]tx=/);
    await expect
      .poll(async () => Math.abs((await scrollY(page)) - listScroll), { timeout: 10_000 })
      .toBeLessThanOrEqual(8);
  });

  test("overscroll-behavior-y: none no html não prende a rolagem da lista nem o trilho de chips", async ({
    page,
  }) => {
    await openList(page);
    await waitForAllBatches(page);
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY),
    ).toBe("none");

    // Rolagem vertical por gesto de toque na lista.
    await touchDrag(page, { x: 195, y: 650 }, { dx: 0, dy: -400 });
    await expect.poll(() => scrollY(page)).toBeGreaterThan(150);

    // O trilho de chips rola na horizontal por gesto.
    await page.evaluate(() => window.scrollTo(0, 0));
    const rail = page.locator('[data-slot="tx-toolbar"] .no-scrollbar').first();
    const overflow = await rail.evaluate((element) => element.scrollWidth - element.clientWidth);
    if (overflow > 0) {
      const box = (await rail.boundingBox())!;
      await touchDrag(
        page,
        { x: box.x + box.width - 20, y: box.y + box.height / 2 },
        { dx: -200, dy: 0 },
      );
      await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    }
  });
});

test.describe("hook síncrono de breakpoint", () => {
  test("o primeiro quadro do mobile já é o layout mobile (sem tabela de desktop)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __desktopFrames: number };
      w.__desktopFrames = 0;
      new MutationObserver(() => {
        if (document.querySelector("tbody tr[data-tx], [data-slot='transaction-filters']")) {
          w.__desktopFrames += 1;
        }
      }).observe(document, { childList: true, subtree: true });
    });

    await page.goto("/transactions");
    await expect(rows(page).first()).toBeVisible({ timeout: 60_000 });
    expect(
      await page.evaluate(() => (window as unknown as { __desktopFrames: number }).__desktopFrames),
    ).toBe(0);

    // Cartões: no mobile a lista já nasce como linhas que abrem o detalhe.
    await page.goto("/credit-cards");
    await expect(page.locator('[data-slot="credit-card-row"]').first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator('[data-slot="bills-card"]')).toHaveCount(0);
  });
});
