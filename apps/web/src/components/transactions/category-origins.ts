import type { Category, Transaction } from "@fd/contracts";
import { useCallback, useState } from "react";

import { isForeignCategory } from "./category-picker-options";

/**
 * Categoria de outra natureza que cada linha tinha antes da última troca
 * (`transactionId` -> categoria).
 *
 * O seletor a fixa no topo para a troca ser reversível: o filtro por natureza
 * esconderia a categoria original e o usuário não teria como voltar. O estado
 * vive acima da tabela porque as células são remontadas quando o memo de
 * colunas recalcula — um `useState` dentro do seletor se perderia.
 */
export type CategoryOrigins = ReadonlyMap<string, Category>;

/**
 * Guarda a categoria atual da linha quando ela é de outra natureza. A primeira
 * vista vence: trocar de "Transferências" para "Mercado" e depois para "Lazer"
 * mantém "Transferências" como origem. Linha sem categoria ou de mesma natureza
 * não gera entrada e o mapa volta com a mesma identidade.
 *
 * A categoria vem embutida na transação quando a API a devolve (lista de
 * transações) e é resolvida pela lista de referência quando não vem (Visão
 * geral), igual ao que o seletor mostra no gatilho.
 */
export function rememberOrigin(
  origins: CategoryOrigins,
  transaction: Transaction,
  categories: readonly Category[],
): CategoryOrigins {
  const current =
    transaction.category ??
    (transaction.categoryId
      ? categories.find((category) => category.id === transaction.categoryId)
      : undefined) ??
    null;

  if (!current || !isForeignCategory(current, transaction.type) || origins.has(transaction.id)) {
    return origins;
  }

  return new Map(origins).set(transaction.id, current);
}

export interface UseCategoryOrigins {
  origins: CategoryOrigins;
  /** Registra a categoria de origem da linha antes de gravar a troca. */
  remember: (transaction: Transaction) => void;
}

/**
 * Estado das categorias de origem, compartilhado pela tabela e pelo painel.
 * `categories` é a mesma lista de referência que o seletor recebe.
 */
export function useCategoryOrigins(categories: readonly Category[]): UseCategoryOrigins {
  const [origins, setOrigins] = useState<CategoryOrigins>(() => new Map());

  const remember = useCallback(
    (transaction: Transaction) => {
      setOrigins((previous) => rememberOrigin(previous, transaction, categories));
    },
    [categories],
  );

  return { origins, remember };
}
