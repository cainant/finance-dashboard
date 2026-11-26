import { expect, test } from "@playwright/test";

/**
 * Simula a API de produção (`ENABLE_DEMO_PROVIDER=false`): `/api/providers` não
 * lista demo e `/api/connections` está vazio. A UI não pode exibir nenhum CTA,
 * painel ou texto de demonstração e deve convidar ao MeuPluggy.
 */
const PROVIDERS = {
  data: [
    {
      id: "pluggy",
      name: "Pluggy",
      configured: true,
      description: "Open Finance via MeuPluggy: leitura dos seus próprios bancos, com dados reais.",
      supportsConnectWidget: true,
    },
  ],
};

test.describe("produção sem demonstração", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/providers", async (route) => {
      await route.fulfill({ json: PROVIDERS });
    });
    await page.route("**/api/connections", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: { data: [] } });
        return;
      }
      await route.continue();
    });
  });

  test("visão geral vazia convida a conectar o MeuPluggy", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Conecte seu MeuPluggy")).toBeVisible();
    await expect(page.getByRole("link", { name: "Conectar MeuPluggy" }).first()).toBeVisible();
    await expect(page.getByText(/demonstra/i)).toHaveCount(0);
  });

  test("conexões só oferece MeuPluggy e não menciona demo", async ({ page }) => {
    await page.goto("/connections");

    await expect(page.getByRole("heading", { level: 1, name: "Conexões" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Conectar MeuPluggy" }).first()).toBeVisible();
    await expect(page.getByText(/demonstra/i)).toHaveCount(0);
    await expect(page.getByText("Provider demo")).toHaveCount(0);
  });

  test("configurações não mencionam demo", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByRole("heading", { level: 1, name: "Configurações" })).toBeVisible();
    await expect(page.getByText("Pluggy").first()).toBeVisible();
    await expect(page.getByText(/demonstra/i)).toHaveCount(0);
  });
});
