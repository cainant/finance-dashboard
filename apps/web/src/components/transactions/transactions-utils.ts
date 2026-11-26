import type { Transaction } from "@fd/contracts";

import type { TransactionsFilters } from "@/lib/queries";

/** Altura da linha de data (cabeçalho de cada dia) na tabela virtualizada. */
export const DAY_HEADER_HEIGHT = 32;
/** Altura da linha de transação na tabela virtualizada. */
export const TRANSACTION_ROW_HEIGHT = 44;

/**
 * Controles que respondem por conta própria: o clique neles não abre o painel
 * da transação. `[data-slot='popover-content']` é necessário porque o Radix
 * renderiza o popover em portal, mas o evento continua borbulhando pela árvore
 * React até a linha (sem ele, escolher uma categoria abriria o painel junto).
 */
const ROW_CLICK_IGNORE_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "label",
  "[role='option']",
  "[data-slot='popover-content']",
].join(", ");

/** Seleção de texto ativa (duplo clique ou arrastar) dentro do contêiner. */
function hasTextSelectionInside(container: Element | null): boolean {
  if (!container || typeof window === "undefined") {
    return false;
  }

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    return false;
  }

  const anchor = selection.anchorNode;
  const anchorElement = anchor instanceof Element ? anchor : (anchor?.parentElement ?? null);
  return Boolean(anchorElement && container.contains(anchorElement));
}

/**
 * `true` quando o clique encerrou uma seleção de texto (arrasto/duplo clique):
 * a linha (ou o botão da descrição) não deve abrir o painel por cima dela.
 */
export function isTextSelectionClick(container: Element | null): boolean {
  return hasTextSelectionInside(container);
}

/**
 * `true` quando o clique não deve abrir o painel: veio de um controle interno
 * ou encerrou uma seleção de texto dentro da linha.
 */
export function shouldIgnoreRowClick(target: EventTarget | null, row: Element | null): boolean {
  if (hasTextSelectionInside(row)) {
    return true;
  }

  return target instanceof Element && target.closest(ROW_CLICK_IGNORE_SELECTOR) !== null;
} /**
 * Converte os filtros da página no contrato de `transactionsInfiniteQueryOptions`.
 * Ponto único do parâmetro `uncategorized` (tipo compartilhado com a API).
 */
export function withUncategorizedFilter(
  filters: TransactionsFilters,
  uncategorized: boolean | undefined,
  pending?: boolean,
): TransactionsFilters {
  return {
    ...filters,
    ...(uncategorized ? { uncategorized: true } : {}),
    ...(pending ? { pending: true } : {}),
  };
}

/**
 * Rodapé da lista: "50 de 760 lançamentos" quando o total do filtro já chegou
 * (`GET /api/transactions/summary`) e o texto antigo, só com o carregado,
 * enquanto ele não chegou ou falhou. Nunca inventar um total: sem `total`, o
 * rodapé não pode prometer um número que a tela não conhece.
 */
export function formatTransactionsCount(loaded: number, total?: number): string {
  const loadedLabel = loaded.toLocaleString("pt-BR");

  if (total === undefined) {
    return loaded === 1 ? "1 lançamento carregado" : `${loadedLabel} lançamentos carregados`;
  }

  const resolvedTotal = Math.max(total, loaded);
  const totalLabel = resolvedTotal.toLocaleString("pt-BR");

  if (resolvedTotal > loaded) {
    return `${loadedLabel} de ${totalLabel} lançamentos`;
  }

  return resolvedTotal === 1 ? "1 lançamento" : `${totalLabel} lançamentos`;
}

export type TransactionsListItem =
  | { kind: "day"; key: string; date: string }
  | { kind: "transaction"; key: string; transaction: Transaction };

/**
 * Achata os lançamentos em itens de lista: com agrupamento, cada dia ganha um
 * cabeçalho e as transações daquele dia vêm logo abaixo. Sem agrupamento
 * (ordenação por valor), cada transação vira um item solto com a data inline.
 */
export function buildTransactionsListItems(
  transactions: readonly Transaction[],
  grouped: boolean,
): TransactionsListItem[] {
  const items: TransactionsListItem[] = [];
  let currentDate: string | null = null;

  for (const transaction of transactions) {
    if (grouped && transaction.date !== currentDate) {
      currentDate = transaction.date;
      items.push({ kind: "day", key: `day:${transaction.date}`, date: transaction.date });
    }

    items.push({ kind: "transaction", key: `tx:${transaction.id}`, transaction });
  }

  return items;
}

export interface TransactionPanelState {
  /** Transação aberta no painel; `null` quando fechado ou fora do recorte. */
  transaction: Transaction | null;
  previous?: Transaction;
  next?: Transaction;
}

/**
 * Resolve o painel de detalhe a partir do id guardado na URL (`?tx=`). O
 * painel só abre com a transação presente na lista carregada: a URL carrega os
 * mesmos filtros, então o link compartilhado resolve no mesmo recorte.
 */
export function resolveTransactionPanel(
  transactions: readonly Transaction[],
  transactionId: string | undefined,
): TransactionPanelState {
  if (!transactionId) {
    return { transaction: null, previous: undefined, next: undefined };
  }

  const index = transactions.findIndex((transaction) => transaction.id === transactionId);
  if (index < 0) {
    return { transaction: null, previous: undefined, next: undefined };
  }

  return {
    transaction: transactions[index] ?? null,
    previous: index > 0 ? transactions[index - 1] : undefined,
    next: index + 1 < transactions.length ? transactions[index + 1] : undefined,
  };
}

export interface TransactionCategoryUsage {
  /** Contagem de lançamentos carregados por `categoryId`. */
  byCategory: Map<string, number>;
  /** Lançamentos carregados sem categoria. */
  uncategorizedCount: number;
}

/** Conta lançamentos carregados por categoria (para a coluna lateral). */
export function summarizeCategories(
  transactions: readonly Transaction[],
): TransactionCategoryUsage {
  const byCategory = new Map<string, number>();
  let uncategorizedCount = 0;

  for (const transaction of transactions) {
    if (!transaction.categoryId) {
      uncategorizedCount += 1;
      continue;
    }

    byCategory.set(transaction.categoryId, (byCategory.get(transaction.categoryId) ?? 0) + 1);
  }

  return { byCategory, uncategorizedCount };
}
