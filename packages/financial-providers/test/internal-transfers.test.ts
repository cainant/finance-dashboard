/**
 * Regra de movimentação interna: transferência entre contas do próprio titular
 * e pagamento de fatura não são receita nem despesa.
 *
 * As descrições abaixo reproduzem o formato de um item MeuPluggy (o extrato
 * separa a contraparte com `|` no Open Finance ou ` - ` no conector do banco)
 * com nomes sintéticos — nenhum dado pessoal real.
 */
import { describe, expect, it } from "vitest";

import {
  counterpartyFromDescription,
  holderTokenSets,
  isInternalMovement,
  matchesInternalMovement,
  normalizeNameTokens,
} from "../src/pluggy/internal-transfers";

const HOLDER = ["Ana Souza"];

describe("movimentação interna — contraparte do extrato", () => {
  it("extrai a contraparte do formato Open Finance (pipe) e do formato do banco (hífen)", () => {
    expect(counterpartyFromDescription("Transferência Recebida|ANA SOUZA E SILVA")).toBe(
      "ANA SOUZA E SILVA",
    );
    expect(counterpartyFromDescription("Pix enviado  - Ana Souza E Silva")).toBe(
      "Ana Souza E Silva",
    );
    // O último separador manda: o prefixo pode repetir palavras.
    expect(
      counterpartyFromDescription("Pagamento efetuado - Pagamento Fatura - ANA SOUZA E SILVA"),
    ).toBe("ANA SOUZA E SILVA");
  });

  it("não inventa contraparte em compra no débito, salário ou descrição sem separador", () => {
    expect(counterpartyFromDescription("Compra no débito - L2 Market Ponta Grossa Bra")).toBeNull();
    expect(counterpartyFromDescription("Estorno - Compra no débito")).toBeNull();
    expect(counterpartyFromDescription("Salário recebido - Portabilidade -")).toBeNull();
    expect(counterpartyFromDescription("NETFLIX.COM")).toBeNull();
  });

  it("normaliza o nome em tokens sem acento, caixa e conectores curtos", () => {
    expect(normalizeNameTokens("Ana Souza e Silva")).toEqual(["ANA", "SOUZA", "SILVA"]);
  });
});

describe("movimentação interna — contraparte = titular", () => {
  it.each([
    ["Transferência Recebida|ANA SOUZA E SILVA"],
    ["Transferência Recebida|Ana Souza E Silva"],
    ["Pix recebido - Ana Souza E Silva"],
    ["Pix enviado  - Ana Souza E Silva"],
    ["Transferência enviada pelo Pix|Ana Souza e Silva"],
    ["Pagamento efetuado - Pagamento Fatura - ANA SOUZA E SILVA"],
  ])("reconhece %s como movimentação entre contas próprias", (description) => {
    expect(isInternalMovement(description, HOLDER)).toBe(true);
  });

  it("não confunde terceiros (inclusive parentes com o mesmo sobrenome)", () => {
    for (const description of [
      "Pix recebido - Beto Souza Lima",
      "Pix enviado  - Carla Pala Souza",
      "Transferência Recebida|Rafael Souza Silva",
      "Pix recebido - Ana Costa",
      "Pix enviado  - 99 Food Ltda",
      "Pix recebido - Diego Furlan",
      "Compra no débito|Uber UBER *TRIP HELP.U",
      "Estorno - Compra no débito",
    ]) {
      expect(isInternalMovement(description, HOLDER)).toBe(false);
    }
  });

  it("só considera transferências: compra/estorno/rendimento do mesmo titular não conta", () => {
    expect(isInternalMovement("Compra no débito - Ana Souza", HOLDER)).toBe(false);
    expect(isInternalMovement("Estorno - Ana Souza", HOLDER)).toBe(false);
    expect(isInternalMovement("Rendimentos - Ana Souza", HOLDER)).toBe(false);
  });

  it("resgate/aplicação com contraparte do titular também é movimentação interna", () => {
    // Troca entre conta corrente e investimento não é receita/despesa.
    expect(isInternalMovement("Resgate - Ana Souza", HOLDER)).toBe(true);
  });

  it("caracteriza o superconjunto aceito: sufixos no nome do titular casam", () => {
    // Risco conhecido: "Junior"/"MEI" e empresa no nome do titular também casam,
    // e `type` não é editável pela UI. Ver "Merge Danger" e o follow-up de CPF
    // via paymentData.payer/receiver.documentNumber.
    expect(isInternalMovement("Pix enviado  - Ana Souza Junior", HOLDER)).toBe(true);
    expect(isInternalMovement("Pix enviado - Ana Souza Mei Ltda", HOLDER)).toBe(true);
  });

  it("exige nome do titular com ao menos dois tokens significativos", () => {
    // Um nome de uma palavra casaria com qualquer homônimo: melhor não arriscar.
    expect(isInternalMovement("Pix recebido - Ana Costa", ["Ana"])).toBe(false);
    // Sobrenome curto ("Li") some na normalização e a regra fica desligada.
    expect(isInternalMovement("Pix recebido - Ana Li E Silva", ["Ana Li"])).toBe(false);
    expect(isInternalMovement("Pix recebido - Ana Costa", ["Ana Souza"])).toBe(false);
  });

  it("ignora conectores curtos do titular ao comparar", () => {
    expect(isInternalMovement("Pix recebido - Ana T Souza", ["Ana T Souza"])).toBe(true);
    expect(isInternalMovement("Pix recebido - Ana Souza", ["Ana T Souza"])).toBe(true);
  });

  it("sem nome do titular (provider puro, testes) nunca marca movimentação interna", () => {
    expect(isInternalMovement("Transferência Recebida|ANA SOUZA E SILVA", [])).toBe(false);
    expect(isInternalMovement("Transferência Recebida|ANA SOUZA E SILVA", undefined)).toBe(false);
  });

  it("aceita os tokens do titular pré-normalizados (backfill não recalcula por linha)", () => {
    const tokens = holderTokenSets(["Ana Souza"]);
    expect(tokens).toEqual([["ANA", "SOUZA"]]);
    expect(matchesInternalMovement("Pix recebido - Ana Souza E Silva", tokens)).toBe(true);
    expect(matchesInternalMovement("Pix recebido - Beto Souza Lima", tokens)).toBe(false);
    // Nome sem 2 tokens significativos não gera conjunto: regra desligada.
    expect(holderTokenSets(["Ana"])).toEqual([]);
    expect(matchesInternalMovement("Pix recebido - Ana Costa", holderTokenSets(["Ana"]))).toBe(
      false,
    );
  });
});
