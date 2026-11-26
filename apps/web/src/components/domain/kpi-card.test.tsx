import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { KpiCard } from "./kpi-card";

describe("KpiCard", () => {
  it("interpreta percentuais da API como pontos quando pedido", () => {
    const html = renderToStaticMarkup(
      <KpiCard label="Variação" format="percent" percentScale="points" value={2.9} />,
    );

    expect(html).toContain("2,9%");
    expect(html).not.toContain("290%");
  });

  it("mantém a razão como padrão para valores calculados no web", () => {
    const html = renderToStaticMarkup(
      <KpiCard label="Taxa de poupança" format="percent" value={0.29} />,
    );

    expect(html).toContain("29%");
  });

  it("formata deltaPercent da API em pontos", () => {
    const html = renderToStaticMarkup(
      <KpiCard label="Receitas" valueCents={1_234_567} delta={12.2} />,
    );

    expect(html).toContain("12,2%");
    expect(html).not.toContain("1.220%");
  });

  it("não mostra selo quando 0 → 0 e volta a exibir o hint", () => {
    const html = renderToStaticMarkup(
      <KpiCard
        label="Resultado"
        valueCents={0}
        deltaAmounts={{ currentCents: 0, previousCents: 0 }}
        hint="vs. período anterior"
      />,
    );

    expect(html).not.toContain('data-slot="delta-badge"');
    expect(html).toContain("vs. período anterior");
  });

  it("mantém o selo quando o delta vem sem legenda", () => {
    const html = renderToStaticMarkup(
      <KpiCard label="Receitas" valueCents={1_000} delta={12.2} deltaLabel="" />,
    );

    expect(html).toContain('data-slot="delta-badge"');
    expect(html).toContain("12,2%");
  });

  it("mostra a diferença em reais quando a base do KPI não é comparável", () => {
    const html = renderToStaticMarkup(
      <KpiCard
        label="Resultado"
        valueCents={-239_848}
        deltaAmounts={{ currentCents: -239_848, previousCents: -15_227 }}
      />,
    );

    expect(html.replace(/\u00a0/g, " ")).toContain("-R$ 2.246,21");
  });

  it("reserva a altura do sparkline só quando recebe uma série", () => {
    const withSeries = renderToStaticMarkup(
      <KpiCard label="Saldo em contas" valueCents={1_000} series={[1, 2, 3]} />,
    );
    const withoutSeries = renderToStaticMarkup(
      <KpiCard label="Limite disponível" valueCents={1_000} />,
    );

    expect(withSeries).toContain("min-h-[148px]");
    expect(withoutSeries).not.toContain("min-h-[148px]");
  });
});
