import { expect, test, type Page } from "@playwright/test";

import { ensureDemoData } from "./demo-data";

/**
 * A barra de rolagem do documento não pode empurrar o conteúdo.
 *
 * No Chrome/Windows a barra ocupa ~10-13px. Sem calha reservada, toda tela que
 * passa de uma página longa para uma curta (busca sem resultado, troca de rota)
 * arranca a barra e o conteúdo inteiro anda na horizontal; um diálogo que trava
 * o scroll (`RemoveScroll` do Radix) compensa a barra com margem no body e faz
 * o caminho inverso, e o overlay `fixed inset-0` para antes da calha, deixando
 * uma faixa sem escurecer.
 *
 * O Chromium headless nasce com `--hide-scrollbars` (barra overlay, sem
 * largura), o que esconde o defeito; sem essa flag ele usa a barra clássica
 * como o navegador real, e o teste passa a medir o salto.
 */
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await ensureDemoData(request);
});

interface Layout {
  h1X: number;
  headerRight: number;
  topbarRight: number;
}

interface ScrollMetrics {
  innerWidth: number;
  clientWidth: number;
  clientHeight: number;
  scrollHeight: number;
  canvas: string;
}

async function layout(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`elemento não encontrado: ${selector}`);
      }
      const rect = element.getBoundingClientRect();
      return { x: rect.left, right: rect.right };
    };

    const header = box('[data-slot="page-header"]');
    return {
      h1X: Number(box('[data-slot="page-header"] h1').x.toFixed(2)),
      headerRight: Number(header.right.toFixed(2)),
      topbarRight: Number(box('[data-slot="app-topbar"]').right.toFixed(2)),
    };
  });
}

async function scrollMetrics(page: Page): Promise<ScrollMetrics> {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
    canvas: getComputedStyle(document.documentElement).backgroundColor,
  }));
}

/** Canais 0-255 de `rgb()`, `rgba()` ou `color(srgb ...)` (usado pelo Chrome). */
function toRgb(color: string): [number, number, number] | null {
  const channels = (
    source: string,
    separator: string | RegExp,
    scale = 1,
  ): [number, number, number] => {
    const [r = 0, g = 0, b = 0] = source
      .split(separator)
      .map((part) => Number.parseFloat(part) * scale);
    return [r, g, b];
  };

  const rgb = /^rgba?\(([^)]+)\)$/.exec(color);
  if (rgb) {
    return channels(rgb[1] ?? "", ",");
  }

  const srgb = /^color\(srgb ([^)]+)\)$/.exec(color);
  if (srgb) {
    return channels((srgb[1] ?? "").trim(), /\s+/, 255);
  }

  return null;
}

async function canvasColor(page: Page): Promise<string> {
  return (await scrollMetrics(page)).canvas;
}

/** Espera a transição do canvas terminar e compara os canais com ±2. */
async function expectCanvas(page: Page, expected: [number, number, number]): Promise<void> {
  const [expectedR, expectedG, expectedB] = expected;
  await expect
    .poll(
      async () => {
        const rgb = toRgb(await canvasColor(page));
        if (!rgb) {
          return Number.POSITIVE_INFINITY;
        }

        const [r, g, b] = rgb;
        return Math.max(Math.abs(r - expectedR), Math.abs(g - expectedG), Math.abs(b - expectedB));
      },
      { message: `canvas deveria ser rgb(${expected.join(", ")})`, timeout: 3_000 },
    )
    .toBeLessThanOrEqual(2);
}

/** Espera o layout assentar (transições/fetch) e então compara com ±1px. */
async function expectLayoutAt(page: Page, expected: Layout, label: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const actual = await layout(page);
        return Math.max(
          Math.abs(actual.h1X - expected.h1X),
          Math.abs(actual.headerRight - expected.headerRight),
          Math.abs(actual.topbarRight - expected.topbarRight),
        );
      },
      {
        message: `${label}: esperado x ${expected.h1X} / right ${expected.headerRight} / topbar ${expected.topbarRight}`,
        timeout: 5_000,
      },
    )
    .toBeLessThanOrEqual(1);
}

async function waitForRows(page: Page): Promise<void> {
  await expect(page.locator("tbody tr[data-tx]").first()).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

async function prepare(page: Page, theme: "dark" | "light", width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript((value) => {
    window.localStorage.setItem("lumen:theme", value);
  }, theme);
  await page.goto("/transactions");
  await waitForRows(page);
}

async function openTransactionSheet(page: Page): Promise<void> {
  await page
    .locator("tbody tr[data-tx]")
    .first()
    .getByRole("button", { name: /^Ver detalhes de/ })
    .click();
  await expect(page.getByRole("dialog", { name: "Transação" })).toBeVisible();
}

async function openCommandPalette(page: Page): Promise<void> {
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Paleta de comandos" })).toBeVisible();
  // O Radix só trata Escape com o foco dentro do conteúdo; a paleta abre com
  // animação e o foco pode chegar depois.
  const input = page.locator('[data-slot="command-input"]');
  await input.focus();
  await expect(input).toBeFocused();
}

async function closeDialog(page: Page, name: string): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name })).toBeHidden();
}

/**
 * Fecha o painel de transação e espera a URL voltar sem `?tx=`.
 *
 * Desde o #53 o painel fecha pelo histórico (`history.back()`): o Radix some
 * antes de o `popstate` chegar. Abrir a paleta nesse intervalo deixava a pilha
 * de layers com a folha saindo por cima — o Escape era consumido por ela e a
 * paleta ficava aberta (flake do CI em `Paleta de comandos`).
 */
async function closeTransactionSheet(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Transação" })).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]tx=/);
}

/** Espera a lista virtualizada desmontar e a página encolher de verdade. */
async function waitForShortPage(page: Page): Promise<void> {
  await expect(page.locator("tbody tr[data-tx]")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        page.evaluate(
          () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
        ),
      { message: "página curta ainda tem rolagem" },
    )
    .toBeLessThanOrEqual(0);
}

for (const theme of ["dark", "light"] as const) {
  test(`conteúdo não desloca quando a rolagem aparece/some (${theme}, 1440px)`, async ({
    page,
  }) => {
    await prepare(page, theme, 1440);
    const long = await layout(page);
    const withoutScrollbar = await scrollMetrics(page);

    // Se a barra deixar de existir no ambiente, as medições abaixo ficam vazias
    // e o teste passaria sem provar nada.
    expect(
      withoutScrollbar.innerWidth - withoutScrollbar.clientWidth,
      "barra de rolagem clássica presente no viewport de teste",
    ).toBeGreaterThan(0);

    // Página longa (lista cheia) → curta (busca sem resultado): a barra some e
    // nada no layout pode acompanhar.
    const search = page.getByRole("searchbox", { name: "Buscar transações" });
    await search.fill("zzzzzzzz");
    await expect(page.getByText("Nenhuma transação com esses filtros")).toBeVisible({
      timeout: 30_000,
    });

    await waitForShortPage(page);
    const short = await scrollMetrics(page);
    expect(short.scrollHeight, "página curta realmente cabe na tela").toBeLessThanOrEqual(
      short.clientHeight,
    );
    await expectLayoutAt(page, long, "página curta");

    await search.fill("");
    await waitForRows(page);
    await expectLayoutAt(page, long, "volta para a página longa");

    // Menu da conta e Select também travam o scroll, mas não escurecem a tela:
    // não podem tingir a calha (só overlay de diálogo/painel pode).
    await page.getByRole("button", { name: /^Abrir menu da conta de/ }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    expect(
      await page.evaluate(() => document.body.hasAttribute("data-scroll-locked")),
      "menu da conta deveria travar o scroll",
    ).toBe(true);
    expect(await canvasColor(page), "menu da conta tingiu o canvas").toBe(withoutScrollbar.canvas);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();

    await page.getByRole("combobox", { name: "Filtrar por categoria" }).click();
    await expect(page.getByRole("listbox")).toBeVisible();
    expect(
      await page.evaluate(() => document.body.hasAttribute("data-scroll-locked")),
      "Select deveria travar o scroll",
    ).toBe(true);
    expect(await canvasColor(page), "Select tingiu o canvas").toBe(withoutScrollbar.canvas);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();

    // Painel lateral travando o scroll com o Radix: a compensação que ele
    // injeta no body existiria em dobro sobre a calha reservada, e o overlay
    // `fixed inset-0` termina antes da calha (faixa sem escurecer).
    await openTransactionSheet(page);
    await expectLayoutAt(page, long, "painel aberto");

    const sheet = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      const overlay = document.querySelector('[data-slot="sheet-overlay"]');
      const box = overlay?.getBoundingClientRect();
      return {
        locked: document.body.hasAttribute("data-scroll-locked"),
        marginRight: style.marginRight,
        overlayRight: box ? Number(box.right.toFixed(2)) : null,
        innerWidth: window.innerWidth,
      };
    });
    expect(sheet.locked, "painel aberto sem lock de scroll do Radix").toBe(true);
    expect(sheet.marginRight, "compensação de scrollbar no body").toBe("0px");
    expect(sheet.overlayRight, "overlay sem geometria").not.toBeNull();
    // O overlay para no layout viewport e a calha fica de fora; é exatamente a
    // faixa que o canvas tingido cobre.
    expect(sheet.overlayRight, "overlay por cima da calha reservada").toBeLessThan(
      sheet.innerWidth,
    );
    // O canvas recebe o tom do `bg-black/60` sobre `--background`: no tema
    // claro isso é rgb(102, 102, 102) (0,4 × branco); no escuro, quase preto.
    const overlayTint: [number, number, number] = theme === "light" ? [102, 102, 102] : [0, 0, 0];
    await expectCanvas(page, overlayTint);

    await closeTransactionSheet(page);
    await expectLayoutAt(page, long, "painel fechado");

    // Paleta de comandos: é o `Dialog` (não o Sheet) e passa pelo mesmo lock.
    await openCommandPalette(page);
    await expectLayoutAt(page, long, "paleta aberta");
    await expectCanvas(page, overlayTint);

    await closeDialog(page, "Paleta de comandos");
    await expectLayoutAt(page, long, "tudo fechado");

    await expect
      .poll(async () => canvasColor(page), {
        message: "canvas volta ao fundo ao destravar",
        timeout: 3_000,
      })
      .toBe(withoutScrollbar.canvas);

    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter),
      "calha da barra de rolagem reservada no documento",
    ).toBe("stable");
  });
}

test("título não desloca em 1920px (conteúdo centralizado)", async ({ page }) => {
  await prepare(page, "dark", 1920);
  const long = await layout(page);

  const search = page.getByRole("searchbox", { name: "Buscar transações" });
  await search.fill("zzzzzzzz");
  await expect(page.getByText("Nenhuma transação com esses filtros")).toBeVisible({
    timeout: 30_000,
  });
  await expectLayoutAt(page, long, "página curta em 1920px");

  await search.fill("");
  await waitForRows(page);
  await openTransactionSheet(page);
  await expectLayoutAt(page, long, "painel aberto em 1920px");

  await closeTransactionSheet(page);
  await openCommandPalette(page);
  await expectLayoutAt(page, long, "paleta aberta em 1920px");
});
