import { expect, test, type APIRequestContext } from "@playwright/test";

import { API_HEADERS, ensureDemoData } from "./demo-data";

/**
 * Reserva para faturas com a API real: escolher "Guardar a cada compra" e a
 * reserva no cartão, ver a situação em Cartões e o aviso na Visão geral. Cada
 * spec devolve todos os cartões a "pagar no vencimento" no fim.
 */
test.describe.configure({ mode: "serial" });

interface CardsBody {
  data: { accountId: string; account: { id: string; name: string } }[];
}

async function creditCards(request: APIRequestContext): Promise<CardsBody["data"]> {
  const response = await request.get("/api/credit-cards");
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as CardsBody).data;
}

async function resetPlans(request: APIRequestContext): Promise<void> {
  for (const card of await creditCards(request)) {
    const response = await request.put(`/api/credit-cards/${card.accountId}/payment-plan`, {
      headers: API_HEADERS,
      data: { mode: "pay_on_due" },
    });
    expect(response.ok()).toBeTruthy();
  }
}

test.beforeEach(async ({ request }) => {
  await ensureDemoData(request);
  await resetPlans(request);
});

test.afterAll(async ({ request }) => {
  await resetPlans(request);
});

test("guardar a cada compra: escolhe a reserva e mostra quanto falta", async ({
  page,
  request,
}) => {
  const [card] = await creditCards(request);
  expect(card, "demo sem cartão").toBeDefined();

  await page.goto(`/credit-cards?card=${card!.accountId}`);
  const plan = page.locator('[data-slot="card-payment-plan"]');
  await expect(plan).toBeVisible({ timeout: 30_000 });
  await expect(plan.getByRole("radio", { name: "Pagar no vencimento" })).toHaveAttribute(
    "data-state",
    "on",
  );
  // Sem cartão em modo reserva, a página não mostra o card de reserva.
  await expect(page.locator('[data-slot="card-reserves"]')).toHaveCount(0);

  await plan.getByRole("radio", { name: "Guardar a cada compra" }).click();
  await expect(page.getByText("Forma de pagamento do cartão salva")).toBeVisible();
  // Modo reserva sem fonte: pede a escolha nos dois lugares.
  await expect(plan.getByText("Escolha a reserva")).toBeVisible();
  await expect(page.locator('[data-slot="card-reserves"]')).toContainText("Escolher reserva");

  await plan.getByRole("combobox", { name: "Reserva do cartão" }).click();
  const option = page.getByRole("option").first();
  const sourceName = (await option.innerText()).split(" · ")[0]!.trim();
  await option.click();

  const status = plan.locator('[data-slot="reserve-status"]');
  await expect(status).toContainText(sourceName, { timeout: 15_000 });
  await expect(page.locator('[data-slot="card-reserves"]')).toContainText(card!.account.name);

  // A tela repete os números da API.
  const reserves = (await (await request.get("/api/card-reserves")).json()) as {
    data: { reserves: { gapCents: number; neededCents: number }[] };
  };
  const reserve = reserves.data.reserves[0]!;
  const money = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  await expect(status).toContainText(money(reserve.neededCents));
  await expect(status).toContainText(
    reserve.gapCents > 0 ? `Guarde mais ${money(reserve.gapCents)}` : "A reserva cobre as faturas",
  );

  // Voltar a pagar no vencimento some com a reserva.
  await plan.getByRole("radio", { name: "Pagar no vencimento" }).click();
  await expect(page.locator('[data-slot="card-reserves"]')).toHaveCount(0);
});

test("reserva com falta vira aviso na Visão geral", async ({ page }) => {
  // O demo não garante falta na reserva (as contas têm saldo alto): a API é
  // simulada com o exemplo do pedido. O cálculo real está em
  // apps/api/test/card-reserves.test.ts.
  await page.route("**/api/card-reserves", (route) =>
    route.fulfill({
      json: {
        data: {
          plans: [],
          unconfiguredCardIds: [],
          reserves: [
            {
              source: {
                kind: "account",
                id: "poupanca",
                name: "Poupança Fatura",
                institutionName: null,
              },
              cards: [{ accountId: "cartao", name: "Cartão Aurora", neededCents: 45_000 }],
              neededCents: 45_000,
              reservedCents: 30_000,
              gapCents: 15_000,
              lastDepositDate: "2026-11-12",
              spentSinceDepositCents: 15_000,
            },
          ],
        },
      },
    }),
  );

  await page.goto("/");
  const strip = page.locator('[data-slot="overview-attention"]');
  await expect(strip).toContainText("Guarde mais R$ 150,00 em Poupança Fatura", {
    timeout: 30_000,
  });
  await expect(strip).toContainText("Gastou R$ 150,00 no crédito desde 12/11/2026");
});
