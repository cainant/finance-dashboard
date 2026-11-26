import type { TransactionType } from "@fd/contracts";
import type { Database } from "@fd/database";
import { transactions } from "@fd/database/schema";
import { and, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";

import { incomeExpenseSums } from "./analytics";

/**
 * Regra única de "transação sem categoria", compartilhada pela contagem
 * (`GET /api/transactions/uncategorized-count`) e pelo filtro da listagem
 * (`GET /api/transactions?uncategorized=true`):
 *
 * - `category_id IS NULL` — a definição de sem categoria;
 * - `status = 'posted'` — pendentes ainda podem mudar ou desaparecer e não
 *   entram nas análises;
 * - `type IN ('income', 'expense')` — transferências não recebem categoria por
 *   natureza e já ficam fora de receitas/despesas nas análises;
 * - nenhum filtro por status da conexão: `DELETE /api/connections/:id` apaga em
 *   cascata, e transações de conexão `disconnected` continuam visíveis na
 *   listagem e nas análises (que não filtram status de conexão).
 *
 * As duas consultas usam o índice `transactions_user_id_date_idx` para escopar
 * o `COUNT`/`SELECT` ao usuário; não é preciso migration nova.
 */
export function uncategorizedCondition(): SQL {
  return sql`${isNull(transactions.categoryId)} AND ${eq(
    transactions.status,
    "posted",
  )} AND ${inArray(transactions.type, ["income", "expense"])}`;
}

/**
 * Filtros de transações compartilhados pela listagem e pelo resumo. O resumo
 * precisa do **mesmo** recorte da lista, então a montagem do `WHERE` vive aqui
 * (um lugar só): qualquer filtro novo entra nas duas rotas de uma vez.
 */
export interface TransactionFilterInput {
  from: string;
  to: string;
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
  q?: string;
  uncategorized?: boolean;
  pending?: boolean;
}

/** Condições do `WHERE` para um usuário e um recorte de filtros. */
export function transactionFilterConditions(userId: string, query: TransactionFilterInput): SQL[] {
  const conditions: SQL[] = [
    eq(transactions.userId, userId),
    gte(transactions.date, query.from),
    lte(transactions.date, query.to),
  ];
  if (query.accountId) conditions.push(eq(transactions.accountId, query.accountId));
  if (query.categoryId) conditions.push(eq(transactions.categoryId, query.categoryId));
  if (query.type) conditions.push(eq(transactions.type, query.type));
  if (query.uncategorized) conditions.push(uncategorizedCondition());
  if (query.pending) conditions.push(eq(transactions.status, "pending"));

  if (query.q) {
    // `instr` evita duas armadilhas do D1: o limite de 50 bytes em padrões
    // LIKE/GLOB e a necessidade de escapar `%`/`_`/`\`. O valor continua sendo
    // um parâmetro vinculado (nunca interpolado no SQL).
    const needle = query.q.toLowerCase();
    conditions.push(
      sql`(instr(lower(${transactions.description}), ${needle}) > 0 OR instr(lower(coalesce(${transactions.merchant}, '')), ${needle}) > 0)`,
    );
  }

  return conditions;
}

export interface TransactionSummaryCategoryCount {
  /** `null` = sem categoria. */
  categoryId: string | null;
  count: number;
}

export interface TransactionSummary {
  /** Lançamentos do filtro inteiro (base do "50 de N" na UI). */
  totalCount: number;
  incomeCents: number;
  /** Positivo, como em `/api/overview`. */
  expensesCents: number;
  resultCents: number;
  categories: TransactionSummaryCategoryCount[];
}

/**
 * Agrega o filtro inteiro **em uma query SQL** (limite de 10 ms de CPU do
 * Workers Free): o `GROUP BY category_id` rende o total e as contagens por
 * categoria de uma vez, sem trazer linha nenhuma para o JS. A redução em JS
 * percorre no máximo as categorias usadas no recorte.
 *
 * Regras:
 * - `totalCount` e as contagens por categoria incluem **tudo** que a lista
 *   mostra (pendentes e transferências incluídos): elas precisam fechar com as
 *   linhas visíveis e com o rodapé "50 de N".
 * - Receitas/despesas/resultado usam `incomeExpenseSums` — a mesma regra dos
 *   KPIs (`só income/expense`, `só posted`): o mesmo período devolve os mesmos
 *   números de `/api/overview`. O sinal vem do `amount_cents` (despesa é
 *   negativa), então as despesas são devolvidas em módulo.
 */
export async function transactionsSummary(
  db: Database,
  userId: string,
  query: TransactionFilterInput,
): Promise<TransactionSummary> {
  // Receita/despesa usa a regra única das agregações (`incomeExpenseSums`):
  // só income/expense e só `posted` — igual aos KPIs da visão geral.
  // `count(*)` e o agrupamento, porém, contam tudo que a lista mostra
  // (pendentes e transferências incluídos), porque `totalCount` e as
  // contagens por categoria precisam fechar com as linhas visíveis.
  const sums = incomeExpenseSums(transactions.amountCents, transactions.type, transactions.status);
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      count: sql<number>`count(*)`,
      incomeCents: sums.incomeCents,
      expensesCents: sums.expensesCents,
    })
    .from(transactions)
    .where(and(...transactionFilterConditions(userId, query)))
    .groupBy(transactions.categoryId);

  let totalCount = 0;
  let incomeCents = 0;
  let expensesCents = 0;
  const categories: TransactionSummaryCategoryCount[] = [];

  for (const row of rows) {
    const count = Number(row.count);
    totalCount += count;
    incomeCents += Number(row.incomeCents);
    expensesCents += Number(row.expensesCents);
    categories.push({ categoryId: row.categoryId, count });
  }

  // Ordem estável: categoria mais usada primeiro; "sem categoria" por último.
  categories.sort(
    (a, b) => b.count - a.count || (a.categoryId ?? "").localeCompare(b.categoryId ?? ""),
  );

  return {
    totalCount,
    incomeCents,
    expensesCents,
    resultCents: incomeCents - expensesCents,
    categories,
  };
}
