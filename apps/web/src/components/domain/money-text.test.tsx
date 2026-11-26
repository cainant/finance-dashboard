import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HIDE_VALUES_STORAGE_KEY, HIDDEN_MONEY_TEXT } from "@/components/privacy/privacy-context";
import { PrivacyProvider } from "@/components/privacy/privacy-provider";

import { MoneyText } from "./money-text";

/** Simula a preferência já persistida (o provider lê no primeiro render). */
function stubHiddenPreference() {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => (key === HIDE_VALUES_STORAGE_KEY ? "1" : null),
      setItem: () => undefined,
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MoneyText", () => {
  it("formata centavos em BRL com sinal automático", () => {
    const html = renderToStaticMarkup(<MoneyText valueCents={-123456} />);

    expect(html).toContain("-R$");
    expect(html).toContain("1.234,56");
    expect(html).toContain('data-slot="money"');
  });

  it("mostra o intervalo vazio como '—' sem valor", () => {
    expect(renderToStaticMarkup(<MoneyText valueCents={null} />)).toContain("—");
  });

  it("usa foreground por padrão e só colore quando pedido", () => {
    const neutral = renderToStaticMarkup(<MoneyText valueCents={123456} />);
    expect(neutral).toContain("text-foreground");
    expect(neutral).not.toContain("text-positive");

    const automatic = renderToStaticMarkup(<MoneyText valueCents={123456} tone="auto" />);
    expect(automatic).toContain("text-positive");
  });

  it("mascara o valor de verdade e anuncia 'Valor oculto'", () => {
    stubHiddenPreference();

    const html = renderToStaticMarkup(
      <PrivacyProvider>
        <MoneyText valueCents={123456} title="Saldo disponível" />
      </PrivacyProvider>,
    );

    expect(html).toContain(HIDDEN_MONEY_TEXT);
    expect(html).not.toContain("1.234,56");
    expect(html).toContain('aria-label="Valor oculto"');
    expect(html).not.toContain("Saldo disponível");
    expect(html).toContain('data-hidden="true"');
  });

  it("mantém '—' quando não há valor, mesmo com valores ocultos", () => {
    stubHiddenPreference();

    const html = renderToStaticMarkup(
      <PrivacyProvider>
        <MoneyText valueCents={undefined} />
      </PrivacyProvider>,
    );

    expect(html).toContain("—");
    expect(html).not.toContain(HIDDEN_MONEY_TEXT);
  });
});
