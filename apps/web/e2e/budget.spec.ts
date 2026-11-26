import { expect, test, type APIRequestContext } from "@playwright/test";

import { API_HEADERS, ensureDemoData } from "./demo-data";

/**
 * Tela de Metas com a API real. As specs mexem no mesmo orçamento do usuário
 * demo, então rodam em série e cada uma começa do estado padrão (6 grupos,
 * 25/30/15/15/15/0, sem renda) gravado pela API.
 */
test.describe.configure({ mode: "serial" });

const DEFAULT_GROUPS = [
  ["Liberdade Financeira", 2500],
  ["Custos Fixos", 3000],
  ["Conforto", 1500],
  ["Metas", 1500],
  ["Prazeres", 1500],
  ["Conhecimento", 0],
] as const;

interface BudgetBody {
  data: {
    referenceIncomeCents: number | null;
    groups: { id: string; name: string; color: string; targetBps: number }[];
    categoryGroups: { categoryId: string; groupId: string }[];
  };
}

async function readBudget(request: APIRequestContext): Promise<BudgetBody["data"]> {
  const response = await request.get("/api/budget");
  expect(response.ok(), `GET /api/budget falhou (HTTP ${response.status()})`).toBeTruthy();
  return ((await response.json()) as BudgetBody).data;
}

/** Volta ao padrão: grupos padrão (pelos ids `<userId>:<slug>`), sem renda. */
async function resetBudget(request: APIRequestContext): Promise<BudgetBody["data"]> {
  const me = (await (await request.get("/api/auth/me")).json()) as { user: { id: string } };
  const current = await readBudget(request);
  const groups = DEFAULT_GROUPS.map(([name, targetBps]) => {
    const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-");
    const id = `${me.user.id}:${slug}`;
    const existing = current.groups.find((group) => group.id === id);
    return existing
      ? { id, name, color: existing.color, targetBps }
      : { name, color: "#64748b", targetBps };
  });
  const response = await request.put("/api/budget", {
    headers: API_HEADERS,
    data: { referenceIncomeCents: null, groups },
  });
  expect(response.ok(), `PUT /api/budget falhou (HTTP ${response.status()})`).toBeTruthy();
  const saved = ((await response.json()) as BudgetBody).data;

  // Remover "Conhecimento" desfaz o vínculo padrão de Educação; o grupo
  // recriado tem outro id, então o vínculo volta por aqui.
  const knowledge = saved.groups.find((group) => group.name === "Conhecimento");
  if (knowledge) {
    const link = await request.put("/api/budget/categories/cat_educacao", {
      headers: API_HEADERS,
      data: { groupId: knowledge.id },
    });
    expect(link.ok(), `PUT /api/budget/categories falhou (HTTP ${link.status()})`).toBeTruthy();
  }
  return readBudget(request);
}

test.beforeEach(async ({ request }) => {
  await resetBudget(request);
});

test.afterAll(async ({ request }) => {
  await resetBudget(request);
});

test("renda de referência recalcula os valores e as metas respeitam 100%", async ({ page }) => {
  await page.goto("/budget");
  await expect(page.getByRole("heading", { level: 1, name: "Metas" })).toBeVisible();
  const groups = page.locator('[data-slot="budget-group"]');
  await expect(groups).toHaveCount(6);
  await expect(page.locator('[data-slot="budget-allocated"]')).toContainText("100% / 100%");

  // Sem renda, o modo em reais fica indisponível.
  await expect(page.getByRole("radio", { name: "Valor (R$)" })).toBeDisabled();

  await page.getByLabel("Renda de referência mensal").fill("6.500,00");
  await page.getByRole("button", { name: "Salvar renda" }).click();
  await expect(page.getByText("Renda de referência salva")).toBeVisible();
  await expect(groups.nth(0)).toContainText("R$ 1.625,00 por mês");
  await expect(groups.nth(1)).toContainText("R$ 1.950,00 por mês");

  // 30% → 35% passa de 100%: aviso e salvar bloqueado.
  const fixed = page.getByLabel("Percentual de Custos Fixos");
  await fixed.fill("35");
  await fixed.press("Enter");
  await expect(page.locator('[data-slot="budget-allocated"]')).toContainText("105% / 100%");
  await expect(page.getByRole("alert")).toContainText("o máximo é 100%");
  const save = page.getByRole("button", { name: "Salvar metas" });
  await expect(save).toBeDisabled();

  // Conforto 15% → 10% volta a fechar 100%.
  const comfort = page.getByLabel("Percentual de Conforto");
  await comfort.fill("10");
  await comfort.press("Enter");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("Metas salvas")).toBeVisible();

  const saved = await readBudget(page.request);
  expect(saved.referenceIncomeCents).toBe(650_000);
  expect(saved.groups.map((group) => group.targetBps)).toEqual([2500, 3500, 1000, 1500, 1500, 0]);

  // Em reais: R$ 1.300,00 de 6.500 = 20% para Prazeres (era 15%; Livre some).
  await page.getByRole("radio", { name: "Valor (R$)" }).click();
  const pleasures = page.getByLabel("Valor mensal de Prazeres");
  await expect(pleasures).toHaveValue("975,00");
  await pleasures.fill("650,00");
  await pleasures.press("Enter");
  await expect(groups.nth(4)).toContainText("10% da renda");
  await expect(page.locator('[data-slot="budget-allocated"]')).toContainText("Livre: 5%");
});

test("grupo novo e grupo removido vão juntos no mesmo salvar", async ({ page }) => {
  await page.goto("/budget");
  const groups = page.locator('[data-slot="budget-group"]');
  await expect(groups).toHaveCount(6);

  await page.getByRole("button", { name: "Remover Conhecimento" }).click();
  await page.getByRole("button", { name: "Adicionar grupo" }).click();
  await expect(groups).toHaveCount(6);
  const name = groups.last().getByLabel("Nome do grupo");
  await name.fill("Viagens");
  await page.getByRole("button", { name: "Salvar metas" }).click();
  await expect(page.getByText("Metas salvas")).toBeVisible();

  const saved = await readBudget(page.request);
  expect(saved.groups.map((group) => group.name)).toEqual([
    "Liberdade Financeira",
    "Custos Fixos",
    "Conforto",
    "Metas",
    "Prazeres",
    "Viagens",
  ]);
});

test("categoria troca de grupo na hora", async ({ page }) => {
  await page.goto("/budget");
  const trigger = page.getByRole("combobox", { name: "Grupo de Lazer" });
  await expect(trigger).toContainText("Prazeres");

  await trigger.click();
  await page.getByRole("option", { name: "Conhecimento" }).click();
  await expect(trigger).toContainText("Conhecimento");

  await page.reload();
  await expect(page.getByRole("combobox", { name: "Grupo de Lazer" })).toContainText(
    "Conhecimento",
  );

  // Devolve o vínculo padrão.
  await page.getByRole("combobox", { name: "Grupo de Lazer" }).click();
  await page.getByRole("option", { name: "Prazeres" }).click();
  await expect(page.getByRole("combobox", { name: "Grupo de Lazer" })).toContainText("Prazeres");
});

test("detalhe da transação aceita um grupo só para ela", async ({ page, request }) => {
  await ensureDemoData(request);
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const list = (await (
    await request.get(`/api/transactions?from=${day(-25)}&to=${day(-2)}&type=expense&limit=50`)
  ).json()) as { data: { id: string; status: string; budgetGroupId: string | null }[] };
  const target = list.data.find((transaction) => transaction.status === "posted");
  expect(target, "demo sem despesa efetivada na janela padrão").toBeDefined();

  try {
    await page.goto(`/transactions?tx=${target!.id}`);
    const sheet = page.getByRole("dialog", { name: "Transação" });
    await expect(sheet).toBeVisible({ timeout: 30_000 });

    const select = sheet.getByRole("combobox", { name: "Grupo de metas" });
    await expect(select).toContainText("Da categoria");
    await select.click();
    await page.getByRole("option", { name: "Metas", exact: true }).click();
    await expect(select).toContainText("Metas");

    await expect
      .poll(async () => {
        const response = await request.get(
          `/api/transactions?from=${day(-25)}&to=${day(-2)}&type=expense&limit=50`,
        );
        const body = (await response.json()) as {
          data: { id: string; budgetGroupId: string | null }[];
        };
        return (
          body.data.find((transaction) => transaction.id === target!.id)?.budgetGroupId ?? null
        );
      })
      .toMatch(/:metas$/);
  } finally {
    await request.patch(`/api/transactions/${target!.id}`, {
      headers: API_HEADERS,
      data: { budgetGroupId: null },
    });
  }
});

test("realizado do mês bate com a API e navega entre meses", async ({ page, request }) => {
  await ensureDemoData(request);
  await request.put("/api/budget", {
    headers: API_HEADERS,
    data: { referenceIncomeCents: 650_000 },
  });
  // A tela usa o mês de São Paulo; o default da API é o mês UTC.
  const month = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const budget = await readBudget(request);
  const fixedId = budget.groups.find((group) => group.name === "Custos Fixos")!.id;
  const money = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  const card = page.locator('[data-slot="budget-progress"]');
  const rows = card.locator('[data-slot="budget-progress-row"]');

  // Outras specs mudam categorias do mesmo usuário em paralelo: API e tela são
  // lidas na mesma tentativa, recarregando até baterem.
  await expect(async () => {
    const response = await request.get(`/api/budget/progress?month=${month}`);
    const progress = (await response.json()) as {
      data: { groups: { groupId: string; spentCents: number; targetCents: number | null }[] };
    };
    const fixed = progress.data.groups.find((group) => group.groupId === fixedId)!;
    await page.goto("/budget");
    await expect(rows).toHaveCount(6);
    await expect(rows.nth(1)).toContainText(
      `${money(fixed.spentCents)} de ${money(fixed.targetCents!)}`,
      { timeout: 5_000 },
    );
  }).toPass({ timeout: 45_000 });
  await expect(card.getByRole("button", { name: "Próximo mês" })).toBeDisabled();

  const label = card.locator('[aria-live="polite"]');
  const before = await label.innerText();
  await card.getByRole("button", { name: "Mês anterior" }).click();
  await expect(label).not.toHaveText(before);
  await expect(card.getByRole("button", { name: "Próximo mês" })).toBeEnabled();
});
