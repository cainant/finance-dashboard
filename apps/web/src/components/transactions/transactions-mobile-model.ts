import type { Account, Category, Transaction } from "@fd/contracts";

import type { TransactionsSearch } from "@/lib/search";

/**
 * Modelo da lista de transações no mobile: filtros rápidos (chips) ↔ search
 * params, chips removíveis e agrupamento por dia. Sem React nem DOM: a tela só
 * liga estas funções aos componentes (e os testes cobrem a lógica sozinha).
 */

export type QuickKind = "all" | "expense" | "income" | "uncategorized" | "pending";

export const QUICK_KINDS: ReadonlyArray<{ kind: QuickKind; label: string }> = [
  { kind: "all", label: "Todas" },
  { kind: "expense", label: "Saídas" },
  { kind: "income", label: "Entradas" },
  { kind: "uncategorized", label: "Sem categoria" },
  { kind: "pending", label: "Pendentes" },
];

/** Os três parâmetros que os chips rápidos controlam (mutuamente exclusivos). */
type QuickPatch = Pick<TransactionsSearch, "type" | "uncategorized" | "pending" | "categoryId">;

/**
 * Chip rápido ativo. Os chips são exclusivos, mas a URL aceita combinações (um
 * link com `type=expense&uncategorized=true`): nesse caso nenhum chip fica
 * marcado (`"mixed"`) e cada parâmetro vira um chip removível.
 */
export function activeQuickKind(search: TransactionsSearch): QuickKind | "mixed" {
  const kinds: QuickKind[] = [];

  if (search.type === "expense") kinds.push("expense");
  if (search.type === "income") kinds.push("income");
  if (search.uncategorized) kinds.push("uncategorized");
  if (search.pending) kinds.push("pending");

  // `type=transfer` (link antigo) não tem chip, mas é um filtro ativo.
  if (search.type === "transfer") return "mixed";

  if (kinds.length === 0) return "all";
  if (kinds.length === 1) return kinds[0]!;
  return "mixed";
}

/**
 * Search params de cada chip: liga o próprio filtro e desliga os outros dois.
 * "Sem categoria" também solta a categoria específica (a rota nunca aceita as
 * duas juntas: o filtro especial vence).
 */
export function quickKindPatch(kind: QuickKind): QuickPatch {
  switch (kind) {
    case "expense":
      return { type: "expense", uncategorized: undefined, pending: undefined };
    case "income":
      return { type: "income", uncategorized: undefined, pending: undefined };
    case "uncategorized":
      return { type: undefined, uncategorized: true, pending: undefined, categoryId: undefined };
    case "pending":
      return { type: undefined, uncategorized: undefined, pending: true };
    case "all":
    default:
      return { type: undefined, uncategorized: undefined, pending: undefined };
  }
}

export interface ActiveFilterChip {
  key: string;
  label: string;
  /** Cor da categoria (hex), para o chip reproduzir o ponto da lista. */
  color?: string | null;
  /** Patch dos search params que remove o filtro. */
  clear: Partial<TransactionsSearch>;
}

/**
 * Chips removíveis dos filtros ativos que não são um chip rápido: conta e
 * categoria sempre; tipo/sem categoria/pendentes só numa combinação (`mixed`).
 * A busca (`q`) fica no próprio campo, não vira chip.
 */
export function activeFilterChips(
  search: TransactionsSearch,
  accounts: readonly Account[],
  categories: readonly Category[],
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (search.accountId) {
    const account = accounts.find((item) => item.id === search.accountId);
    chips.push({
      key: "account",
      label: account?.name ?? "Conta",
      clear: { accountId: undefined },
    });
  }

  if (search.categoryId) {
    const category = categories.find((item) => item.id === search.categoryId);
    chips.push({
      key: "category",
      label: category?.name ?? "Categoria",
      color: category?.color ?? null,
      clear: { categoryId: undefined },
    });
  }

  if (activeQuickKind(search) === "mixed") {
    if (search.type) {
      chips.push({
        key: "type",
        label:
          search.type === "expense"
            ? "Saídas"
            : search.type === "income"
              ? "Entradas"
              : "Transferências",
        clear: { type: undefined },
      });
    }
    if (search.uncategorized) {
      chips.push({
        key: "uncategorized",
        label: "Sem categoria",
        clear: { uncategorized: undefined },
      });
    }
    if (search.pending) {
      chips.push({ key: "pending", label: "Pendentes", clear: { pending: undefined } });
    }
  }

  return chips;
}

/** Filtros que o sheet controla e o ponto indicador do gatilho acompanha. */
export function hasSheetFilters(search: TransactionsSearch): boolean {
  return Boolean(
    search.accountId ||
    search.categoryId ||
    search.uncategorized ||
    (search.sort && search.sort !== "date_desc"),
  );
}

/* -------------------------------------------------------------------------- */
/* Agrupamento por dia                                                        */
/* -------------------------------------------------------------------------- */

export type MobileListItem =
  | {
      kind: "day";
      key: string;
      date: string;
      /**
       * Saldo do dia (entradas − saídas efetivadas, a mesma regra do resumo).
       * `null` quando não dá para afirmar: o dia ainda pode receber lançamentos
       * dos próximos lotes, ou só tem pendentes/transferências.
       */
      totalCents: number | null;
    }
  | { kind: "transaction"; key: string; transaction: Transaction };

/** Conta para o saldo do dia: efetivada e de natureza entrada/saída. */
export function countsTowardTotals(transaction: Transaction): boolean {
  return (
    transaction.status === "posted" &&
    (transaction.type === "income" || transaction.type === "expense")
  );
}

/**
 * Achata os lançamentos em itens de lista. Com `grouped`, cada dia vira um
 * cabeçalho com o saldo do dia; o último dia só tem total quando a lista está
 * completa (`hasMore = false`): os lotes seguintes ainda podem trazer mais
 * lançamentos dele, e um total parcial não pode passar por total do dia.
 */
type DayItem = Extract<MobileListItem, { kind: "day" }>;

export function buildMobileListItems(
  transactions: readonly Transaction[],
  options: { grouped: boolean; hasMore: boolean },
): MobileListItem[] {
  const items: MobileListItem[] = [];
  const days: Array<{ item: DayItem; sum: number; counted: number }> = [];

  for (const transaction of transactions) {
    let day = days.at(-1);

    if (options.grouped && transaction.date !== day?.item.date) {
      const item: DayItem = {
        kind: "day",
        key: `day:${transaction.date}`,
        date: transaction.date,
        totalCents: null,
      };
      day = { item, sum: 0, counted: 0 };
      days.push(day);
      items.push(item);
    }

    if (day && countsTowardTotals(transaction)) {
      day.sum += transaction.amountCents;
      day.counted += 1;
    }

    items.push({ kind: "transaction", key: `tx:${transaction.id}`, transaction });
  }

  days.forEach((day, index) => {
    const isLast = index === days.length - 1;
    day.item.totalCents = day.counted > 0 && !(isLast && options.hasMore) ? day.sum : null;
  });

  return items;
}
