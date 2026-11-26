import type { TransactionType } from "@fd/contracts";

import type { PeriodSearch } from "./period";
import type { TransactionsSearch } from "./search";

/**
 * Montagem dos search params dos links da Visão geral. O período é a única
 * fonte da URL: cada destino herda `period`/`from`/`to` e recebe só o filtro
 * que o link promete (sem arrastar `q`, `tx` ou filtros de outra tela).
 */

/** Copia só os campos do período global, descartando o resto da search atual. */
export function periodOnlySearch(previous: PeriodSearch): PeriodSearch {
  const search: PeriodSearch = {};

  if (previous.period) {
    search.period = previous.period;
  }
  if (previous.from) {
    search.from = previous.from;
  }
  if (previous.to) {
    search.to = previous.to;
  }

  return search;
}

export interface OverviewTransactionsFilter {
  /** Natureza da transação (entradas/saídas). */
  type?: TransactionType;
  /**
   * Categoria. `null` é o balde "sem categoria" do detalhamento: vira o filtro
   * `uncategorized`, porque `categoryId` nulo não existe na URL.
   */
  categoryId?: string | null;
}

/** Search da rota de Transações: período atual + o filtro do link. */
export function transactionsLinkSearch(
  previous: PeriodSearch,
  filter: OverviewTransactionsFilter,
): TransactionsSearch {
  const search: TransactionsSearch = periodOnlySearch(previous);

  if (filter.type) {
    search.type = filter.type;
  }
  if (filter.categoryId === null) {
    search.uncategorized = true;
  } else if (filter.categoryId) {
    search.categoryId = filter.categoryId;
  }

  return search;
}
