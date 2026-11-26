import { expect, test, type Page } from "@playwright/test";

import { ensureDemoData } from "./demo-data";

/**
 * Regressão do comparativo mensal: em 1280/1440 o card ocupa a coluna inteira
 * e a tabela de variações não cria rolagem horizontal.
 */
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await ensureDemoData(request);
});

async function waitForAnalytics(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: "Análises" })).toBeVisible();
  await expect(page.getByText("Receitas vs. despesas").first()).toBeVisible({
    timeout: 30_000,
  });
  const table = page.locator('[data-slot="monthly-comparison-table"]').first();
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(table.locator("tbody tr").first()).toBeVisible();
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

for (const width of [1280, 1440]) {
  test(`comparativo mensal sem rolagem horizontal em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/analytics");
    await waitForAnalytics(page);

    const metrics = await page.evaluate(() => {
      const table = document.querySelector<HTMLElement>('[data-slot="monthly-comparison-table"]');
      return {
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        tableScrollOverflow: table ? table.scrollWidth - table.clientWidth : -1,
      };
    });

    expect(metrics.pageOverflow).toBeLessThanOrEqual(1);
    expect(metrics.tableScrollOverflow).toBeLessThanOrEqual(1);
  });
}
