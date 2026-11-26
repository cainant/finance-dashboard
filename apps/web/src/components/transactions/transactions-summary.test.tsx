import type { Category } from "@fd/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TransactionsCategories, TransactionsSummary } from "./transactions-summary";

describe("TransactionsSummary", () => {
  it("mostra receitas, despesas e resultado do filtro inteiro em BRL", () => {
    const html = renderToStaticMarkup(
      <TransactionsSummary incomeCents={100_000} expensesCents={40_000} resultCents={60_000} />,
    );

    expect(html).toContain("Resumo do filtro");
    expect(html).toContain("Receitas");
    expect(html).toContain("Despesas");
    expect(html).toContain("Resultado");
    expect(html).toContain("1.000,00");
    // Despesa é recebida positiva do resumo da API e exibida negativa.
    expect(html).toContain("-R$");
    expect(html).toContain("400,00");
    expect(html).toContain("600,00");
    // Os rótulos não repetem "Entradas"/"Saídas": esses textos são do
    // ToggleGroup de tipo (e os testes e2e os localizam por texto único).
    expect(html).not.toContain("Entradas");
    expect(html).not.toContain("Saídas");
    // Paridade com os KPIs: pendentes e transferências ficam de fora.
    expect(html).toContain("efetivadas, sem transferências");
  });

  it("nunca avisa recorte parcial: os totais cobrem todo o filtro", () => {
    const html = renderToStaticMarkup(
      <TransactionsSummary incomeCents={1_367_243} expensesCents={0} resultCents={1_367_243} />,
    );

    expect(html).not.toContain("carregado");
    expect(html).not.toContain("carregados");
  });

  it("mostra despesa zero como R$ 0,00, nunca -R$ 0,00", () => {
    const html = renderToStaticMarkup(
      <TransactionsSummary incomeCents={0} expensesCents={0} resultCents={0} />,
    );

    expect(html).toContain("0,00");
    expect(html).not.toContain("-R$");
  });

  it("marca o card como atualizando sem esconder o snapshot anterior", () => {
    const html = renderToStaticMarkup(
      <TransactionsSummary
        incomeCents={100_000}
        expensesCents={40_000}
        resultCents={60_000}
        isUpdating
      />,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-updating="true"');
    // O snapshot anterior continua legível: nada de skeleton nem "—".
    expect(html).not.toContain('data-slot="skeleton"');
    expect(html).toContain("1.000,00");
    expect(html).toContain("400,00");
  });

  it("usa '—' em vez de zero quando o resumo ainda não chegou ou falhou", () => {
    const loadingHtml = renderToStaticMarkup(<TransactionsSummary isLoading />);
    const failedHtml = renderToStaticMarkup(<TransactionsSummary isError onRetry={() => {}} />);

    expect(loadingHtml).toContain('data-slot="skeleton"');
    expect(failedHtml).not.toContain("0,00");
    expect(failedHtml).toContain("—");
    expect(failedHtml).toContain("Não foi possível calcular o resumo.");
    expect(failedHtml).toContain("Tentar de novo");
  });

  it("mostra skeletons no lugar dos valores enquanto carrega", () => {
    const html = renderToStaticMarkup(<TransactionsSummary isLoading />);

    expect(html).toContain('data-slot="skeleton"');
    expect(html).not.toContain("Receitas");
  });
});

function category(id: string, name: string): Category {
  return {
    id,
    userId: null,
    name,
    slug: id,
    icon: "Tag",
    color: "#a1a1aa",
    kind: "expense",
    parentId: null,
  };
}

const CATEGORIES = [category("mercado", "Mercado"), category("viagem", "Viagem")];

function renderCategories(options: {
  categoryCounts?: ReadonlyMap<string, number>;
  uncategorizedCount?: number;
  activeCategoryId?: string;
  uncategorized?: boolean;
  isError?: boolean;
}): string {
  return renderToStaticMarkup(
    <TransactionsCategories
      categoryCounts={options.categoryCounts}
      uncategorizedCount={options.uncategorizedCount ?? 0}
      categories={CATEGORIES}
      activeCategoryId={options.activeCategoryId}
      uncategorized={options.uncategorized}
      isError={options.isError}
      onSelectCategory={() => {}}
      onSelectUncategorized={() => {}}
    />,
  );
}

describe("TransactionsCategories", () => {
  it("mostra a contagem de todo o filtro, da categoria mais usada para a menos", () => {
    const html = renderCategories({
      categoryCounts: new Map([
        ["viagem", 3],
        ["mercado", 42],
      ]),
    });

    expect(html).toContain("Mercado");
    expect(html).toContain("42");
    expect(html).toContain("Viagem");
    expect(html).toContain("3");
    expect(html.indexOf("Mercado")).toBeLessThan(html.indexOf("Viagem"));
    expect(html).not.toContain("Sem categoria");
  });

  it("não lista categorias sem lançamentos no recorte agregado", () => {
    const html = renderCategories({ categoryCounts: new Map([["mercado", 1]]) });

    expect(html).toContain("Mercado");
    expect(html).not.toContain("Viagem");
  });

  it("mostra 'Sem categoria' quando o agregado tem lançamentos sem categoria", () => {
    const html = renderCategories({
      categoryCounts: new Map([["mercado", 2]]),
      uncategorizedCount: 7,
    });

    expect(html).toContain("Sem categoria");
    expect(html).toContain("7");
  });

  it("mantém a categoria e 'Sem categoria' visíveis quando o filtro está ativo", () => {
    const filteredByCategory = renderCategories({
      categoryCounts: new Map([["mercado", 5]]),
      activeCategoryId: "viagem",
    });
    const filteredUncategorized = renderCategories({
      categoryCounts: new Map([["mercado", 5]]),
      uncategorized: true,
    });

    expect(filteredByCategory).toContain("Viagem");
    expect(filteredUncategorized).toContain("Sem categoria");
  });

  it("não inventa contagens quando o agregado falhou", () => {
    const html = renderCategories({ isError: true });

    expect(html).toContain("Não foi possível calcular o resumo.");
    expect(html).not.toContain("Mercado");
  });
});
