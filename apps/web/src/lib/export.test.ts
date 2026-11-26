import type { Transaction } from "@fd/contracts";
import { describe, expect, it } from "vitest";

import {
  collectAllTransactions,
  transactionsCsvFilename,
  transactionsToCsv,
  type TransactionsExportPage,
} from "./export";

const base: Transaction = {
  id: "t1",
  userId: "u1",
  accountId: "a1",
  connectionId: "c1",
  externalId: "ext-1",
  date: "2026-11-05",
  description: "Compra no mercado",
  amountCents: -12345,
  currency: "BRL",
  type: "expense",
  categoryId: "cat_mercado",
  status: "posted",
  billId: null,
  merchant: "Mercado Aurora",
  notes: null,
  installmentNumber: null,
  totalInstallments: null,
  budgetGroupId: null,
  createdAt: "2026-11-05T12:00:00.000Z",
  updatedAt: "2026-11-05T12:00:00.000Z",
  category: {
    id: "cat_mercado",
    userId: null,
    name: "Mercado",
    slug: "mercado",
    icon: "ShoppingCart",
    color: "#22c55e",
    kind: "expense",
    parentId: null,
  },
  account: {
    id: "a1",
    name: "Conta corrente",
    numberMasked: "****1234",
    currency: "BRL",
    balanceCents: 100000,
    availableCents: 100000,
    provider: "demo",
    institutionName: "Banco Aurora",
    institutionLogoUrl: null,
  },
};

describe("transactionsToCsv", () => {
  it("exporta cabeçalho estável e valores em BRL", () => {
    const csv = transactionsToCsv([base]);
    const [header, line] = csv.split("\r\n");

    expect(header).toBe(
      "Data;Descrição;Estabelecimento;Categoria;Conta;Instituição;Tipo;Status;Valor (BRL);Notas",
    );
    expect(line).toBe(
      "2026-11-05;Compra no mercado;Mercado Aurora;Mercado;Conta corrente;Banco Aurora;Saída;Efetivada;-123,45;",
    );
  });

  it("escapa campos com ponto e vírgula, aspas e quebra de linha", () => {
    const csv = transactionsToCsv([
      {
        ...base,
        description: 'Padaria "Pão"; centro',
        notes: "linha 1\nlinha 2",
      },
    ]);
    const line = csv.split("\r\n")[1];

    expect(line).toContain('"Padaria ""Pão""; centro"');
    expect(line).toContain('"linha 1\nlinha 2"');
  });

  it("usa campos vazios quando não há categoria, conta ou notas", () => {
    const csv = transactionsToCsv([
      {
        ...base,
        category: null,
        account: null,
        merchant: null,
        notes: null,
      },
    ]);
    const line = csv.split("\r\n")[1];

    expect(line).toBe("2026-11-05;Compra no mercado;;;;;Saída;Efetivada;-123,45;");
  });
});

describe("transactionsCsvFilename", () => {
  it("inclui o intervalo no nome do arquivo", () => {
    expect(transactionsCsvFilename("2026-10-12", "2026-11-10")).toBe(
      "lumen-transacoes-2026-10-12-a-2026-11-10.csv",
    );
  });
});

describe("collectAllTransactions", () => {
  function pageOf(ids: readonly string[], nextCursor: string | null): TransactionsExportPage {
    return {
      data: ids.map((id) => ({ ...base, id, externalId: `ext-${id}` })),
      page: { cursor: null, nextCursor },
    };
  }

  it("percorre todas as páginas até o último cursor", async () => {
    const cursors: Array<string | null> = [];

    const rows = await collectAllTransactions(async (cursor) => {
      cursors.push(cursor);
      return cursor === null ? pageOf(["a", "b"], "c1") : pageOf(["c"], null);
    });

    expect(cursors).toEqual([null, "c1"]);
    expect(rows.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("devolve a única página quando não há próximo cursor", async () => {
    const rows = await collectAllTransactions(async () => pageOf(["a"], null));

    expect(rows).toHaveLength(1);
  });

  it("falha em vez de truncar quando a API repete um cursor", async () => {
    await expect(collectAllTransactions(async () => pageOf(["a"], "c1"))).rejects.toThrow(/cursor/);
  });
});
