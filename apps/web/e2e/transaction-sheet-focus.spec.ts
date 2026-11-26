import { expect, test } from "@playwright/test";

import { ensureDemoData } from "./demo-data";

/**
 * Acessibilidade do painel de transação: ao fechar, o foco volta para o item
 * que abriu. A tabela virtualizada remonta quando o layout troca (tabela ↔
 * cartões do mobile, refetch); o `onCloseAutoFocus` guardava o nó antigo e o
 * foco caía no `body` (flake do CI em `flows.spec.ts`, "painel na URL").
 */
test("foco volta para a linha mesmo se a tabela remontar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const response = await page.request.post("/api/auth/login", {
    data: { email: "demo@finance.local", password: "demo1234" },
    headers: { "x-requested-with": "fetch" },
  });
  expect(response.ok()).toBeTruthy();

  // Mesmo motivo de palette-escape: o dataset demo não pode ser pressuposto.
  await ensureDemoData(page.request);
  await page.goto("/transactions");
  const rows = page.locator("tbody tr[data-tx]");
  await expect(rows.first()).toBeVisible({ timeout: 60_000 });

  const txId = await rows.first().getAttribute("data-tx");
  expect(txId, "linha sem data-tx").toBeTruthy();
  const opener = page
    .locator(`tbody tr[data-tx="${txId}"]`)
    .getByRole("button", { name: /^Ver detalhes de/ });

  await opener.click();
  const sheet = page.getByRole("dialog", { name: "Transação" });
  await expect(sheet).toBeVisible();

  // Abaixo de `md` a tabela dá lugar aos cartões; ao voltar, a tabela é outra.
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(page.locator('[data-slot="transactions-cards"] li[data-tx]').first()).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(rows.first()).toBeVisible();

  await sheet.getByRole("button", { name: "Fechar" }).first().click();
  await expect(sheet).toBeHidden();

  // O nó que abriu o painel não existe mais: o foco tem de ser reencontrado
  // pelo `data-tx`, não cair no body.
  await expect(opener).toBeFocused();
});
