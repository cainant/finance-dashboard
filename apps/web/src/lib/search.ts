import { TRANSACTION_SORTS, TRANSACTION_TYPES } from "@fd/contracts";
import { z } from "zod";

import { normalizePeriodSearch, periodSearchShape, type PeriodSearch } from "./period";

/**
 * Filtros da lista de transações persistidos na URL (search params validados).
 * Entradas inválidas caem no valor padrão em vez de quebrar a navegação.
 *
 * Todo `.transform` de search deste arquivo devolve **todas** as chaves do schema, com
 * `undefined` nas descartadas. O router faz `{ ...searchDoPai, ...searchValidada }` (a search do
 * pai ainda carrega o query string bruto), então uma chave omitida voltaria com o valor bruto.
 */
const optionalId = z.string().min(1).max(128).optional().catch(undefined);

/**
 * `?uncategorized=true` pode chegar como booleano (o router JSON-parseia
 * valores que começam com `t`/`f`) ou como string, conforme quem escreveu a
 * URL. Aceita os dois e normaliza para booleano.
 */
const uncategorizedSearch = z.union([z.boolean(), z.stringbool()]).optional().catch(undefined);

export const transactionsSearchSchema = z
  .object({
    ...periodSearchShape,
    /** Busca por descrição/estabelecimento. */
    q: z.string().trim().max(120).optional().catch(undefined),
    accountId: optionalId,
    categoryId: optionalId,
    type: z.enum(TRANSACTION_TYPES).optional().catch(undefined),
    sort: z.enum(TRANSACTION_SORTS).catch("date_desc"),
    /** Só lançamentos sem categoria (mesma regra da contagem global). */
    uncategorized: uncategorizedSearch,
    /** Só lançamentos pendentes (`status = pending`). */
    pending: uncategorizedSearch,
    /** Painel de detalhe aberto: id da transação (`?tx=`), não é filtro. */
    tx: optionalId,
    /** Sheet de filtros do mobile aberto (`?filters=true`), não é filtro. */
    filters: uncategorizedSearch,
  })
  .transform((value): TransactionsSearch => ({
    ...normalizePeriodSearch(value),
    q: value.q || undefined,
    accountId: value.accountId || undefined,
    // "Sem categoria" e uma categoria específica se excluem: o filtro especial
    // vence para a listagem nunca voltar vazia por causa dos dois na URL.
    uncategorized: value.uncategorized ? true : undefined,
    categoryId: value.uncategorized ? undefined : value.categoryId || undefined,
    pending: value.pending ? true : undefined,
    type: value.type,
    sort: value.sort === "date_desc" ? undefined : value.sort,
    tx: value.tx || undefined,
    // O detalhe vence o sheet de filtros: nunca há dois abertos (link com os dois params).
    filters: value.filters && !value.tx ? true : undefined,
  }));

export type TransactionsSearch = PeriodSearch & {
  q?: string;
  accountId?: string;
  categoryId?: string;
  type?: (typeof TRANSACTION_TYPES)[number];
  sort?: (typeof TRANSACTION_SORTS)[number];
  uncategorized?: boolean;
  pending?: boolean;
  /** Painel de detalhe aberto (id da transação). */
  tx?: string;
  /**
   * Sheet de filtros do mobile aberto. Mora na URL como o `tx` (o voltar do
   * sistema o fecha), mas não é filtro: fica fora de `hasActiveTransactionFilters`,
   * das query keys e de "Limpar".
   */
  filters?: boolean;
};

/**
 * Filtro de instituição da página de contas, alimentado pelos sub-itens da
 * sidebar. `connection` é obrigatório para o filtro valer: o mesmo banco pode
 * aparecer em duas conexões (dois itens MeuPluggy), e só o nome não distingue.
 */
export const accountsSearchSchema = z
  .object({
    connection: optionalId,
    institution: z.string().trim().min(1).max(120).optional().catch(undefined),
  })
  .transform((value): AccountsSearch => ({
    connection: value.connection || undefined,
    institution: value.institution || undefined,
  }));

export type AccountsSearch = {
  connection?: string;
  institution?: string;
};

/**
 * Seleção inicial da página de Cartões, usada pelos links da Visão geral:
 * `card` (id da conta do cartão) e `bill` (id da fatura). Ids que não existem
 * são ignorados pela página e ela cai no cartão/fatura padrão.
 */
export const creditCardsSearchSchema = z
  .object({
    card: optionalId,
    bill: optionalId,
  })
  .transform((value): CreditCardsSearch => ({
    card: value.card || undefined,
    bill: value.bill || undefined,
  }));

export type CreditCardsSearch = {
  card?: string;
  bill?: string;
};

/** `true` quando há algum filtro além do período global. */
export function hasActiveTransactionFilters(search: TransactionsSearch): boolean {
  return Boolean(
    search.q ||
    search.accountId ||
    search.categoryId ||
    search.type ||
    search.uncategorized ||
    search.pending,
  );
}

/**
 * Abre o painel de detalhe no `id`, preservando os filtros da URL. A navegação
 * é um push de histórico: o "voltar" do navegador fecha o painel.
 */
export function openTransactionPanel(search: TransactionsSearch, id: string): TransactionsSearch {
  return { ...search, tx: id };
}

/** Fecha o painel: o `tx` sai da URL e os filtros permanecem. */
export function closeTransactionPanel(search: TransactionsSearch): TransactionsSearch {
  return { ...search, tx: undefined };
}

/** O que o sheet de filtros do mobile altera (o resto da URL ele não toca). */
export const SHEET_FILTER_KEYS = [
  "accountId",
  "categoryId",
  "uncategorized",
  "pending",
  "sort",
] as const;

export type SheetFilters = Pick<TransactionsSearch, (typeof SHEET_FILTER_KEYS)[number]>;

export function pickSheetFilters(search: TransactionsSearch): SheetFilters {
  return {
    accountId: search.accountId,
    categoryId: search.categoryId,
    uncategorized: search.uncategorized,
    pending: search.pending,
    sort: search.sort,
  };
}

export function sameSheetFilters(a: SheetFilters, b: SheetFilters): boolean {
  return SHEET_FILTER_KEYS.every((key) => a[key] === b[key]);
}

/**
 * Fatura selecionada no detalhe do cartão (`?bill=`). A seleção é estado de
 * leitura: quem a muda usa `replace` para o voltar não passar por cada fatura.
 */
export const cardDetailSearchSchema = z
  .object({ bill: optionalId })
  .transform((value): CardDetailSearch => ({ bill: value.bill || undefined }));

export type CardDetailSearch = { bill?: string };
