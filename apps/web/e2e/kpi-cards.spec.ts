import { expect, test, type Page } from "@playwright/test";

import { ensureDemoData } from "./demo-data";

/**
 * Layout dos cards de KPI: a legenda (delta ou hint) quebra em até duas linhas
 * sem ser cortada, o selo de variação ocupa sempre a mesma linha do card
 * abaixo do valor — percentual ou diferença em reais — e a sparkline encosta
 * na base. Os KPIs do overview vêm de um stub com valores fixos, para o teste
 * não depender da janela do dataset demo nem do período padrão.
 */
test.setTimeout(120_000);
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await ensureDemoData(request);
});

/** Período do stub; o conteúdo não importa para o layout. */
const PERIOD = { from: "2026-10-01", to: "2026-10-31" };
const PREVIOUS_PERIOD = { from: "2026-08-31", to: "2026-09-30" };

/**
 * Um delta percentual (receitas/despesas) e um em reais (resultado: a base
 * anterior é negativa, então o #48 mostra "+R$ 22.462,11", mais largo).
 */
const OVERVIEW = {
  period: PERIOD,
  previousPeriod: PREVIOUS_PERIOD,
  currency: "BRL",
  kpis: {
    balance: {
      currentCents: 4_960_208,
      previousCents: 4_590_000,
      deltaCents: 370_208,
      deltaPercent: 8.1,
    },
    income: {
      currentCents: 1_472_582,
      previousCents: 1_312_000,
      deltaCents: 160_582,
      deltaPercent: 12.2,
    },
    expenses: {
      currentCents: 1_289_219,
      previousCents: 1_138_000,
      deltaCents: 151_219,
      deltaPercent: 13.3,
    },
    result: {
      currentCents: 183_363,
      previousCents: -2_062_848,
      deltaCents: 2_246_211,
      deltaPercent: 108.9,
    },
    netWorth: {
      currentCents: 5_100_000,
      previousCents: 5_000_000,
      deltaCents: 100_000,
      deltaPercent: 2,
    },
  },
} as const;

const PAGES = [
  { path: "/", heading: "Visão geral", region: "Indicadores principais" },
  { path: "/analytics", heading: "Análises", region: "Resumo do período" },
] as const;

async function stubOverview(page: Page): Promise<void> {
  await page.route(/\/api\/overview(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(OVERVIEW) }),
  );
}

async function waitForData(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('[data-slot="skeleton"]')].some((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }),
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(250);
}

/**
 * Medidas que provam o layout do card, executadas no navegador. Cards na mesma
 * linha (topo igual) precisam alinhar entre si; empilhados (mobile), cada um
 * segue a própria altura.
 */
function inspectKpiCards(region: string) {
  const section = document.querySelector<HTMLElement>(`section[aria-label="${region}"]`);
  if (!section) {
    return [`seção "${region}" não encontrada`];
  }

  const found: string[] = [];
  const cards = [...section.querySelectorAll<HTMLElement>('[data-slot="kpi-card"]')];
  if (cards.length === 0) {
    return [`seção "${region}" sem cards de KPI`];
  }

  const rows = new Map<
    number,
    { deltaOffsets: number[]; captionOffsets: number[]; sparklineBottoms: number[] }
  >();
  const rowOf = (top: number) => {
    const key = Math.round(top);
    let row = rows.get(key);
    if (!row) {
      row = { deltaOffsets: [], captionOffsets: [], sparklineBottoms: [] };
      rows.set(key, row);
    }
    return row;
  };

  for (const card of cards) {
    const cardRect = card.getBoundingClientRect();
    const name =
      card.querySelector<HTMLElement>('[data-slot="money"]')?.getAttribute("title") ?? "KPI";
    const row = rowOf(cardRect.top);

    const caption = card.querySelector<HTMLElement>('[data-slot="kpi-caption"]');
    if (caption) {
      // `line-clamp-2` corta na vertical: se o texto precisa de mais de duas
      // linhas, `scrollHeight` passa de `clientHeight` (reticências).
      if (caption.scrollHeight > caption.clientHeight + 1) {
        found.push(
          `"${name}": legenda cortada (${caption.scrollHeight}px de ${caption.clientHeight}px)`,
        );
      }
      // Palavra sem quebra estouraria na horizontal.
      if (caption.scrollWidth > caption.clientWidth + 1) {
        found.push(`"${name}": legenda mais larga que o card`);
      }
      row.captionOffsets.push(Math.round(caption.getBoundingClientRect().top - cardRect.top));
    }

    const deltaSlot = card.querySelector<HTMLElement>('[data-slot="kpi-delta"]');
    // O selo em si existe nos dois formatos de card; a linha reservada só no
    // layout novo. Medir pelo selo (quando não há slot) mantém o teste capaz de
    // reprovar o card antigo, sem depender do markup novo.
    const delta = deltaSlot ?? card.querySelector<HTMLElement>('[data-slot="delta-badge"]');
    const value = card.querySelector<HTMLElement>('[data-slot="kpi-value"], [data-slot="money"]');
    if (delta) {
      if (value && delta.getBoundingClientRect().top < value.getBoundingClientRect().bottom - 1) {
        found.push(`"${name}": selo de variação ao lado do valor em vez da linha de baixo`);
      }
      row.deltaOffsets.push(Math.round(delta.getBoundingClientRect().top - cardRect.top));
    }
    if (!deltaSlot && caption) {
      found.push(`"${name}": card com legenda não reserva a linha do selo`);
    }

    const sparkline = card.querySelector<SVGElement>('svg[aria-label="Tendência do período"]');
    if (sparkline) {
      row.sparklineBottoms.push(Math.round(sparkline.getBoundingClientRect().bottom));
    }
  }

  const spread = (values: number[]): number =>
    values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;

  for (const row of rows.values()) {
    if (spread(row.deltaOffsets) > 1) {
      found.push(`selo de variação em alturas diferentes: ${row.deltaOffsets.join(", ")}px`);
    }
    if (spread(row.captionOffsets) > 1) {
      found.push(`legenda em alturas diferentes: ${row.captionOffsets.join(", ")}px`);
    }
    if (spread(row.sparklineBottoms) > 1) {
      found.push(`sparkline fora da base: ${row.sparklineBottoms.join(", ")}px`);
    }
  }

  return found;
}

for (const width of [1440, 1280, 430]) {
  test(`cards de KPI alinhados em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await stubOverview(page);

    for (const entry of PAGES) {
      await page.goto(entry.path);
      await expect(page.getByRole("heading", { level: 1, name: entry.heading })).toBeVisible({
        timeout: 20_000,
      });
      await waitForData(page);

      // O cenário cobre os dois formatos do selo: percentual e reais. A busca é
      // restrita à seção dos KPIs — outras telas (ex.: comparativo mensal em
      // Análises) também renderizam DeltaBadge com dados reais.
      // Abaixo de `lg` a Visão geral usa a grade 2×2 própria (`MobileKpiGrid`):
      // outra estrutura, coberta por `mobile-overview.spec.ts`; aqui só vale o
      // selo em reais e a ausência de valor truncado.
      const mobileOverview = width < 1024 && entry.path === "/";
      const kpiSection = page.getByRole("region", {
        name: mobileOverview ? "Resumo do período" : entry.region,
      });
      await expect(
        kpiSection.locator('[data-slot="delta-badge"]').filter({ hasText: "R$" }).first(),
        `${entry.heading} em ${width}px sem selo em reais`,
      ).toBeVisible();

      if (mobileOverview) {
        const truncated = await kpiSection
          .locator('[data-slot="money"]')
          .evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth + 1));
        expect(truncated, `${entry.heading} em ${width}px: valor truncado`).toHaveLength(0);
        continue;
      }

      const problems = await page.evaluate(inspectKpiCards, entry.region);
      expect(problems, `${entry.heading} em ${width}px`).toEqual([]);
    }
  });
}
