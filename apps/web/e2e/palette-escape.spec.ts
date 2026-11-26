import { expect, test, type Page } from "@playwright/test";

import { ensureDemoData } from "./demo-data";

/**
 * O Radix só entrega Escape para a camada que ele considera no topo da pilha
 * global. Quando outro overlay (menu da conta, Select, painel de transação)
 * ainda está saindo e a paleta abre emendada, essa camada fica na frente e o
 * Esc não chegava na paleta: o diálogo continuava `data-state="open"` (flaky
 * do CI em `scroll-gutter`). A paleta passou a tratar o Esc por conta própria.
 */
async function prepare(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  const response = await page.request.post("/api/auth/login", {
    data: { email: "demo@finance.local", password: "demo1234" },
    headers: { "x-requested-with": "fetch" },
  });
  expect(response.ok()).toBeTruthy();
  // Não depender de outro arquivo ter criado o dataset demo: com shards, este
  // spec pode ser o primeiro a rodar e a tabela fica vazia.
  await ensureDemoData(page.request);
  await page.goto("/transactions");
  await expect(page.locator("tbody tr[data-tx]").first()).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** Abre a paleta emendada no fechamento do overlay anterior e fecha com Esc. */
async function expectPaletteClosesOnEscape(page: Page): Promise<void> {
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Paleta de comandos" });
  await expect(dialog).toBeVisible();

  const input = page.locator('[data-slot="command-input"]');
  await input.focus();
  await expect(input).toBeFocused();

  await page.keyboard.press("Escape");
  // A paleta fecha de imediato; 1s já é folga para a animação de saída.
  await expect(dialog).toBeHidden({ timeout: 1_000 });
}

test.describe("paleta de comandos: Esc depois de outro overlay", () => {
  test.beforeEach(async ({ page }) => {
    await prepare(page);
  });

  test("fecha quando o menu da conta ainda está saindo", async ({ page }) => {
    await page.getByRole("button", { name: /^Abrir menu da conta de/ }).click();
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("Escape");
    await expectPaletteClosesOnEscape(page);
  });

  test("fecha quando o painel de transação ainda está saindo", async ({ page }) => {
    await page
      .locator("tbody tr[data-tx]")
      .first()
      .getByRole("button", { name: /^Ver detalhes de/ })
      .click();
    await expect(page.getByRole("dialog", { name: "Transação" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expectPaletteClosesOnEscape(page);
  });

  test("fecha depois da sequência menu → Select → painel", async ({ page }) => {
    await page.getByRole("button", { name: /^Abrir menu da conta de/ }).click();
    await page.keyboard.press("Escape");

    await page.getByRole("combobox", { name: "Filtrar por categoria" }).click();
    await page.keyboard.press("Escape");

    await page
      .locator("tbody tr[data-tx]")
      .first()
      .getByRole("button", { name: /^Ver detalhes de/ })
      .click();
    await page.keyboard.press("Escape");

    await expectPaletteClosesOnEscape(page);
  });
});
