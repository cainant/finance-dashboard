import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";

import {
  countTransactionsInPeriod,
  ensureDemoData,
  isPartialDemoConnection,
  listDemoConnections,
  syncPendingDemoConnections,
} from "./demo-data";

/**
 * Fluxos principais com a API real e o usuário demo do seed.
 * O estado de sessão vem do projeto `setup` (e2e/auth.setup.ts), exceto no
 * primeiro bloco, que exercita o login pela UI.
 */
/** Descrição de uma despesa efetivada entre hoje-25 e hoje-2 (dentro dos "últimos 30 dias"). */
async function descriptionInDefaultWindow(request: APIRequestContext): Promise<string> {
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const response = await request.get(
    `/api/transactions?from=${day(-25)}&to=${day(-2)}&type=expense&limit=50`,
  );
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    data: { description: string; status: string }[];
  };
  const target = body.data.find((transaction) => transaction.status === "posted");
  expect(target, "demo sem despesa efetivada na janela padrão").toBeDefined();
  return target!.description;
}

// Serial: cada teste reaproveita os dados do demo do anterior.
test.describe.configure({ mode: "serial" });

test.describe("fluxos principais", () => {
  test.describe("login e demonstração", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("login, conectar demonstração, overview e transações", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();

      await page.getByLabel("E-mail").fill("demo@finance.local");
      await page.getByLabel("Senha").fill("demo1234");
      await page.getByRole("button", { name: "Entrar", exact: true }).click();

      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();

      // Decide o caminho pelo estado real da API (não pela contagem de um
      // botão que pode ainda não ter renderizado).
      const demo = await listDemoConnections(page.request);

      if (demo.length === 0) {
        // Banco vazio: exercita o fluxo real de "Conectar demonstração".
        const connectDemo = page.getByRole("button", { name: "Conectar demonstração" });
        await expect(connectDemo).toBeVisible({ timeout: 30_000 });
        await connectDemo.click();
        await expect(page.getByText("Dados de demonstração conectados")).toBeVisible({
          timeout: 120_000,
        });
      } else if (demo.some(isPartialDemoConnection)) {
        // Conexões existentes sem sync: garante via API e recarrega a UI.
        await syncPendingDemoConnections(page.request);
        await page.reload();
      }

      // A UI precisa continuar chamando o sync fatiado até o fim; o histórico
      // de 12 meses do demo tem ~760 transações (uma fatia deixa ~576).
      await expect
        .poll(
          async () => {
            const latest = await listDemoConnections(page.request);
            return latest.filter(isPartialDemoConnection).length;
          },
          { timeout: 180_000, message: "histórico demo ainda tem fatias pendentes" },
        )
        .toBe(0);

      const now = new Date();
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))
        .toISOString()
        .slice(0, 10);
      const to = now.toISOString().slice(0, 10);
      const historyCount = await countTransactionsInPeriod(page.request, from, to);
      expect(historyCount, "histórico demo de 12 meses incompleto").toBeGreaterThan(700);

      const monthlyResponse = await page.request.get("/api/analytics/monthly?months=12");
      expect(monthlyResponse.ok()).toBeTruthy();
      const monthly = (await monthlyResponse.json()) as { data: unknown[] };
      expect(monthly.data).toHaveLength(12);

      // KPIs reais (não mais "aguardando sincronização").
      const firstKpi = page.locator('[data-slot="kpi-card"]').first();
      await expect(firstKpi).toContainText("Saldo consolidado");
      await expect(firstKpi.locator('[data-slot="money"]')).toContainText(/R\$/, {
        timeout: 30_000,
      });
      await expect(page.getByText("Demonstração").first()).toBeVisible();

      // Transações: busca com debounce + tabela virtualizada.
      await page.getByRole("link", { name: "Transações", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Transações" })).toBeVisible();
      await expect(page.getByRole("table")).toBeVisible({ timeout: 30_000 });

      // O demo varia com a data: um termo fixo ("mercado") some da janela padrão
      // de 30 dias em alguns dias. Busca a descrição de uma transação que está
      // na janela, com 2 dias de folga em cada ponta (a tela usa o dia de São
      // Paulo; o demo, o dia UTC).
      const term = await descriptionInDefaultWindow(page.request);
      const search = page.getByLabel("Buscar transações");
      await search.fill(term);
      await expect(page).toHaveURL(/q=/);

      // `tbody` também tem a linha de cabeçalho do dia; só as transações têm `data-tx`.
      const rows = page.locator("tbody tr[data-tx]");
      await expect(rows.first()).toContainText(term, { timeout: 20_000 });

      // O painel lateral é o lugar de editar categoria e anotação.
      await rows
        .first()
        .getByRole("button", { name: /^Ver detalhes de/ })
        .click();

      const sheet = page.getByRole("dialog", { name: "Transação" });
      await expect(sheet).toBeVisible();

      // Escolhe uma categoria diferente da atual (o teste precisa ser
      // idempotente entre execuções).
      const categoryButton = sheet.getByRole("button", { name: /Alterar categoria/ });
      const currentCategory = (await categoryButton.innerText()).trim();
      await categoryButton.click();

      const options = page.getByRole("option");
      await expect(options.first()).toBeVisible();
      const optionCount = await options.count();
      let changed = false;
      for (let index = 1; index < optionCount; index += 1) {
        const option = options.nth(index);
        if ((await option.innerText()).trim() !== currentCategory) {
          await option.click();
          changed = true;
          break;
        }
      }

      expect(changed).toBeTruthy();
      await expect(page.getByText("Categoria atualizada").first()).toBeVisible({ timeout: 20_000 });

      // Anotação salva ao sair do campo (com toast de desfazer).
      const notes = sheet.getByLabel("Anotação");
      const currentNote = await notes.inputValue();
      await notes.fill(currentNote === "Revisado no e2e" ? "Revisado no e2e 2" : "Revisado no e2e");
      await notes.blur();
      await expect(page.getByText("Anotação salva").first()).toBeVisible({ timeout: 20_000 });

      await sheet.getByRole("button", { name: "Fechar" }).first().click();
      await expect(sheet).toBeHidden();

      // Resumo do filtro: receitas e despesas (valores da API, não da página).
      const summary = page.locator('[data-slot="transactions-summary"]');
      await expect(summary.getByText("Receitas")).toBeVisible();
      await expect(summary.getByText("Despesas")).toBeVisible();
    });
  });

  test("resumo do filtro cobre o período inteiro e não muda ao carregar mais", async ({ page }) => {
    await ensureDemoData(page.request);

    // Período fixo, 90 dias fechados na véspera: mais de uma página (> 50
    // lançamentos) sem depender do "hoje" do navegador.
    const now = Date.now();
    const to = new Date(now - 86_400_000).toISOString().slice(0, 10);
    const from = new Date(now - 90 * 86_400_000).toISOString().slice(0, 10);

    const response = await page.request.get(`/api/transactions/summary?from=${from}&to=${to}`);
    expect(response.ok(), "GET /api/transactions/summary falhou").toBeTruthy();
    const summary = (await response.json()) as {
      totalCount: number;
      incomeCents: number;
      expensesCents: number;
      resultCents: number;
    };
    expect(summary.totalCount, "o período precisa de mais de uma página").toBeGreaterThan(50);

    await page.goto(`/transactions?period=custom&from=${from}&to=${to}`);

    const card = page.locator('[data-slot="transactions-summary"]');
    await expect(card).toContainText("Receitas");
    await expect(card.locator('[data-slot="skeleton"]')).toHaveCount(0, { timeout: 30_000 });

    // O card nunca avisa recorte parcial: o agregado é do filtro inteiro.
    await expect(card).not.toContainText("carregado");

    // Os valores exibidos são os da API (centavos -> BRL), não os das 50 linhas.
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    const format = (cents: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
    const money = card.locator('[data-slot="money"]');
    await expect
      .poll(async () => normalize((await money.nth(0).getAttribute("title")) ?? ""))
      .toBe(normalize(format(summary.incomeCents)));

    // A lista baixa as páginas seguintes sozinha, em lotes, sem botão: o
    // rodapé chega ao fim e fecha com o N do agregado (não com o das 50
    // primeiras linhas). Carregar mais páginas nunca muda o resumo.
    const moneyBefore = (await money.allInnerTexts()).map((value) => normalize(value));
    const count = page.locator('[data-slot="transactions-count"]');

    await expect(page.getByText("Fim da lista")).toBeVisible({ timeout: 30_000 });
    await expect(count).toHaveText(`${summary.totalCount.toLocaleString("pt-BR")} lançamentos`);
    await expect(page.getByRole("button", { name: "Carregar mais" })).toHaveCount(0);
    await expect
      .poll(async () => (await money.allInnerTexts()).map((value) => normalize(value)))
      .toEqual(moneyBefore);
  });

  test("exportar baixa o período inteiro, não só as páginas carregadas", async ({ page }) => {
    await ensureDemoData(page.request);

    // Janela de 365 dias fechada: mais de um lote de exportação (200 linhas).
    const now = Date.now();
    const to = new Date(now - 86_400_000).toISOString().slice(0, 10);
    const from = new Date(now - 365 * 86_400_000).toISOString().slice(0, 10);

    const response = await page.request.get(`/api/transactions/summary?from=${from}&to=${to}`);
    expect(response.ok(), "GET /api/transactions/summary falhou").toBeTruthy();
    const summary = (await response.json()) as { totalCount: number };
    expect(
      summary.totalCount,
      "o período precisa de mais de um lote de exportação",
    ).toBeGreaterThan(200);

    await page.goto(`/transactions?period=custom&from=${from}&to=${to}`);

    // Sem esperar a lista terminar: a exportação percorre o filtro sozinha.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exportar" }).click(),
    ]);

    const filePath = await download.path();
    expect(filePath, "download sem arquivo").toBeTruthy();
    const lines = readFileSync(filePath!, "utf8").trimEnd().split("\r\n");

    // Cabeçalho + uma linha por lançamento do filtro inteiro.
    expect(download.suggestedFilename()).toBe(`lumen-transacoes-${from}-a-${to}.csv`);
    expect(lines[0]).toContain("Data;Descrição");
    expect(lines).toHaveLength(summary.totalCount + 1);
  });

  test("trocar filtro não devolve o resumo ao skeleton", async ({ page }) => {
    await page.goto("/transactions");

    const card = page.locator('[data-slot="transactions-summary"]');
    await expect(card.locator('[data-slot="skeleton"]')).toHaveCount(0, { timeout: 30_000 });
    const money = card.locator('[data-slot="money"]');
    const values = async () =>
      (await money.allInnerTexts()).map((value) => value.replace(/\s+/g, " ").trim());
    const before = await values();
    expect(before[0]).not.toBe("—");

    // Observa o card enquanto o novo filtro carrega: com `keepPreviousData`
    // nenhum skeleton é inserido (o snapshot anterior continua na tela). O
    // observer roda no browser e não perde a janela, que dura ~100 ms.
    await page.evaluate(() => {
      const target = document.querySelector('[data-slot="transactions-summary"]');
      const counter = { skeletons: 0 };
      (window as unknown as { __summarySkeletons: typeof counter }).__summarySkeletons = counter;
      if (!target) return;
      new MutationObserver(() => {
        if (target.querySelector('[data-slot="skeleton"]')) counter.skeletons += 1;
      }).observe(target, { childList: true, subtree: true });
    });

    await page.getByLabel("Buscar transações").fill(await descriptionInDefaultWindow(page.request));
    await expect(page).toHaveURL(/[?&]q=/);

    // O novo resumo chega e os valores deixam de ser os anteriores…
    await expect
      .poll(async () => (await values()).join("|"), { timeout: 30_000 })
      .not.toBe(before.join("|"));

    // …e em nenhum momento o card voltou ao skeleton.
    const skeletons = await page.evaluate(
      () => (window as unknown as { __summarySkeletons: { skeletons: number } }).__summarySkeletons,
    );
    expect(skeletons.skeletons).toBe(0);
    await expect(card.locator('[data-slot="skeleton"]')).toHaveCount(0);
  });

  test("resumo com erro mostra '—' e 'Tentar de novo', nunca R$ 0,00", async ({ page }) => {
    await page.route("**/api/transactions/summary*", (route) =>
      route.fulfill({
        status: 500,
        json: { error: { code: "internal_error", message: "falha simulada" } },
      }),
    );

    await page.goto("/transactions");

    const card = page.locator('[data-slot="transactions-summary"]');
    await expect(card).toContainText("Não foi possível calcular o resumo.", { timeout: 30_000 });
    // Número falso que parece certo é pior que nenhum número.
    await expect(card).not.toContainText("R$ 0,00");
    await expect(card.getByRole("button", { name: "Tentar de novo" })).toBeVisible();

    // Sem o agregado o rodapé não promete um total.
    await expect(page.locator('[data-slot="transactions-count"]')).toContainText("carregados");

    // Retry: com a rota sã, o card volta a mostrar valores.
    await page.unroute("**/api/transactions/summary*");
    await card.getByRole("button", { name: "Tentar de novo" }).click();
    await expect
      .poll(async () => (await card.locator('[data-slot="money"]').first().innerText()).trim(), {
        timeout: 30_000,
      })
      .not.toBe("—");
  });

  /**
   * O painel de detalhe vive na URL (`?tx=<id>`), junto dos filtros: dá para
   * compartilhar, recarregar e fechar com o "voltar" do navegador.
   */
  test("painel de transação na URL: abrir, fechar, anterior/próxima", async ({ page }) => {
    // Várias navegações de ida e volta numa página pesada: 60s com folga.
    test.setTimeout(60_000);

    await page.goto("/transactions");
    await expect(page.getByRole("heading", { level: 1, name: "Transações" })).toBeVisible();

    const rows = page.locator("tbody tr[data-tx]");
    const sheet = page.getByRole("dialog", { name: "Transação" });
    const openRow = (index = 0) =>
      rows.nth(index).getByRole("button", { name: /^Ver detalhes de/ });

    await expect(rows.first()).toBeVisible({ timeout: 30_000 });

    // Abrir grava o id na URL; o valor do painel repete o texto da tabela,
    // com o mesmo sinal ("+R$ ..."/"-R$ ...").
    const firstTxId = await rows.first().getAttribute("data-tx");
    expect(firstTxId, "linha sem data-tx").toBeTruthy();
    // O foco volta para a linha que abriu o painel — identificada pelo id, e
    // não por `.first()`: o dataset do demo muda com a data e a ordem entre
    // lançamentos do mesmo dia não é estável entre renders.
    const openedRow = page
      .locator(`tbody tr[data-tx="${firstTxId}"]`)
      .getByRole("button", { name: /^Ver detalhes de/ });
    const firstRowAmount = (await rows.first().locator('[data-slot="money"]').innerText()).trim();
    expect(firstRowAmount, "a tabela deixou de mostrar o sinal").toMatch(/^[+-]R\$/);

    await openedRow.click();
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`[?&]tx=${firstTxId}(&|$)`));
    await expect(sheet.locator('[data-slot="money"]')).toHaveText(firstRowAmount);

    // Fechar pelo botão limpa a URL e devolve o foco à linha que abriu.
    await sheet.getByRole("button", { name: "Fechar" }).first().click();
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]tx=/);
    await expect(openedRow).toBeFocused();

    // Nota digitada e fechada pelo "voltar": o flush da desmontagem salva.
    await openRow().click();
    await expect(sheet).toBeVisible();
    const notes = sheet.getByLabel("Anotação");
    // Deixa a animação de abertura commitar: um `fill` no meio do primeiro
    // render pode ser revertido pelo React antes de virar rascunho.
    await page.waitForTimeout(300);
    const currentNote = await notes.inputValue();
    const nextNote =
      currentNote === "Salva pelo voltar" ? "Salva pelo voltar 2" : "Salva pelo voltar";
    await notes.fill(nextNote);
    await expect(notes).toHaveValue(nextNote);
    await expect(notes).toBeFocused();

    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]tx=/);
    await expect(page.getByText("Anotação salva").first()).toBeVisible({ timeout: 20_000 });

    // Reabrindo pela URL, a nota gravada está lá.
    await page.goto(`/transactions?tx=${firstTxId}`);
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    await expect(sheet.getByLabel("Anotação")).toHaveValue(nextNote);
    await sheet.getByRole("button", { name: "Fechar" }).first().click();
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]tx=/);

    // "Voltar" do navegador fecha o painel sem perder os filtros.
    const term = await descriptionInDefaultWindow(page.request);
    await page.getByLabel("Buscar transações").fill(term);
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(rows.first()).toContainText(term, { timeout: 20_000 });

    await openRow().click();
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/[?&]tx=/);
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]tx=/);
    await expect(page).toHaveURL(/[?&]q=/);

    // Anterior/Próxima trocam o `tx` na URL sem fechar o painel. Recarrega a
    // página sem a busca para a lista completa garantir vizinhos.
    await page.goto("/transactions");
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });

    await openRow().click();
    await expect(sheet).toBeVisible();
    const openedTx = new URL(page.url()).searchParams.get("tx");
    expect(openedTx, "abrir o painel não gravou o tx na URL").toBeTruthy();

    await sheet.getByRole("button", { name: "Próxima" }).click();
    await expect(sheet).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(`[?&]tx=${openedTx}(&|$)`));
    const nextTx = new URL(page.url()).searchParams.get("tx");
    expect(nextTx, "Próxima não atualizou o tx na URL").toBeTruthy();

    // Depois de Anterior/Próxima, Fechar também limpa a URL sem sair da lista.
    await sheet.getByRole("button", { name: "Fechar" }).first().click();
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]tx=/);
    await expect(page).toHaveURL(/\/transactions$/);

    // Link compartilhado: abrir por URL e recarregar mantém o painel aberto.
    await page.goto(`/transactions?tx=${nextTx}`);
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(sheet).toBeVisible({ timeout: 30_000 });

    // Aberto por link (sem histórico próprio), Fechar limpa o tx.
    await sheet.getByRole("button", { name: "Fechar" }).first().click();
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]tx=/);

    // Id que não existe no recorte: não abre painel e a URL se limpa sozinha.
    await page.goto("/transactions?tx=00000000-0000-4000-8000-000000000000");
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]tx=/, { timeout: 20_000 });
  });

  test("contas, cartões, análises e sync de conexões", async ({ page }) => {
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
    await expect(page.getByText("Banco Aurora").first()).toBeVisible({ timeout: 30_000 });

    // O patrimônio da página Contas inclui as posições da tabela `investments`,
    // o mesmo total do gráfico e do KPI do overview.
    const accountsBody = (await (await page.request.get("/api/accounts")).json()) as {
      data: Array<{ type: string; balanceCents: number }>;
    };
    const investmentsBody = (await (await page.request.get("/api/investments")).json()) as {
      data: Array<{ balanceCents: number }>;
    };
    expect(investmentsBody.data.some((item) => item.balanceCents > 0)).toBeTruthy();
    const expectedNetWorthCents =
      accountsBody.data
        .filter((account) => account.type !== "credit_card")
        .reduce((total, account) => total + account.balanceCents, 0) +
      investmentsBody.data.reduce((total, item) => total + item.balanceCents, 0) -
      accountsBody.data
        .filter((account) => account.type === "credit_card")
        .reduce((total, account) => total + account.balanceCents, 0);
    const expectedNetWorth = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    })
      .format(expectedNetWorthCents / 100)
      .replace(/\s/g, " ");
    const netWorth = page.locator('[data-slot="accounts-summary"] [data-slot="money"]').first();
    await expect
      .poll(async () => (await netWorth.getAttribute("title"))?.replace(/\s/g, " "), {
        timeout: 15_000,
      })
      .toBe(expectedNetWorth);

    // Detalhe da conta.
    await page
      .getByRole("link", { name: /Conta Corrente/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Conta Corrente" })).toBeVisible();
    await expect(page.getByText("Transações da conta")).toBeVisible();

    // Detalhe do cartão: fatura paga mostra a data, sem tom de atraso.
    await page.goto("/accounts");
    await page
      .getByRole("link", { name: /Cartão Aurora/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: /Cartão Aurora/ })).toBeVisible();
    await expect(
      page.locator('[data-slot="bill-row"]').filter({ hasText: "Paga" }).first(),
    ).toContainText(/venceu em \d{2}\/\d{2}/, { timeout: 30_000 });

    await page.getByRole("link", { name: "Cartões", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Cartões" })).toBeVisible();
    await expect(page.getByText(/Cartão Aurora/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator('[data-slot="bill-row"]').filter({ hasText: "Paga" }).first(),
    ).toContainText(/venceu em \d{2}\/\d{2}/, { timeout: 30_000 });

    await page.getByRole("link", { name: "Análises", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Análises" })).toBeVisible();
    await expect(page.getByText("Fluxo de caixa").first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole("link", { name: "Conexões", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Conexões" })).toBeVisible();
    await expect(page.getByText("Banco Aurora").first()).toBeVisible({ timeout: 30_000 });

    await page
      .getByRole("button", { name: /^Sincronizar/ })
      .first()
      .click();
    await expect(page.getByText("Sincronização concluída")).toBeVisible({ timeout: 90_000 });
  });

  test("contas mantém a lista quando as posições de investimento falham", async ({ page }) => {
    await page.route("**/api/investments", (route) =>
      route.fulfill({
        status: 500,
        json: { error: { code: "internal_error", message: "falha simulada" } },
      }),
    );

    await page.goto("/accounts");
    await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
    // A lista continua disponível; só o resumo de patrimônio degrada.
    await expect(page.getByText("Banco Aurora").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Posições de investimento indisponíveis")).toBeVisible();
  });
});
