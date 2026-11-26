import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { API_HEADERS, ensureDemoData } from "./demo-data";

/**
 * O sync aplica categorias de outra natureza: `PIX ENVIADO - <terceiro>` é
 * `type: expense` e cai na categoria de sistema "Transferências"
 * (`kind: transfer`, regra fraca de Pix em `mappers.ts`). Antes da correção o
 * gatilho mostrava "Transferências" mas a lista só tinha categorias de despesa:
 * nada aparecia marcado e, depois de trocar, não havia como voltar.
 *
 * As specs mexem na mesma linha do demo (o primeiro Pix do período), então
 * rodam em série; cada uma garante a premissa pela API, troca a categoria pela
 * UI — o caminho que ela prova — e devolve a categoria original no `finally`,
 * inclusive quando uma asserção falha no meio.
 */
test.describe.configure({ mode: "serial" });

/** Categoria de sistema que o sync aplica aos Pix enviados do demo. */
const TRANSFER_CATEGORY_SLUG = "transferencias";
/** Categoria de despesa usada no desvio. */
const EXPENSE_CATEGORY_NAME = "Mercado";
/** Texto do gatilho quando a linha não tem categoria. */
const NO_CATEGORY_LABEL = "Sem categoria";

async function categories(
  request: APIRequestContext,
): Promise<Array<{ id: string; slug: string; name: string }>> {
  const response = await request.get("/api/categories");
  expect(response.ok(), `GET /api/categories falhou (HTTP ${response.status()})`).toBeTruthy();

  const body = (await response.json()) as {
    data: Array<{ id: string; slug: string; name: string }>;
  };
  return body.data;
}

async function categoryIdBySlug(request: APIRequestContext, slug: string): Promise<string> {
  const category = (await categories(request)).find((item) => item.slug === slug);
  expect(category, `categoria "${slug}" não encontrada no seed`).toBeTruthy();
  return category!.id;
}

/** Id da categoria pelo nome exibido no gatilho; `null` para "Sem categoria". */
async function categoryIdByName(request: APIRequestContext, name: string): Promise<string | null> {
  if (name === NO_CATEGORY_LABEL) {
    return null;
  }

  const category = (await categories(request)).find((item) => item.name === name);
  expect(category, `categoria "${name}" não encontrada no seed`).toBeTruthy();
  return category!.id;
}

async function setCategory(
  request: APIRequestContext,
  transactionId: string,
  categoryId: string | null,
): Promise<void> {
  const response = await request.patch(`/api/transactions/${transactionId}`, {
    data: { categoryId },
    headers: API_HEADERS,
  });
  expect(response.ok(), `PATCH da categoria falhou (HTTP ${response.status()})`).toBeTruthy();
}

interface PixRow {
  /** Categoria que a linha tinha antes da spec (restaurada no fim). */
  originalCategoryId: string | null;
  transactionId: string;
}

/** Abre a lista de transações no primeiro Pix do demo e devolve o estado dele. */
async function openFirstPixRow(page: Page, request: APIRequestContext): Promise<PixRow> {
  await page.goto(`/transactions?period=90d&q=${encodeURIComponent("PIX ENVIADO")}`);
  const rows = page.locator("tbody tr[data-tx]");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });

  const transactionId = await rows.first().getAttribute("data-tx");
  expect(transactionId, "a linha do Pix precisa carregar o id da transação").toBeTruthy();

  const trigger = rows.first().getByRole("button", { name: /Alterar categoria/ });
  const originalCategoryId = await categoryIdByName(request, (await trigger.innerText()).trim());

  // Premissa: o Pix está em "Transferências", como o sync deixa.
  const transferCategoryId = await categoryIdBySlug(request, TRANSFER_CATEGORY_SLUG);
  await setCategory(request, transactionId!, transferCategoryId);
  await page.reload();
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  await expect(trigger).toHaveText(/Transferências/);

  return { originalCategoryId, transactionId: transactionId! };
}

test.describe("seletor de categoria com a categoria atual de outra natureza", () => {
  test.beforeAll(async ({ request }) => {
    await ensureDemoData(request);
  });

  test("Pix enviado em Transferências: marcada no topo, troca e volta", async ({
    page,
    request,
  }) => {
    const { originalCategoryId, transactionId } = await openFirstPixRow(page, request);
    const rows = page.locator("tbody tr[data-tx]");
    const trigger = rows.first().getByRole("button", { name: /Alterar categoria/ });

    try {
      await trigger.click();
      const listbox = page.getByRole("listbox", { name: "Categorias" });
      await expect(listbox).toBeVisible();

      // 1. A categoria atual aparece, marcada, fixa logo depois de "Sem categoria".
      const pinned = listbox.getByRole("option", { name: "Transferências", exact: true });
      await expect(pinned).toBeVisible();
      await expect(pinned).toHaveCount(1);
      await expect(pinned).toHaveAttribute("aria-selected", "true");
      await expect(listbox.getByRole("option").nth(0)).toHaveText(/Sem categoria/);
      await expect(listbox.getByRole("option").nth(1)).toHaveAttribute(
        "data-slot",
        "pinned-category",
      );

      // 2. A indicação discreta de que ela é de outra natureza (badge + descrição).
      await expect(pinned.getByText("Transferência", { exact: true })).toBeVisible();
      await expect(pinned).toHaveAccessibleDescription(
        /fora da natureza deste lançamento \(despesa\)/,
      );

      // 3. Trocar para uma categoria de despesa funciona como antes.
      await listbox.getByRole("option", { name: EXPENSE_CATEGORY_NAME, exact: true }).click();
      await expect(listbox).toBeHidden();
      await expect(trigger).toHaveText(new RegExp(EXPENSE_CATEGORY_NAME), { timeout: 15_000 });

      // 4. Reabrir: a nova categoria (mesma natureza) está marcada na lista normal
      //    e "Transferências" continua fixa no topo, agora sem marca — é o
      //    caminho de volta.
      await trigger.click();
      await expect(listbox).toBeVisible();
      await expect(
        listbox.getByRole("option", { name: EXPENSE_CATEGORY_NAME, exact: true }),
      ).toHaveAttribute("aria-selected", "true");

      const backToTransfers = listbox.getByRole("option", {
        name: "Transferências",
        exact: true,
      });
      await expect(backToTransfers).toBeVisible();
      await expect(backToTransfers).toHaveAttribute("aria-selected", "false");
      await expect(listbox.getByRole("option").nth(1)).toHaveAttribute(
        "data-slot",
        "pinned-category",
      );
      await backToTransfers.click();
      await expect(listbox).toBeHidden();
      await expect(trigger).toHaveText(/Transferências/, { timeout: 15_000 });

      // 5. De volta ao estado original: a fixada é a própria categoria, marcada.
      await trigger.click();
      await expect(listbox).toBeVisible();
      await expect(
        listbox.getByRole("option", { name: "Transferências", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
    } finally {
      // As outras specs contam com o dataset demo intacto.
      await setCategory(request, transactionId, originalCategoryId);
    }
  });

  test("no painel da transação a troca também é reversível", async ({ page, request }) => {
    const { originalCategoryId, transactionId } = await openFirstPixRow(page, request);
    const rows = page.locator("tbody tr[data-tx]");
    const sheet = page.getByRole("dialog", { name: "Transação" });

    try {
      await rows
        .first()
        .getByRole("button", { name: /^Ver detalhes de/ })
        .click();
      await expect(sheet).toBeVisible();

      const trigger = sheet.getByRole("button", { name: /Alterar categoria/ });
      const listbox = page.getByRole("listbox", { name: "Categorias" });

      // A categoria atual está marcada também no painel...
      await trigger.click();
      await expect(listbox).toBeVisible();
      const pinned = listbox.getByRole("option", { name: "Transferências", exact: true });
      await expect(pinned).toHaveAttribute("aria-selected", "true");

      // ...e depois da troca ela continua no topo, sem marca, como caminho de volta.
      await listbox.getByRole("option", { name: EXPENSE_CATEGORY_NAME, exact: true }).click();
      await expect(listbox).toBeHidden();
      await expect(trigger).toHaveText(new RegExp(EXPENSE_CATEGORY_NAME), { timeout: 15_000 });

      await trigger.click();
      await expect(listbox).toBeVisible();
      const backToTransfers = listbox.getByRole("option", {
        name: "Transferências",
        exact: true,
      });
      await expect(backToTransfers).toHaveAttribute("aria-selected", "false");
      await backToTransfers.click();
      await expect(listbox).toBeHidden();
      await expect(trigger).toHaveText(/Transferências/, { timeout: 15_000 });
    } finally {
      await setCategory(request, transactionId, originalCategoryId);
    }
  });
});
