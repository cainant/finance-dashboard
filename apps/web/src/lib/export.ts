import type { Transaction, TransactionsResponse } from "@fd/contracts";

import { formatDate } from "./format";

const TYPE_LABELS: Record<Transaction["type"], string> = {
  income: "Entrada",
  expense: "Saída",
  transfer: "Transferência",
};

const STATUS_LABELS: Record<Transaction["status"], string> = {
  posted: "Efetivada",
  pending: "Pendente",
};

function escapeField(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);

  if (/[";\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function amountToBrl(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Converte transações em CSV compatível com Excel pt-BR (separador `;`).
 * A ordem das colunas é estável para facilitar diff e reimportação manual.
 */
export function transactionsToCsv(rows: readonly Transaction[]): string {
  const header = [
    "Data",
    "Descrição",
    "Estabelecimento",
    "Categoria",
    "Conta",
    "Instituição",
    "Tipo",
    "Status",
    "Valor (BRL)",
    "Notas",
  ];

  const lines = rows.map((row) =>
    [
      row.date,
      row.description,
      row.merchant,
      row.category?.name ?? "",
      row.account?.name ?? "",
      row.account?.institutionName ?? "",
      TYPE_LABELS[row.type],
      STATUS_LABELS[row.status],
      amountToBrl(row.amountCents),
      row.notes,
    ]
      .map(escapeField)
      .join(";"),
  );

  return [header.join(";"), ...lines].join("\r\n");
}

/** Nome de arquivo estável para o período exportado. */
export function transactionsCsvFilename(from: string, to: string): string {
  return `lumen-transacoes-${from}-a-${to}.csv`;
}

/** Tamanho de lote da exportação: o máximo de `limit` que a API aceita. */
export const EXPORT_PAGE_LIMIT = 200;

/** Só o que a exportação precisa de cada página (data + próximo cursor). */
export type TransactionsExportPage = Pick<TransactionsResponse, "data" | "page">;

/**
 * Percorre todas as páginas do filtro até o cursor acabar.
 *
 * A busca entra como função — em vez de a função conhecer a API — para o teste
 * rodar sem rede. Cursor repetido indica bug da API: falha alto em vez de
 * devolver um CSV incompleto que o usuário mandaria para fora sem saber.
 */
export async function collectAllTransactions(
  fetchPage: (cursor: string | null) => Promise<TransactionsExportPage>,
): Promise<Transaction[]> {
  const rows: Transaction[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;

  for (;;) {
    const page = await fetchPage(cursor);
    rows.push(...page.data);

    const next = page.page.nextCursor;
    if (!next) {
      return rows;
    }

    if (seen.has(next)) {
      throw new Error("A API repetiu um cursor durante a exportação");
    }

    seen.add(next);
    cursor = next;
  }
}

/** Dispara o download de um CSV com BOM (Excel abre em UTF-8 corretamente). */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Rótulo humano da data para o nome do arquivo. */
export function periodFileLabel(from: string, to: string): string {
  return `${formatDate(from)} a ${formatDate(to)}`;
}
