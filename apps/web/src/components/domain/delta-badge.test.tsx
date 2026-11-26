import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PrivacyContext } from "@/components/privacy/privacy-context";

import { DeltaBadge } from "./delta-badge";

/**
 * Regressão: `deltaPercent` da API vem em pontos percentuais. O badge já
 * mostrou "290%" para 2,9 porque tratava o número como razão.
 */
describe("DeltaBadge", () => {
  it("formata pontos percentuais da API sem multiplicar por 100", () => {
    const html = renderToStaticMarkup(<DeltaBadge value={2.9} />);

    expect(html).toContain("2,9%");
    expect(html).not.toContain("290%");
  });

  it("mantém o sinal e a cor de piora em despesas", () => {
    const html = renderToStaticMarkup(<DeltaBadge value={-12.2} invert label="vs. anterior" />);

    expect(html).toContain("12,2%");
    expect(html).toContain("vs. anterior");
    expect(html).not.toContain("1.220%");
  });

  it("mostra travessão quando não há base de comparação", () => {
    const html = renderToStaticMarkup(<DeltaBadge value={null} />);

    expect(html).toContain("—");
  });

  it("usa a diferença em reais quando a base anterior é zero", () => {
    const html = renderToStaticMarkup(
      <DeltaBadge amounts={{ currentCents: 750_000, previousCents: 0 }} />,
    );

    expect(html.replace(/\u00a0/g, " ")).toContain("+R$ 7.500,00");
    expect(html).not.toContain("%");
  });

  it("usa a diferença em reais quando os sinais são opostos", () => {
    const html = renderToStaticMarkup(
      <DeltaBadge amounts={{ currentCents: 281_200, previousCents: -200_000 }} />,
    );

    expect(html.replace(/\u00a0/g, " ")).toContain("+R$ 4.812,00");
    expect(html).not.toContain("%");
  });

  it("mantém o percentual quando a base é comparável", () => {
    const html = renderToStaticMarkup(
      <DeltaBadge amounts={{ currentCents: 150_000, previousCents: 100_000 }} />,
    );

    expect(html).toContain("50%");
    expect(html).not.toContain("R$");
  });

  it("fala a magnitude sem duplicar o sinal do texto visível", () => {
    const html = renderToStaticMarkup(
      <DeltaBadge
        amounts={{ currentCents: -200_000, previousCents: 100_000 }}
        label="vs. período anterior"
      />,
    );
    const spoken = html.replace(/\u00a0/g, " ");

    expect(spoken).toContain("-R$ 3.000,00");
    expect(spoken).toContain("Queda de R$ 3.000,00");
    expect(spoken).not.toContain("Queda de -R$");
  });

  it('respeita "Ocultar valores" sem vazar o número', () => {
    const html = renderToStaticMarkup(
      <PrivacyContext.Provider
        value={{ hideValues: true, setHideValues: () => {}, toggleHideValues: () => {} }}
      >
        <DeltaBadge
          amounts={{ currentCents: 281_200, previousCents: -200_000 }}
          label="vs. período anterior"
        />
      </PrivacyContext.Provider>,
    );

    expect(html).toContain("R$ ••••");
    expect(html).toContain("Valor oculto");
    expect(html).not.toContain("4.812");
  });

  it('fala o percentual mesmo com "Ocultar valores" (percentual não é valor)', () => {
    const html = renderToStaticMarkup(
      <PrivacyContext.Provider
        value={{ hideValues: true, setHideValues: () => {}, toggleHideValues: () => {} }}
      >
        <DeltaBadge amounts={{ currentCents: 150_000, previousCents: 100_000 }} />
      </PrivacyContext.Provider>,
    );

    expect(html).toContain("Aumento de 50%");
    expect(html).not.toContain("Valor oculto");
  });
});
