import { expect, test } from "@playwright/test";

/**
 * Busca de transações: trocar o filtro não pode derrubar a lista atual nem
 * misturar paginação de recortes diferentes.
 *
 * A API é substituída por respostas fixas (lista anterior e lista nova, esta
 * última segurada) para o estado de carregamento ficar observável e o teste
 * não depender do volume de dados do seed. A lista anterior tem `nextCursor`
 * para provar que "carregar mais" fica desligado enquanto ela é a exibida.
 */
const transaction = (id: string, description: string) => ({
  id,
  userId: "u1",
  accountId: "a1",
  connectionId: "c1",
  externalId: `ext-${id}`,
  date: "2026-11-05",
  description,
  amountCents: -1_000,
  currency: "BRL",
  type: "expense",
  categoryId: null,
  status: "posted",
  billId: null,
  merchant: null,
  notes: null,
  installmentNumber: null,
  totalInstallments: null,
  budgetGroupId: null,
  createdAt: "2026-11-05T12:00:00.000Z",
  updatedAt: "2026-11-05T12:00:00.000Z",
  category: null,
  account: null,
});

const previousList = {
  // Lista longa o bastante para a virtualização não pedir a próxima página
  // sozinha no primeiro render: o `nextCursor` só aparece se a guarda falhar.
  data: [
    transaction("anterior-1", "Padaria Aurora"),
    ...Array.from({ length: 29 }, (_, index) =>
      transaction(`anterior-${index + 2}`, `Lançamento ${index + 2}`),
    ),
  ],
  page: { cursor: null, nextCursor: "c1" },
};

const nextList = {
  data: [transaction("nova-1", "Mercado Central")],
  page: { cursor: null, nextCursor: null },
};

test("busca: a lista anterior permanece visível enquanto a nova busca carrega", async ({
  page,
}) => {
  let release: () => void = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  /** URLs pedidas a partir da digitação, para checar que nenhum cursor vaza. */
  const requestedAfterTyping: URL[] = [];
  let tracking = false;

  await page.route("**/api/transactions?*", async (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get("q");
    const cursor = url.searchParams.get("cursor");

    if (tracking) {
      requestedAfterTyping.push(url);
    }

    // Paginação: responde vazio para não girar em loop, com ou sem filtro.
    if (cursor) {
      await route.fulfill({ json: { data: [], page: { cursor, nextCursor: null } } });
      return;
    }

    if (q === null) {
      await route.fulfill({ json: previousList });
      return;
    }

    await released;
    await route.fulfill({ json: nextList });
  });

  await page.goto("/transactions");

  const table = page.locator('[data-slot="transactions-table"]');
  await expect(table).toBeVisible();
  await expect(table).toContainText("Padaria Aurora");
  // A lista anterior termina de carregar sozinha (o cursor "c1" responde
  // vazio) antes da digitação: assim nenhum lote de fundo vaza para a janela
  // observada e o teste mede só o que a troca de filtro provoca.
  await expect(page.getByText("Fim da lista")).toBeVisible();

  tracking = true;
  await page.getByLabel("Buscar transações").fill("mercado");

  // Debounce curto + fetch em andamento (resposta segurada): a lista anterior
  // continua na tela, sem esqueleto, e o único sinal é o indicador na busca.
  await expect(page.locator('[data-slot="transactions-refreshing"]')).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await expect(table).toBeVisible();
  await expect(table).toContainText("Padaria Aurora");

  // O carregamento em segundo plano não pode pedir página com o cursor do
  // recorte antigo enquanto o recorte novo está em voo (e não existe mais
  // botão "Carregar mais": a lista sempre carrega sozinha).
  await expect(page.getByRole("button", { name: "Carregar mais" })).toHaveCount(0);
  expect(requestedAfterTyping.filter((url) => url.searchParams.get("cursor"))).toEqual([]);

  release();

  // A resposta nova chega: a lista troca e o indicador some.
  await expect(page.locator('[data-slot="transactions-refreshing"]')).toBeHidden();
  await expect(page).toHaveURL(/q=mercado/);
  await expect(table).toContainText("Mercado Central");
  await expect(table).not.toContainText("Padaria Aurora");
});
