import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { ensureDemoData } from "./demo-data";

/**
 * Gera as imagens de revisão em docs/screenshots com dados reais do demo.
 * Uso local: CAPTURE_SCREENSHOTS=1 pnpm --filter @fd/web exec playwright test e2e/screenshots.spec.ts
 * No CI os testes são pulados (as imagens ficam versionadas no PR).
 */
const capture = process.env.CAPTURE_SCREENSHOTS === "1";
const outputDir = fileURLToPath(new URL("../../../docs/screenshots", import.meta.url));

type Theme = "dark" | "light";

/** Usuário do seed local/CI; as telas de dados exigem sessão. */
async function loginAsDemo(page: Page): Promise<void> {
  const response = await page.request.post("/api/auth/login", {
    data: { email: "demo@finance.local", password: "demo1234" },
    headers: { "x-requested-with": "fetch" },
  });

  expect(response.ok(), `login demo falhou (HTTP ${response.status()})`).toBeTruthy();
}

/**
 * Espera o carregamento real antes do screenshot: sem skeletons visíveis,
 * rede ociosa e um respiro para os gráficos terminarem de animar.
 */
async function waitForData(
  page: Page,
  options: { waitForSkeletons?: boolean } = {},
): Promise<void> {
  await page.waitForLoadState("networkidle");

  if (options.waitForSkeletons !== false) {
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

  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(900);
}

async function prepare(
  page: Page,
  theme: Theme,
  path = "/",
  options: { authenticated?: boolean; waitForSkeletons?: boolean } = {},
): Promise<void> {
  if (options.authenticated !== false) {
    await loginAsDemo(page);
  }

  await page.addInitScript((value) => {
    window.localStorage.setItem("lumen:theme", value);
  }, theme);
  await page.goto(path);
  if (theme === "dark") {
    await expect(page.locator("html")).toHaveClass(/dark/);
  } else {
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  }
  await waitForData(page, { waitForSkeletons: options.waitForSkeletons });
  mkdirSync(outputDir, { recursive: true });
}

interface ScreenshotPage {
  key: string;
  path: string;
  heading: string;
  /** Conteúdo que só aparece depois dos dados carregarem. */
  ready: (page: Page) => Promise<void>;
}

const PAGES: ScreenshotPage[] = [
  {
    key: "shell",
    path: "/",
    heading: "Visão geral",
    ready: async (page) => {
      const main = page.getByRole("main");
      await expect(main.getByText("Despesas por categoria")).toBeVisible();
      await expect(
        main.locator('[data-slot="kpi-card"]').first().locator('[data-slot="money"]'),
      ).toContainText(/R\$/);
    },
  },
  {
    key: "accounts",
    path: "/accounts",
    heading: "Contas",
    ready: async (page) => {
      await expect(page.getByRole("main").getByText("Banco Aurora").first()).toBeVisible();
    },
  },
  {
    key: "transactions",
    path: "/transactions",
    heading: "Transações",
    ready: async (page) => {
      const main = page.getByRole("main");
      // Desktop usa tabela; abaixo de `md` a lista de cartões virtualizada.
      await expect(
        main.locator('[data-slot="transactions-table"], [data-slot="transactions-cards"]').first(),
      ).toBeVisible();
      await expect(
        main.locator('tbody tr[data-tx], [data-slot="transactions-cards"] li[data-tx]').first(),
      ).toBeVisible();
    },
  },
  {
    key: "credit-cards",
    path: "/credit-cards",
    heading: "Cartões",
    ready: async (page) => {
      const main = page.getByRole("main");
      await expect(main.getByText(/Cartão Aurora/i).first()).toBeVisible();
      await expect(main.locator('[data-slot="credit-card-tile"]').first()).toBeVisible();
    },
  },
  {
    key: "analytics",
    path: "/analytics",
    heading: "Análises",
    ready: async (page) => {
      const main = page.getByRole("main");
      await expect(main.getByText("Fluxo de caixa").first()).toBeVisible();
      await expect(main.getByText("Gastos por categoria")).toBeVisible();
    },
  },
  {
    key: "connections",
    path: "/connections",
    heading: "Conexões",
    ready: async (page) => {
      await expect(page.getByRole("main").getByText("Banco Aurora").first()).toBeVisible();
    },
  },
  {
    key: "settings",
    path: "/settings",
    heading: "Configurações",
    ready: async (page) => {
      await expect(
        page.getByRole("main").getByRole("heading", { name: "Aparência" }),
      ).toBeVisible();
    },
  },
];

async function capturePage(page: Page, entry: ScreenshotPage, suffix: string): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: entry.heading })).toBeVisible();
  await waitForData(page);
  await entry.ready(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(outputDir, `${entry.key}-${suffix}.png`), fullPage: true });
}

async function captureAccountDetail(page: Page, theme: Theme, suffix: string): Promise<void> {
  await prepare(page, theme, "/accounts");
  await page
    .getByRole("link", { name: /Conta Corrente/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Conta Corrente" })).toBeVisible();
  await waitForData(page);
  await expect(page.getByText("Transações da conta")).toBeVisible();
  await page.screenshot({
    path: join(outputDir, `account-detail-${suffix}.png`),
    fullPage: true,
  });
}

test.describe("screenshots de revisão", () => {
  test.skip(!capture, "defina CAPTURE_SCREENSHOTS=1 para gerar as imagens");
  test.describe.configure({ mode: "serial", timeout: 120_000 });
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeAll(async ({ request }) => {
    await ensureDemoData(request);
  });

  for (const theme of ["dark", "light"] as const) {
    test(`desktop ${theme}: cada página`, async ({ page }) => {
      for (const entry of PAGES) {
        await prepare(page, theme, entry.path);
        await capturePage(page, entry, `desktop-${theme}`);
      }
      await captureAccountDetail(page, theme, `desktop-${theme}`);
    });
  }

  test("login desktop dark e light", async ({ page }) => {
    for (const theme of ["dark", "light"] as const) {
      await page.context().clearCookies();
      await prepare(page, theme, "/login", { authenticated: false });
      await expect(page.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();
      await page.screenshot({ path: join(outputDir, `login-desktop-${theme}.png`) });
    }
  });

  test("showcase de componentes dark", async ({ page }) => {
    await prepare(page, "dark", "/dev-ui", { waitForSkeletons: false });
    await expect(page.getByRole("heading", { level: 1, name: "Lumen UI" })).toBeVisible();
    await page.screenshot({ path: join(outputDir, "components-desktop-dark.png") });
  });

  test("showcase de KPIs dark", async ({ page }) => {
    await prepare(page, "dark", "/dev-ui", { waitForSkeletons: false });
    await page.locator("#kpis").scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(outputDir, "components-kpis-dark.png") });
  });

  test("desktop dark: ocultar valores, paleta e sidebar recolhida", async ({ page }) => {
    await prepare(page, "dark", "/");

    await page.getByRole("button", { name: "Ocultar valores" }).click();
    await expect(page.locator('[data-slot="kpi-card"] [data-slot="money"]').first()).toHaveText(
      /R\$\s*••••/,
    );
    await page.screenshot({
      path: join(outputDir, "shell-hide-values-desktop-dark.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Mostrar valores" }).click();

    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog");
    await expect(palette).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(outputDir, "command-palette-desktop-dark.png") });
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();

    await page.getByRole("button", { name: "Recolher menu lateral" }).click();
    await expect(page.locator('[data-slot="app-sidebar"]')).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    await page.screenshot({
      path: join(outputDir, "shell-collapsed-desktop-dark.png"),
      fullPage: true,
    });
  });

  test("desktop dark: painel lateral de transação", async ({ page }) => {
    await prepare(page, "dark", "/transactions");
    await page
      .locator("tbody tr[data-tx]")
      .first()
      .getByRole("button", { name: /^Ver detalhes de/ })
      .click();
    await expect(page.getByRole("dialog", { name: "Transação" })).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(outputDir, "transactions-sheet-desktop-dark.png") });
  });
});

test.describe("screenshots mobile", () => {
  test.skip(!capture, "defina CAPTURE_SCREENSHOTS=1 para gerar as imagens");
  test.describe.configure({ mode: "serial", timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

  test.beforeAll(async ({ request }) => {
    await ensureDemoData(request);
  });

  test("mobile dark: cada página", async ({ page }) => {
    for (const entry of PAGES) {
      await prepare(page, "dark", entry.path);
      await capturePage(page, entry, "mobile-dark");
    }
    await captureAccountDetail(page, "dark", "mobile-dark");
  });

  test("mobile dark: tela Mais", async ({ page }) => {
    await prepare(page, "dark", "/more");
    await expect(page.getByRole("heading", { level: 1, name: "Mais" })).toBeVisible();
    await page.screenshot({ path: join(outputDir, "shell-mobile-more-dark.png") });
  });

  test("login mobile dark", async ({ page }) => {
    await page.context().clearCookies();
    await prepare(page, "dark", "/login", { authenticated: false });
    await expect(page.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();
    await page.screenshot({ path: join(outputDir, "login-mobile-dark.png") });
  });

  test("mobile dark: transações com painel aberto", async ({ page }) => {
    await prepare(page, "dark", "/transactions");
    await page
      .locator('[data-slot="transactions-cards"] li[data-tx]')
      .first()
      .getByRole("button", { name: /^Ver detalhes de/ })
      .click();
    await expect(page.getByRole("dialog", { name: "Transação" })).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(outputDir, "transactions-sheet-mobile-dark.png") });
  });
});
