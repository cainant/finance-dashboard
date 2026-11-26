import { describe, expect, it } from "vitest";

import { DEMO_CONNECTION_EXTERNAL_IDS } from "../src/demo/data";
import { DemoProvider, prewarmDemoDataset } from "../src/demo";

const NOW = new Date("2026-11-10T12:00:00.000Z");

/**
 * O dataset demo é gerado no startup (`prewarmDemoDataset`), que não conta no
 * CPU por request. Este teste mede o custo que sobra no request: percorrer o
 * dataset já aquecido e montar as páginas. Também guarda a regressão do build
 * frio (que roda no startup).
 */
describe("custo de CPU do DemoProvider", () => {
  it("percorre o dataset aquecido dentro do orçamento de 10 ms", async () => {
    prewarmDemoDataset(NOW);
    const provider = new DemoProvider({ now: NOW });

    const started = performance.now();
    const connections = Object.values(DEMO_CONNECTION_EXTERNAL_IDS);
    let transactions = 0;

    for (const connection of connections) {
      await provider.getConnection(connection);
      const accounts = await provider.getAccounts(connection);
      const cards = await provider.getCreditCards(connection);
      for (const card of cards) await provider.getBills(card.accountExternalId);
      await provider.getBalances(connection);
      await provider.getInvestments(connection);
      for (const account of accounts) {
        const page = await provider.getTransactionsPage(account.externalId, {
          from: "2025-11-11",
          to: "2026-11-10",
        });
        transactions += page.transactions.length;
      }
    }

    const elapsed = performance.now() - started;
    // Uma página (60) por conta: é o trabalho que cabe em um request do sync.
    expect(transactions).toBeGreaterThan(100);
    expect(elapsed).toBeLessThan(10);
  });

  it("build frio (startup) fica abaixo do limite de startup", () => {
    const started = performance.now();
    prewarmDemoDataset(new Date("2027-01-15T12:00:00.000Z"));
    const elapsed = performance.now() - started;

    // Documenta o custo que foi movido para o startup do isolate.
    expect(elapsed).toBeLessThan(100);
  });
});
