import { expect, test, type Locator, type Page } from "@playwright/test";

import { ensureDemoData } from "./demo-data";

/**
 * Tela de Transações abaixo de `md`: lista agrupada por dia com cabeçalho fixo,
 * barra de busca + chips fixa, sheet de filtros e deslizar para categorizar.
 * O desktop (tabela + barra de filtros) não muda.
 */

const MOBILE = { width: 390, height: 844 };

test.beforeAll(async ({ request }) => {
  await ensureDemoData(request);
});

async function waitForSkeletonsGone(page: Page) {
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

function rows(page: Page): Locator {
  return page.locator('[data-slot="transactions-cards"] li[data-swipe]');
}

async function openList(page: Page, query = "") {
  await page.goto(`/transactions${query}`);
  await expect(rows(page).first()).toBeVisible({ timeout: 60_000 });
  await waitForSkeletonsGone(page);
}

/** Quantos lançamentos o resumo diz que o filtro tem (rótulo do botão do sheet). */
async function filterResultCount(page: Page): Promise<number> {
  const label = (await page.locator('[data-slot="filters-apply"]').innerText()).trim();
  return Number(label.replace(/\D/g, ""));
}

test.describe("mobile (390px)", () => {
  test.use({ viewport: MOBILE, hasTouch: true, isMobile: true });

  test("lista agrupada por dia: cabeçalho por extenso, ícone, categoria e conta em cada linha", async ({
    page,
  }) => {
    await openList(page);

    const headers = page.locator('[data-slot="transactions-cards"] [data-slot="day-header"]');
    await expect(headers.first()).toBeVisible();
    // "Sábado, 14 de novembro" (com o ano quando não é o corrente).
    await expect(headers.first()).toHaveText(/^[A-ZÀ-Ú][\p{L}-]+, \d{1,2} de \p{L}+/u);

    // Cada dia é um cabeçalho (nível 3) de verdade, sem o total no nome; o fixo é decorativo.
    const dayHeading = page
      .locator('[data-slot="transactions-cards"]')
      .getByRole("heading", { level: 3 })
      .first();
    await expect(dayHeading).toHaveText(/^[A-ZÀ-Ú][\p{L}-]+, \d{1,2} de \p{L}+$/u);
    await expect(page.locator('[data-slot="sticky-day-header"] h3')).toHaveCount(0);
    await expect(page.locator('[data-slot="transactions-cards"] ul > li[role]')).toHaveCount(0);

    const first = rows(page).first();
    await expect(first.locator('[data-slot="transaction-description"]')).not.toBeEmpty();
    await expect(first.locator('[data-slot="transaction-category"]')).not.toBeEmpty();
    await expect(first.locator('[data-slot="money"]')).toHaveText(/^[+-]R\$/);

    // Toque abre o detalhe no bottom sheet.
    await first.getByRole("button", { name: /^Ver detalhes de/ }).tap();
    await expect(page.getByRole("dialog", { name: "Transação" })).toBeVisible();
  });

  test("barra de busca e o cabeçalho do dia ficam fixos ao rolar, sob a barra superior", async ({
    page,
  }) => {
    await openList(page);
    const topbar = page.locator('[data-slot="app-topbar"]');
    const toolbar = page.locator('[data-slot="tx-toolbar"]');
    const sticky = page.locator('[data-slot="sticky-day-header"]');

    await page.evaluate(() => window.scrollTo(0, 1500));

    // Medidas relativas à barra superior (a rolagem muda `scrollbar-gutter`/offsets).
    await expect
      .poll(async () => {
        const top = (await topbar.boundingBox())!;
        const bar = (await toolbar.boundingBox())!;
        const day = (await sticky.boundingBox())!;
        return {
          toolbar: Math.abs(bar.y - (top.y + top.height)) <= 1,
          day: Math.abs(day.y - (bar.y + bar.height)) <= 1,
        };
      })
      .toEqual({ toolbar: true, day: true });

    // Fundo sólido (sem vidro) e campo de 16px (o iOS não dá zoom).
    const style = await toolbar.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { filter: computed.backdropFilter, bg: computed.backgroundColor };
    });
    expect(style.filter === "none" || style.filter === "").toBe(true);
    expect(style.bg).not.toBe("rgba(0, 0, 0, 0)");
    const fontSize = await page
      .getByLabel("Buscar transações")
      .evaluate((element) => getComputedStyle(element).fontSize);
    expect(fontSize).toBe("16px");

    // O dia fixo é o do primeiro lançamento visível abaixo da barra.
    const stickyText = (await sticky.innerText()).split("\n")[0]!.trim();
    expect(stickyText).toMatch(/\d{1,2} de \p{L}+/u);
    await expect
      .poll(async () =>
        page.evaluate((label) => {
          const lineY = document
            .querySelector('[data-slot="sticky-day-header"]')!
            .getBoundingClientRect().bottom;
          const headers = [
            ...document.querySelectorAll(
              '[data-slot="transactions-cards"] [data-slot="day-header"]',
            ),
          ];
          // Último cabeçalho real que já passou da linha do fixo.
          const passed = headers.filter(
            (header) => header.getBoundingClientRect().top <= lineY - 36,
          );
          const current = passed.at(-1) ?? headers[0];
          return current?.textContent?.startsWith(label) ?? false;
        }, stickyText),
      )
      .toBe(true);
  });

  test("chips rápidos alteram a lista e a URL; só o ativo mostra a contagem", async ({ page }) => {
    await openList(page);
    const kinds: Record<string, string> = {
      Todas: "all",
      Saídas: "expense",
      Entradas: "income",
      "Sem categoria": "uncategorized",
      Pendentes: "pending",
    };
    // O nome acessível do chip ativo inclui a contagem ("Saídas 120"): localiza por tipo.
    const chip = (name: string) =>
      page.locator(`[data-slot="quick-chip"][data-kind="${kinds[name]}"]`);
    const quick = page.locator('[data-slot="quick-chip"]');

    await expect(quick).toHaveCount(5);
    await expect(chip("Todas")).toHaveAttribute("aria-pressed", "true");

    await chip("Saídas").tap();
    await expect(page).toHaveURL(/[?&]type=expense/);
    await expect(chip("Saídas")).toHaveAttribute("aria-pressed", "true");
    await expect(chip("Saídas").locator('[data-slot="chip-count"]')).toBeVisible();
    await expect(page.locator('[data-slot="chip-count"]')).toHaveCount(1);
    await expect
      .poll(async () => {
        const values = await rows(page).locator('[data-slot="money"]').allInnerTexts();
        return values.length > 0 && values.every((value) => value.startsWith("-"));
      })
      .toBe(true);

    await chip("Entradas").tap();
    await expect(page).toHaveURL(/[?&]type=income/);
    await expect(page).not.toHaveURL(/type=expense/);
    await expect
      .poll(async () => {
        const values = await rows(page).locator('[data-slot="money"]').allInnerTexts();
        return values.length > 0 && values.every((value) => value.startsWith("+"));
      })
      .toBe(true);

    await chip("Sem categoria").tap();
    await expect(page).toHaveURL(/[?&]uncategorized=true/);
    await expect(page).not.toHaveURL(/type=/);

    await chip("Pendentes").tap();
    await expect(page).toHaveURL(/[?&]pending=true/);
    await expect(page).not.toHaveURL(/uncategorized=/);

    await chip("Todas").tap();
    await expect(page).not.toHaveURL(/type=|uncategorized=|pending=/);
    await expect(chip("Todas")).toHaveAttribute("aria-pressed", "true");
  });

  test("os chips refletem a URL (links da Visão geral) e o resumo mostra entradas e saídas", async ({
    page,
  }) => {
    await openList(page, "?type=expense");

    await expect(page.locator('[data-kind="expense"]')).toHaveAttribute("aria-pressed", "true");
    const summary = page.locator('[data-slot="transactions-mobile-summary"]');
    await expect(summary).toContainText("Entradas");
    await expect(summary).toContainText("Saídas");
    // O resumo cobre o filtro inteiro (agregado da API), não só as linhas carregadas.
    await expect(summary.locator('[data-slot="summary-expenses"] [data-slot="money"]')).toHaveText(
      /^-R\$/,
    );
  });

  test("combinação vinda da URL não marca chip rápido e vira chips removíveis", async ({
    page,
  }) => {
    await page.goto("/transactions?type=expense&uncategorized=true");
    await expect(page.locator('[data-slot="tx-toolbar"]')).toBeVisible({ timeout: 60_000 });

    await expect(page.locator('[data-slot="quick-chip"][aria-pressed="true"]')).toHaveCount(0);
    const chips = page.locator('[data-slot="filter-chip"]');
    await expect(chips).toHaveCount(2);

    await page.getByRole("button", { name: "Remover filtro Saídas" }).tap();
    await expect(page).not.toHaveURL(/type=/);
    // Sobrou um único filtro: volta a ser o chip rápido "Sem categoria".
    await expect(page.locator('[data-kind="uncategorized"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(chips).toHaveCount(0);
  });

  test("busca filtra pela URL e o estado vazio oferece Limpar filtros", async ({ page }) => {
    await openList(page);
    const search = page.getByLabel("Buscar transações");
    const total = await rows(page).count();

    await search.fill("zzzz-nao-existe-9f3");
    await expect(page).toHaveURL(/[?&]q=zzzz/);
    const empty = page.locator('[data-slot="empty-state"]');
    await expect(empty).toContainText("Nenhuma transação com esses filtros");

    await empty.getByRole("button", { name: "Limpar filtros" }).tap();
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(search).toHaveValue("");
    await expect(rows(page).first()).toBeVisible();
    expect(await rows(page).count()).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(0);
  });

  test("sheet de filtros aplica na hora, mostra N lançamentos e vira chip removível", async ({
    page,
  }) => {
    await openList(page);
    const trigger = page.locator('[data-slot="filters-trigger"]');
    await expect(trigger).toBeVisible();
    await expect(page.locator('[data-slot="filters-active-dot"]')).toHaveCount(0);
    const box = (await trigger.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    // Ao alcance do polegar: metade de baixo da tela, acima da barra de abas.
    expect(box.y).toBeGreaterThan(MOBILE.height / 2);

    await trigger.tap();
    const sheet = page.getByRole("dialog", { name: "Filtros" });
    await expect(sheet).toBeVisible();

    const categoryGroup = sheet.getByRole("group", { name: "Categoria" });
    // Índice fixo: 0 é "Todas"; a ordem não muda quando o botão passa a pressionado.
    const category = categoryGroup.getByRole("button").nth(2);
    const categoryName = (await category.innerText()).trim();
    await category.tap();

    // A URL e a lista mudam com o sheet ainda aberto.
    await expect(page).toHaveURL(/[?&]categoryId=/);
    await expect(category).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => (await filterResultCount(page)) > 0, { timeout: 15_000 })
      .toBe(true);
    const shown = await filterResultCount(page);

    const accountGroup = sheet.getByRole("group", { name: "Conta" });
    const account = accountGroup.getByRole("button").nth(1);
    await account.tap();
    await expect(page).toHaveURL(/[?&]accountId=/);
    await expect(account).toHaveAttribute("aria-pressed", "true");

    await sheet.locator('[data-slot="filters-apply"]').tap();
    await expect(sheet).toBeHidden();
    await expect(page.locator('[data-slot="filters-active-dot"]')).toHaveCount(1);
    expect(shown).toBeGreaterThan(0);

    // Chips removíveis de conta e categoria, na barra fixa.
    const chips = page.locator('[data-slot="filter-chip"]');
    await expect(chips).toHaveCount(2);
    await expect(chips.first()).toContainText(/\S/);
    await page.getByRole("button", { name: `Remover filtro ${categoryName}` }).tap();
    await expect(page).not.toHaveURL(/[?&]categoryId=/);
    await expect(chips).toHaveCount(1);

    // Limpar zera o que o sheet controla.
    await trigger.tap();
    await sheet.getByRole("button", { name: "Limpar" }).tap();
    await expect(page).not.toHaveURL(/accountId=|categoryId=/);
    await expect(chips).toHaveCount(0);
  });

  test("o voltar do sistema fecha o sheet de filtros e mantém os filtros escolhidos", async ({
    page,
  }) => {
    await openList(page);
    const startUrl = page.url();
    await page.locator('[data-slot="filters-trigger"]').tap();
    const sheet = page.getByRole("dialog", { name: "Filtros" });
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/[?&]filters=true/);

    // Mudar filtro dentro do sheet não cria entradas de histórico (replace).
    await sheet.getByRole("button", { name: "Valor (maior)" }).tap();
    await expect(page).toHaveURL(/[?&]sort=amount_desc/);

    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page).not.toHaveURL(/filters=/);
    // Os filtros escolhidos continuam aplicados (e o voltar não saiu da tela).
    await expect(page).toHaveURL(/[?&]sort=amount_desc/);
    await expect(page.locator('[data-slot="day-header"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="filters-active-dot"]')).toHaveCount(1);
    expect(page.url()).not.toBe(startUrl);
  });

  /**
   * Lista no filtro A (`sort=amount_asc`), sheet aberto, troca para B (`amount_desc`) e fecha.
   * A entrada de antes de abrir ainda tem A: a tela não pode renderizar a lista de A em nenhum
   * quadro nem pedir a lista de A depois de fechar. O amostrador (`MutationObserver`) registra
   * a primeira linha a cada commit no DOM, pintado ou não; o filtro A tem outra primeira linha que o B.
   */
  async function closeSheetAfterSwitching(page: Page, close: () => Promise<void>) {
    await openList(page, "?sort=amount_asc");
    const firstA = (await rows(page).first().innerText()).trim();

    await page.locator('[data-slot="filters-trigger"]').tap();
    const sheet = page.getByRole("dialog", { name: "Filtros" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Valor (maior)" }).tap();
    await expect(page).toHaveURL(/[?&]sort=amount_desc/);
    await expect
      .poll(async () => (await rows(page).first().innerText()).trim(), { timeout: 15_000 })
      .not.toBe(firstA);
    const firstB = (await rows(page).first().innerText()).trim();

    const listRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/transactions") && !url.includes("/summary")) {
        listRequests.push(url);
      }
    });
    await page.evaluate(() => {
      const frames: string[] = [];
      (window as unknown as { __frames: string[] }).__frames = frames;
      const sample = () => {
        const row = document.querySelector('[data-slot="transactions-cards"] li[data-swipe]');
        frames.push(row ? (row.textContent ?? "").trim() : "");
      };
      // Cada commit do React no DOM é uma amostra, pintado ou não.
      new MutationObserver(sample).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      sample();
    });

    await close();
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/filters=/);
    await expect(page).toHaveURL(/[?&]sort=amount_desc/);
    await page.waitForTimeout(600);

    const frames = await page.evaluate(
      () => (window as unknown as { __frames: string[] }).__frames,
    );
    expect(frames.length).toBeGreaterThan(0);
    // O textContent do DOM e o innerText diferem nas quebras de linha: compara sem espaços.
    const normalize = (text: string) => text.replace(/\s+/g, "");
    const a = normalize(firstA);
    const b = normalize(firstB);
    expect(frames.map(normalize).filter((frame) => frame === a)).toEqual([]);
    expect(frames.map(normalize)).toContain(b);
    expect(listRequests.filter((url) => url.includes("sort=amount_asc"))).toEqual([]);
  }

  test("o voltar do sistema fecha o sheet sem piscar o filtro de antes de abrir", async ({
    page,
  }) => {
    await closeSheetAfterSwitching(page, async () => {
      await page.goBack();
    });
  });

  test("'Ver N lançamentos' fecha o sheet sem piscar o filtro de antes de abrir", async ({
    page,
  }) => {
    await closeSheetAfterSwitching(page, () => page.locator('[data-slot="filters-apply"]').tap());
  });

  test("avançar depois de fechar pelo voltar reabre o sheet com os filtros escolhidos", async ({
    page,
  }) => {
    await openList(page, "?sort=amount_asc");
    await page.locator('[data-slot="filters-trigger"]').tap();
    const sheet = page.getByRole("dialog", { name: "Filtros" });
    await sheet.getByRole("button", { name: "Valor (maior)" }).tap();
    await expect(page).toHaveURL(/[?&]sort=amount_desc/);

    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/[?&]sort=amount_desc/);

    await page.goForward();
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/[?&]sort=amount_desc/);
    await expect(sheet.getByRole("button", { name: "Valor (maior)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page).toHaveURL(/[?&]sort=amount_desc/);
  });

  test("fechar o sheet pelo botão, Esc ou scrim volta uma entrada, sem sair da tela", async ({
    page,
  }) => {
    await openList(page);
    const trigger = page.locator('[data-slot="filters-trigger"]');
    const sheet = page.getByRole("dialog", { name: "Filtros" });

    await trigger.tap();
    await expect(sheet).toBeVisible();
    await sheet.locator('[data-slot="filters-apply"]').tap();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page).not.toHaveURL(/filters=/);

    await trigger.tap();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/filters=/);

    // Uma única entrada empilhada por abertura: o voltar seguinte sai da tela.
    await expect(rows(page).first()).toBeVisible();
    expect(await page.evaluate(() => window.history.length)).toBeLessThanOrEqual(4);
  });

  test("aberto por link direto com ?filters, fechar não sai da tela", async ({ page }) => {
    await openList(page, "?filters=true&sort=amount_asc");
    const sheet = page.getByRole("dialog", { name: "Filtros" });
    await expect(sheet).toBeVisible();

    await sheet.locator('[data-slot="filters-apply"]').tap();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page).not.toHaveURL(/filters=/);
    await expect(page).toHaveURL(/[?&]sort=amount_asc/);
    await expect(rows(page).first()).toBeVisible();

    // Recarregar com o sheet aberto reabre o sheet; Esc também só tira o param.
    await page.goto("/transactions?filters=true");
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(rows(page).first()).toBeVisible();
  });

  test("ordenar por valor pelo sheet tira os cabeçalhos de dia", async ({ page }) => {
    await openList(page);
    await page.locator('[data-slot="filters-trigger"]').tap();
    const sheet = page.getByRole("dialog", { name: "Filtros" });
    await sheet.getByRole("button", { name: "Valor (maior)" }).tap();
    await expect(page).toHaveURL(/[?&]sort=amount_desc/);
    await sheet.locator('[data-slot="filters-apply"]').tap();

    await expect(page.locator('[data-slot="day-header"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="sticky-day-header"]')).toHaveCount(0);
    await expect(rows(page).first()).toBeVisible();
  });

  test("deslizar para a esquerda passando do limiar abre a grade de categorias", async ({
    page,
  }) => {
    await openList(page);
    const row = rows(page).nth(1);
    await expect(row).toBeVisible();
    const box = (await row.boundingBox())!;
    const y = box.y + box.height / 2;
    const startX = box.x + box.width - 40;

    // Curto demais: volta e não abre nada.
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX - 40, y, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Movimento vertical não é gesto da linha (a rolagem é da página).
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX - 6, y + 60, { steps: 6 });
    const transform = await row
      .locator("[data-swipe-fg]")
      .evaluate((element) => (element as HTMLElement).style.transform);
    await page.mouse.up();
    expect(transform).toBe("");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Começando na borda da tela o gesto é do sistema (voltar): ignora.
    await page.mouse.move(8, y);
    await page.mouse.down();
    await page.mouse.move(-40, y, { steps: 5 }).catch(() => {});
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Passando do limiar e soltando: abre direto a grade (a mesma do detalhe).
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX - 60, y, { steps: 4 });
    await page.mouse.move(startX - 120, y, { steps: 4 });
    await expect(row).toHaveAttribute("data-armed", "true");
    await page.mouse.up();

    const sheet = page.getByRole("dialog", { name: "Categoria" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("group", { name: "Categorias" })).toBeVisible();
    await expect(page).toHaveURL(/[?&]tx=/);
    // O gesto não deixou a linha deslocada nem abriu o detalhe por baixo.
    await expect(row.locator("[data-swipe-fg]")).toHaveCSS("transform", "none");

    // Voltar leva ao detalhe da mesma transação (mesmo sheet).
    await sheet.getByRole("button", { name: "Voltar para a transação" }).tap();
    await expect(page.getByRole("dialog", { name: "Transação" })).toBeVisible();
  });

  test("alternativa sem gesto: seta ← na linha abre a grade e o toque abre o detalhe", async ({
    page,
  }) => {
    await openList(page);
    const button = rows(page)
      .first()
      .getByRole("button", { name: /^Ver detalhes de/ });
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press("ArrowLeft");

    await expect(page.getByRole("dialog", { name: "Categoria" })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("group", { name: "Categorias" })).toBeVisible();
  });

  test("alvos de toque: linhas, busca e botões do sheet com ao menos 44px", async ({ page }) => {
    await openList(page);

    for (const locator of [
      rows(page)
        .first()
        .getByRole("button", { name: /^Ver detalhes de/ }),
      page.getByLabel("Buscar transações"),
      page.locator('[data-slot="filters-trigger"]'),
    ]) {
      expect((await locator.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    }

    await page.locator('[data-slot="filters-trigger"]').tap();
    const sheet = page.getByRole("dialog", { name: "Filtros" });
    for (const locator of [
      sheet.getByRole("button", { name: "Limpar" }),
      sheet.locator('[data-slot="filters-apply"]'),
      sheet.getByRole("group", { name: "Categoria" }).getByRole("button").first(),
      sheet.getByRole("group", { name: "Conta" }).getByRole("button").first(),
    ]) {
      expect((await locator.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    }
  });

  test("chips rápidos: a área clicável chega a 44px (toque 4px fora da borda visual)", async ({
    page,
  }) => {
    await openList(page);
    const chip = (kind: string) => page.locator(`[data-slot="quick-chip"][data-kind="${kind}"]`);

    // O alvo cresce por pseudo-elemento: a caixa visual tem ~34px, e o toque
    // 4px acima/abaixo dela ainda precisa acertar o chip (e não ser engolido
    // pelo `overflow` da linha rolável ou pela barra de busca).
    for (const [kind, edge] of [
      ["expense", "above"],
      ["income", "below"],
    ] as const) {
      const box = (await chip(kind).boundingBox())!;
      expect(box.height).toBeLessThan(40);
      const y = edge === "above" ? box.y - 4 : box.y + box.height + 4;
      await page.mouse.click(box.x + box.width / 2, y);
      await expect(chip(kind)).toHaveAttribute("aria-pressed", "true");
      await chip("all").tap();
      await expect(chip("all")).toHaveAttribute("aria-pressed", "true");
    }

    // Fora do alvo de 44px (6px além da borda) não aciona o chip.
    const outside = (await chip("expense").boundingBox())!;
    await page.mouse.click(outside.x + outside.width / 2, outside.y - 6.5);
    await expect(chip("expense")).toHaveAttribute("aria-pressed", "false");
  });

  test("a lista rola a página inteira e carrega o fim com 'Fim da lista'", async ({ page }) => {
    await openList(page);
    await expect(page.locator('[data-slot="transactions-count"]')).toBeVisible();
    await expect(page.locator('[data-slot="transactions-loading"]')).toBeHidden({
      timeout: 60_000,
    });

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.getByText("Fim da lista")).toBeVisible({ timeout: 30_000 });
  });
});

for (const width of [360, 390, 430]) {
  test.describe(`sem rolagem horizontal em ${width}px`, () => {
    test.use({ viewport: { width, height: 780 }, hasTouch: true, isMobile: true });

    test("lista, chips e sheet de filtros cabem na largura", async ({ page }) => {
      await openList(page);

      const overflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
      expect(await overflow()).toBeLessThanOrEqual(0);

      await page.locator('[data-slot="filters-trigger"]').tap();
      const sheet = page.getByRole("dialog", { name: "Filtros" });
      await expect(sheet).toBeVisible();
      expect(await overflow()).toBeLessThanOrEqual(0);
      const sheetOverflow = await sheet
        .locator('[data-slot="bottom-sheet-body"]')
        .evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(sheetOverflow).toBeLessThanOrEqual(0);
    });
  });
}

test.describe("desktop inalterado", () => {
  test("1440px mantém a tabela, a barra de filtros e o resumo lateral", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/transactions");
    await expect(page.locator("tbody tr[data-tx]").first()).toBeVisible({ timeout: 60_000 });

    await expect(page.locator('[data-slot="transaction-filters"]')).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Filtrar por conta" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Resumo das transações" })).toBeVisible();
    await expect(page.locator('[data-slot="tx-toolbar"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="filters-trigger"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="transactions-cards"]')).toHaveCount(0);
  });

  test("768px (tablet) continua com a tabela", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/transactions");
    await expect(page.locator("tbody tr[data-tx]").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-slot="tx-toolbar"]')).toHaveCount(0);
  });
});
