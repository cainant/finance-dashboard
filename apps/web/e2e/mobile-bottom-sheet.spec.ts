import { expect, test, type Page } from "@playwright/test";

import { API_HEADERS, ensureDemoData } from "./demo-data";

/**
 * Detalhe da transação como bottom sheet abaixo de `lg` (e painel lateral
 * intacto de `lg` para cima). O estado vive na URL (`?tx`), então o "voltar"
 * do navegador fecha o sheet.
 */

const MOBILE = { width: 390, height: 844 };

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await ensureDemoData(request);
});

/**
 * Transação cuja categoria o teste vai alterar. O `afterEach` a restaura pela API: se o
 * teste falhar no meio (antes do próprio "Desfazer"), a mudança não contamina os seguintes.
 */
let touched: { id: string; categoryId: string | null } | null = null;

/** Guarda a categoria atual (lida da API) da transação que o teste vai alterar. */
async function trackCategory(page: Page, txId: string) {
  const response = await page.request.get("/api/transactions?limit=200");
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data: { id: string; categoryId: string | null }[] };
  const original = body.data.find((tx) => tx.id === txId);
  expect(original, "transação aberta fora do primeiro lote").toBeTruthy();
  touched = { id: txId, categoryId: original!.categoryId };
}

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

async function openFirstCard(page: Page): Promise<{ txId: string }> {
  await page.goto("/transactions");
  const cards = page.locator('[data-slot="transactions-cards"] li[data-tx]');
  await expect(cards.first()).toBeVisible({ timeout: 60_000 });

  const txId = await cards.first().getAttribute("data-tx");
  expect(txId, "cartão sem data-tx").toBeTruthy();

  await cards
    .first()
    .getByRole("button", { name: /^Ver detalhes de/ })
    .tap();
  await expect(page.getByRole("dialog", { name: "Transação" })).toBeVisible();

  return { txId: txId! };
}

test.describe("mobile (390px)", () => {
  test.use({ viewport: MOBILE, hasTouch: true, isMobile: true });

  test("abre por toque, mostra o detalhe do protótipo e não tem Anterior/Próxima", async ({
    page,
  }) => {
    const { txId } = await openFirstCard(page);
    const sheet = page.locator('[data-slot="bottom-sheet-content"]');

    await expect(page).toHaveURL(new RegExp(`[?&]tx=${txId}(&|$)`));
    await expect(sheet).toHaveAttribute("data-slot", "bottom-sheet-content");
    await expect(sheet.getByRole("button", { name: /^Categoria/ })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^Conta/ })).toBeVisible();
    await expect(sheet.getByText("Data", { exact: true })).toBeVisible();
    await expect(sheet.getByText("Movimentação", { exact: true })).toBeVisible();
    await expect(sheet.getByLabel("Anotação")).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Ver lançamentos parecidos" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Anterior" })).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "Próxima" })).toHaveCount(0);

    // Valor com sinal: despesa neutra (-), receita positiva (+).
    const amount = sheet.locator('[data-slot="money"]').first();
    await expect(amount).toHaveText(/^[+-]R\$/);

    // Alvos de toque ≥ 44px nos controles do cabeçalho e nas linhas tocáveis.
    for (const control of [
      sheet.getByRole("button", { name: "Fechar" }),
      sheet.getByRole("button", { name: /^Categoria/ }),
      sheet.getByRole("button", { name: /^Conta/ }),
    ]) {
      const box = await control.boundingBox();
      expect(box!.height, "alvo de toque menor que 44px").toBeGreaterThanOrEqual(43.5);
      expect(box!.width, "alvo de toque menor que 44px").toBeGreaterThanOrEqual(43.5);
    }

    // O sheet cabe na tela e respeita a altura máxima.
    // (poll: a entrada anima translateY, então a medida só vale depois de assentar).
    await expect
      .poll(async () => {
        const box = (await sheet.boundingBox())!;
        return box.y + box.height <= MOBILE.height + 1 && box.y > 40;
      })
      .toBe(true);
  });

  test("troca a categoria pela grade, anuncia numa região viva e desfaz de dentro do diálogo", async ({
    page,
  }) => {
    const { txId } = await openFirstCard(page);
    await trackCategory(page, txId);
    const sheet = page.locator('[data-slot="bottom-sheet-content"]');

    const categoryRow = sheet.getByRole("button", { name: /^Categoria/ });
    const before = (await categoryRow.innerText()).replace(/^Categoria\s*/, "").trim();
    await categoryRow.tap();

    // Página filha: título "Categoria", botão voltar e grade de 3 colunas.
    await expect(sheet.getByRole("button", { name: "Voltar para a transação" })).toBeVisible();
    const group = sheet.getByRole("group", { name: "Categorias" });
    await expect(group).toBeVisible();
    const cells = group.getByRole("button");
    const columns = await group.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
    );
    expect(columns).toBe(3);

    const target = group.locator('button[aria-pressed="false"]').first();
    const targetName = (await target.innerText()).split("\n")[0]!.trim();
    const cellBox = await target.boundingBox();
    expect(cellBox!.height).toBeGreaterThanOrEqual(44);
    await expect(cells.first()).toBeVisible();
    await target.tap();

    // Volta ao detalhe: o aviso mora numa região viva DENTRO do diálogo (o toast do
    // sonner fica com aria-hidden enquanto o sheet modal está aberto).
    const notice = sheet.locator('[role="status"][data-slot="bottom-sheet-notice"]');
    await expect(notice).toContainText(`Categoria: ${targetName}`, { timeout: 20_000 });
    await expect(notice).toHaveAttribute("aria-live", "polite");
    await expect(categoryRow).toContainText(targetName, { timeout: 20_000 });
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);

    // "Desfazer" é alcançável por teclado dentro do diálogo e funciona.
    const undo = notice.getByRole("button", { name: "Desfazer" });
    await undo.focus();
    await expect(undo).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(sheet).toBeVisible();
    await expect(categoryRow).toContainText(before, { timeout: 20_000 });
    await expect(notice).toContainText("Alteração desfeita");
    // O botão sai da tela: o foco volta para a linha "Categoria" (não cai no diálogo).
    await expect(categoryRow).toBeFocused();
  });

  test("duas trocas seguidas: cada Desfazer volta ao valor imediatamente anterior", async ({
    page,
  }) => {
    const { txId } = await openFirstCard(page);
    await trackCategory(page, txId);
    const sheet = page.locator('[data-slot="bottom-sheet-content"]');
    const categoryRow = sheet.getByRole("button", { name: /^Categoria/ });
    const notice = sheet.locator('[data-slot="bottom-sheet-notice"]');
    const group = sheet.getByRole("group", { name: "Categorias" });

    const original = (await categoryRow.innerText()).replace(/^Categoria\s*/, "").trim();

    async function pickOtherThan(...names: string[]): Promise<string> {
      await categoryRow.tap();
      const cells = group.locator('button[aria-pressed="false"]');
      const count = await cells.count();
      for (let index = 0; index < count; index += 1) {
        const name = (await cells.nth(index).innerText()).split("\n")[0]!.trim();
        if (!names.includes(name)) {
          await cells.nth(index).tap();
          return name;
        }
      }
      throw new Error("sem categoria diferente para escolher");
    }

    // Refetch lento: depois da primeira troca a transação da lista ainda vem velha
    // (original) enquanto a segunda acontece — o "anterior" do Desfazer não pode sair dela.
    await page.route("**/api/transactions?**", async (route) => {
      if (route.request().method() === "GET") {
        await new Promise((resolve) => setTimeout(resolve, 2_500));
      }
      await route.fallback();
    });

    const first = await pickOtherThan(original);
    await expect(notice).toContainText(`Categoria: ${first}`, { timeout: 20_000 });

    const second = await pickOtherThan(original, first);
    await expect(notice).toContainText(`Categoria: ${second}`, { timeout: 20_000 });
    await expect(categoryRow).toContainText(second, { timeout: 20_000 });

    // O Desfazer da segunda troca volta para a primeira, não para a original.
    await notice.getByRole("button", { name: "Desfazer" }).tap();
    await expect(notice).toContainText("Alteração desfeita", { timeout: 20_000 });
    await expect(categoryRow).toContainText(first, { timeout: 20_000 });
    await expect(categoryRow).not.toContainText(original);
  });

  test("falha ao desfazer mostra o erro dentro do sheet e deixa tentar de novo", async ({
    page,
  }) => {
    const { txId } = await openFirstCard(page);
    await trackCategory(page, txId);
    const sheet = page.locator('[data-slot="bottom-sheet-content"]');
    const categoryRow = sheet.getByRole("button", { name: /^Categoria/ });
    const notice = sheet.locator('[data-slot="bottom-sheet-notice"]');

    await categoryRow.tap();
    await sheet
      .getByRole("group", { name: "Categorias" })
      .locator('button[aria-pressed="false"]')
      .first()
      .tap();
    await expect(notice).toContainText("Categoria:", { timeout: 20_000 });

    // Só o PATCH do Desfazer falha.
    await page.route("**/api/transactions/*", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 500,
          json: { error: { code: "internal", message: "falhou" } },
        });
        return;
      }
      await route.fallback();
    });
    await notice.getByRole("button", { name: "Desfazer" }).tap();
    await expect(notice).toContainText("Não foi possível desfazer", { timeout: 20_000 });
    await expect(notice).not.toContainText("Alteração desfeita");

    await page.unroute("**/api/transactions/*");
    await notice.getByRole("button", { name: "Tentar de novo" }).tap();
    await expect(notice).toContainText("Alteração desfeita", { timeout: 20_000 });
  });

  test("fecha arrastando a alça para baixo e não fecha com arrasto curto", async ({ page }) => {
    await openFirstCard(page);
    const sheet = page.locator('[data-slot="bottom-sheet-content"]');
    const handle = sheet.locator('[data-slot="bottom-sheet-handle"]');
    // Espera a mola de entrada assentar antes de medir a posição aberta.
    await expect
      .poll(async () => {
        const first = (await sheet.boundingBox())!.y;
        await page.waitForTimeout(120);
        return Math.abs((await sheet.boundingBox())!.y - first);
      })
      .toBeLessThan(0.5);
    const openY = (await sheet.boundingBox())!.y;
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    // Arrasto curto e devagar: volta para a posição aberta.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 40, { steps: 4 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    await expect(sheet).toBeVisible();
    await expect.poll(async () => Math.abs((await sheet.boundingBox())!.y - openY)).toBeLessThan(2);

    // Arrasto longo: fecha e tira `?tx` da URL.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 220, { steps: 8 });
    await page.mouse.up();
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]tx=/);
  });

  test("o corpo rola sem fechar o sheet e o botão voltar do navegador o fecha", async ({
    page,
  }) => {
    await openFirstCard(page);
    const sheet = page.locator('[data-slot="bottom-sheet-content"]');
    const body = sheet.locator('[data-slot="bottom-sheet-body"]');

    // Viewport baixo força rolagem interna; o sheet continua aberto.
    await page.setViewportSize({ width: MOBILE.width, height: 480 });
    await expect(sheet).toBeVisible();
    const scrollable = await body.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrollable, "corpo deveria rolar com a tela baixa").toBeTruthy();
    await body.evaluate((el) => el.scrollTo({ top: 80 }));
    expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(sheet).toBeVisible();
    await page.setViewportSize(MOBILE);

    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]tx=/);
  });

  test("voltar do navegador com a página Categoria aberta fecha o sheet inteiro", async ({
    page,
  }) => {
    await openFirstCard(page);
    const sheet = page.locator('[data-slot="bottom-sheet-content"]');
    await sheet.getByRole("button", { name: /^Categoria/ }).tap();
    await expect(sheet.getByRole("group", { name: "Categorias" })).toBeVisible();

    // A página filha é estado local do sheet: a URL só carrega `?tx`, então um passo
    // atrás no histórico fecha tudo (não volta ao detalhe).
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]tx=/);
  });

  test("?tx de transação fora do primeiro lote abre o sheet e a categoria atual aparece na grade", async ({
    page,
  }) => {
    // A lista carrega 50 itens e baixa o resto em lotes de 200: pega um id do 2º lote.
    const response = await page.request.get("/api/transactions?limit=200");
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { data: { id: string; categoryId: string | null }[] };
    const target = body.data.slice(60).find((tx) => tx.categoryId);
    expect(target, "seed deveria ter mais de 60 transações categorizadas").toBeTruthy();

    await page.goto(`/transactions?tx=${target!.id}`);
    const sheet = page.locator('[data-slot="bottom-sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(new RegExp(`[?&]tx=${target!.id}(&|$)`));

    // Toque numa linha de lote posterior: o cartão existe e abre o mesmo detalhe.
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    const card = page.locator(`[data-slot="transactions-cards"] li[data-tx="${target!.id}"]`);
    // A lista é virtualizada: rola até o cartão do lote posterior montar.
    await expect
      .poll(
        async () => {
          if ((await card.count()) === 0) {
            await page.evaluate(() => window.scrollBy(0, 400));
          }
          return card.count();
        },
        { timeout: 60_000 },
      )
      .toBe(1);
    await card.scrollIntoViewIfNeeded();
    await card.getByRole("button", { name: /^Ver detalhes de/ }).tap();
    await expect(sheet).toBeVisible();

    const categoryRow = sheet.getByRole("button", { name: /^Categoria/ });
    const current = (await categoryRow.innerText()).replace(/^Categoria\s*/, "").trim();
    await categoryRow.tap();
    await expect(
      sheet.getByRole("group", { name: "Categorias" }).locator('button[aria-pressed="true"]'),
    ).toContainText(current);
  });

  test("Esc fecha e o foco volta para o cartão que abriu", async ({ page }) => {
    const { txId } = await openFirstCard(page);
    const sheet = page.locator('[data-slot="bottom-sheet-content"]');
    const opener = page
      .locator(`[data-tx="${txId}"]`)
      .getByRole("button", { name: /^Ver detalhes de/ });

    await expect(sheet).toHaveAttribute("aria-modal", "true");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("ver lançamentos parecidos leva a Transações com a busca preenchida", async ({ page }) => {
    await openFirstCard(page);
    const sheet = page.locator('[data-slot="bottom-sheet-content"]');

    await sheet.getByRole("button", { name: "Ver lançamentos parecidos" }).tap();
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]tx=/);
    await expect(page).toHaveURL(/[?&]q=/, { timeout: 10_000 });
    await expect(page.getByLabel("Buscar transações")).not.toHaveValue("");
  });

  test("tocar na conta fecha o sheet e abre o detalhe da conta", async ({ page }) => {
    await openFirstCard(page);
    const sheet = page.locator('[data-slot="bottom-sheet-content"]');

    await sheet.getByRole("button", { name: /^Conta/ }).tap();
    await expect(page).toHaveURL(/\/accounts\/[^/?]+/);
    await expect(page.getByRole("dialog", { name: "Transação" })).toBeHidden();
  });
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

test.describe("tablet (768px) usa o sheet; desktop (1440px) mantém o painel lateral", () => {
  test("768px abre o bottom sheet com largura limitada e centralizado", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/transactions");
    const rows = page.locator("tbody tr[data-tx]");
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    await rows
      .first()
      .getByRole("button", { name: /^Ver detalhes de/ })
      .click();
    const sheet = page.getByRole("dialog", { name: "Transação" });
    await expect(sheet).toHaveAttribute("data-slot", "bottom-sheet-content");
    await waitForSkeletonsGone(page);

    // O sheet é `fixed` e se centraliza na área do overlay, não em innerWidth: o CSS global
    // usa `scrollbar-gutter: stable`, então a calha (~10px) continua reservada com o scroll
    // travado e o overlay termina antes dela (758px num viewport de 768px). Por isso o
    // centro é comparado ao do overlay, com 1px de tolerância para arredondamento subpixel.
    const overlay = page.locator('[data-slot="bottom-sheet-overlay"]');
    await expect
      .poll(async () => {
        const box = (await sheet.boundingBox())!;
        const area = (await overlay.boundingBox())!;
        return {
          widthOk: Math.abs(box.width - 560) <= 1,
          centeredOk: Math.abs(box.x + box.width / 2 - (area.x + area.width / 2)) <= 1,
          limitedOk: box.width < area.width - 100,
        };
      })
      .toEqual({ widthOk: true, centeredOk: true, limitedOk: true });
  });

  test("390px mantém o sheet em largura total", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/transactions");
    const cards = page.locator('[data-slot="transactions-cards"] li[data-tx]');
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    await cards
      .first()
      .getByRole("button", { name: /^Ver detalhes de/ })
      .click();
    const sheet = page.getByRole("dialog", { name: "Transação" });
    await waitForSkeletonsGone(page);

    await expect
      .poll(async () => {
        const box = (await sheet.boundingBox())!;
        const area = (await page.locator('[data-slot="bottom-sheet-overlay"]').boundingBox())!;
        // Largura total da área do overlay (que já desconta a calha de rolagem reservada).
        return { x: Math.round(box.x - area.x), fullWidth: Math.abs(box.width - area.width) <= 1 };
      })
      .toEqual({ x: 0, fullWidth: true });
  });

  test("1440px continua com o painel lateral, Anterior/Próxima e Fechar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/transactions");
    const rows = page.locator("tbody tr[data-tx]");
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    await rows
      .first()
      .getByRole("button", { name: /^Ver detalhes de/ })
      .click();

    const sheet = page.getByRole("dialog", { name: "Transação" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-slot", "sheet-content");
    await expect(sheet.getByRole("button", { name: "Anterior" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Próxima" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Fechar" }).first()).toBeVisible();
    await expect(page.locator('[data-slot="bottom-sheet-content"]')).toHaveCount(0);
  });
});
