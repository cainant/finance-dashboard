import { expect, test } from "@playwright/test";

import { ensureDemoData } from "./demo-data";

/**
 * Ergonomia da tabela de transações no desktop: a linha inteira abre o painel
 * lateral, mas os controles internos seguem com o próprio clique — a categoria
 * abre o popover (e escolher uma opção não pode abrir o painel junto).
 */
test.describe("tabela de transações (desktop)", () => {
  test.beforeAll(async ({ request }) => {
    await ensureDemoData(request);
  });

  test("a linha inteira abre o painel; a categoria só abre o popover", async ({ page }) => {
    await page.goto("/transactions");

    const rows = page.locator("tbody tr[data-tx]");
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    const row = rows.first();
    const sheet = page.getByRole("dialog", { name: "Transação" });

    // A célula de valor não tem controle próprio: o clique pertence à linha.
    await row.locator("td").last().click();
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    // O #53 fecha o painel pelo histórico; a URL precisa voltar antes do
    // próximo clique, senão o `popstate` chega no meio dele.
    await expect(page).not.toHaveURL(/[?&]tx=/);

    // O botão da descrição continua sendo o alvo de teclado/leitor de tela.
    await row.getByRole("button", { name: /^Ver detalhes de/ }).click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]tx=/);

    // Categoria: abre o popover e não o painel. A categoria atual sempre está na
    // lista — fixada no topo quando é de outra natureza (um Pix de saída é
    // `expense` e pode carregar "Transferências", `transfer`).
    const categoryButton = row.getByRole("button", { name: /Alterar categoria/ });
    const currentCategory = (await categoryButton.innerText()).trim();
    await categoryButton.click();
    const listbox = page.getByRole("listbox", { name: "Categorias" });
    await expect(listbox).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]tx=/);

    // A opção vive em portal, mas o evento borbulha pela árvore React até a
    // linha: escolher categoria também não pode abrir o painel. Reeleger a
    // categoria atual mantém o dado demo intacto para as outras specs.
    await page.getByRole("option", { name: currentCategory, exact: true }).click();
    await expect(listbox).toBeHidden();
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]tx=/);
  });

  test("arrastar para selecionar o texto não abre o painel", async ({ page }) => {
    await page.goto("/transactions");

    const rows = page.locator("tbody tr[data-tx]");
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    const amount = rows.first().locator("td").last().locator('[data-slot="money"]');
    const box = await amount.boundingBox();
    expect(box).not.toBeNull();

    // Seleção de texto por arrasto (mousedown → move → mouseup): o clique que
    // fecha o gesto não pode abrir o painel por cima da seleção.
    await page.mouse.move(box!.x + 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width - 2, box!.y + box!.height / 2, { steps: 8 });
    await page.mouse.up();

    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
    expect(selected.trim().length).toBeGreaterThan(0);
    await expect(page.getByRole("dialog", { name: "Transação" })).toBeHidden();

    // Clique simples continua abrindo (o guard só barra enquanto há seleção).
    await page
      .getByRole("button", { name: /^Ver detalhes de/ })
      .first()
      .click();
    await expect(page.getByRole("dialog", { name: "Transação" })).toBeVisible();
  });
  test("ordenar por valor alterna a ordem no servidor e desagrupa a lista", async ({ page }) => {
    await page.goto("/transactions?period=90d");
    await expect(page.locator("tbody tr[data-tx]").first()).toBeVisible({ timeout: 30_000 });

    const sortButton = page.getByRole("button", { name: "Ordenar por Valor" });
    await sortButton.click();
    await expect(page).toHaveURL(/sort=amount_desc/);
    // Ordenação por valor não tem cabeçalho de dia: a data vai inline.
    await expect(page.locator("tbody tr[data-day]")).toHaveCount(0);

    await sortButton.click();
    await expect(page).toHaveURL(/sort=amount_asc/);

    // Voltar à ordem por data devolve o agrupamento por dia.
    await page.goto("/transactions?period=90d&sort=date_desc");
    await expect(page.locator("tbody tr[data-day]").first()).toBeVisible({ timeout: 30_000 });
  });

  test("a virtualização mantém alturas fixas e sem sobreposição ao rolar", async ({ page }) => {
    await page.goto("/transactions?period=12m");

    const scroll = page.locator('[data-slot="transactions-table"] > div').first();
    await expect(page.locator("tbody tr[data-tx]").first()).toBeVisible({ timeout: 30_000 });
    // A lista carrega as páginas seguintes sozinha: espera o fim para medir uma
    // lista estável (sem lotes novos entrando no meio da rolagem).
    await expect(page.getByText("Fim da lista")).toBeVisible({ timeout: 30_000 });

    const scrollable = await scroll.evaluate(
      (element) => element.scrollHeight - element.clientHeight,
    );
    expect(scrollable, "o período precisa render várias telas de lançamentos").toBeGreaterThan(
      1_000,
    );

    await scroll.evaluate((element) => {
      element.scrollTop = (element.scrollHeight - element.clientHeight) * 0.6;
    });
    await page.waitForTimeout(200);

    const geometry = await scroll.evaluate((element) => {
      const rows = [...element.querySelectorAll("tbody tr")]
        .map((row) => {
          const rect = row.getBoundingClientRect();
          return {
            kind: row.hasAttribute("data-day") ? "day" : "transaction",
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
          };
        })
        .sort((a, b) => a.top - b.top);

      return { scrollTop: element.scrollTop, rows };
    });

    expect(geometry.scrollTop, "rolou para o meio da lista").toBeGreaterThan(0);
    expect(geometry.rows.length, "linhas visíveis o bastante para checar o layout").toBeGreaterThan(
      5,
    );

    // As linhas não usam `measureElement`: a posição vem de
    // DAY_HEADER_HEIGHT/TRANSACTION_ROW_HEIGHT. Se o CSS divergir, elas passam
    // a se sobrepor ou a deixar buracos.
    for (const row of geometry.rows) {
      expect(Math.round(row.height), `altura da linha ${row.kind}`).toBe(
        row.kind === "day" ? 32 : 44,
      );
    }

    for (let index = 1; index < geometry.rows.length; index += 1) {
      const previous = geometry.rows[index - 1]!;
      const current = geometry.rows[index]!;
      expect(
        Math.abs(current.top - previous.bottom),
        `sem sobreposição nem buraco entre ${previous.kind} e ${current.kind}`,
      ).toBeLessThan(0.6);
    }
  });

  test("linha pendente ganha indicador quando a coluna Status está oculta", async ({ page }) => {
    // 1280–1535: o aside de 320px tira a coluna Status, então a descrição
    // precisa carregar a pista do "Pendente".
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/transactions?period=90d");

    await expect(page.locator("tbody tr[data-tx]").first()).toBeVisible({ timeout: 30_000 });

    const statusHeader = page.locator("thead th").filter({ hasText: "Status" });
    await expect(statusHeader).toBeHidden();

    const indicator = page.locator('[data-slot="pending-indicator"]').first();
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveAttribute("title", "Pendente");
    await expect(indicator.getByText("Pendente")).toBeAttached();

    // A partir de 2xl a coluna volta e o indicador some (o badge já informa).
    await page.setViewportSize({ width: 1536, height: 900 });
    await expect(statusHeader).toBeVisible();
    await expect(indicator).toBeHidden();
  });
});
