import type { Database } from "@fd/database";
import { todayIsoDate, type Granularity, type Period } from "@fd/contracts";
import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * Agregações financeiras executadas **em SQL** (limite de 10 ms de CPU do
 * Workers Free). Resultados são pequenos e o preenchimento de buckets vazios
 * fica em JS.
 */

export interface Totals {
  incomeCents: number;
  expensesCents: number;
}

/** Coluna ou expressão SQL aceita nas somas de receita/despesa. */
type SumInput = AnyColumn | SQL;

/**
 * Regra única de receita/despesa das agregações: **só `income` e `expense`, só
 * `posted`**. Transferências ficam fora — incluindo as movimentações internas
 * entre contas do titular, que o sync classifica como `type = 'transfer'` (ver
 * PR #45) — e pendentes também (ainda podem mudar/cair). `expensesCents` volta
 * positivo (despesa no banco é negativa).
 *
 * Usada pelos KPIs (`transactionTotals`), pelas séries e pelo resumo da lista
 * (`transactionsSummary`), para os números nunca divergirem entre telas.
 */
export function incomeExpenseSums(amountCents: SumInput, type: SumInput, status: SumInput) {
  return {
    incomeCents: sql<number>`coalesce(sum(case when ${type} = 'income' and ${status} = 'posted' then ${amountCents} else 0 end), 0)`,
    expensesCents: sql<number>`coalesce(sum(case when ${type} = 'expense' and ${status} = 'posted' then -${amountCents} else 0 end), 0)`,
  };
}

export interface BalanceTotals {
  /** Contas que não são cartão (corrente, poupança, investimento). */
  assetsCents: number;
  /** Saldo devedor dos cartões (faturas abertas/fechadas). */
  liabilitiesCents: number;
}

export interface CashflowRow {
  bucket: string;
  incomeCents: number;
  expensesCents: number;
}

export interface CategoryBreakdownRow {
  categoryId: string | null;
  name: string | null;
  slug: string | null;
  icon: string | null;
  color: string | null;
  amountCents: number;
  transactionCount: number;
}

export interface MonthlyRow {
  month: string;
  incomeCents: number;
  expensesCents: number;
}

async function numberQuery(db: Database, query: Parameters<Database["get"]>[0]): Promise<number> {
  const row = await db.get<{ value: number | null }>(query);
  return Number(row?.value ?? 0);
}

/**
 * Saldo de uma conta na data — regra única de `balanceTotals` e
 * `netWorthSeries`: último snapshot <= data ou
 * `saldo atual − sinal(conta) × transações posteriores à data (até hoje)`.
 * `direction` é -1 no cartão, onde `balance_cents` é dívida, e
 * `laterTransactions` deve somar `(data, hoje]` (mesmo que a data esteja no
 * passado, o que `balanceTotals` já faz).
 */
function balanceAtSql(parts: {
  accountId: SQL;
  date: SQL;
  currentBalance: SQL;
  direction: SQL;
  laterTransactions: SQL;
}): SQL {
  return sql`COALESCE(
    (SELECT bs.balance_cents
       FROM balance_snapshots bs
      WHERE bs.account_id = ${parts.accountId} AND bs.date <= ${parts.date}
      ORDER BY bs.date DESC
      LIMIT 1),
    ${parts.currentBalance} - ${parts.direction} * (${parts.laterTransactions})
  )`;
}

/** Receitas e despesas (valores positivos) de um período. */
export async function transactionTotals(
  db: Database,
  userId: string,
  period: Period,
): Promise<Totals> {
  // Regra de receita/despesa compartilhada com o resumo da lista (só
  // income/expense e só posted); o recorte de período continua aqui.
  const sums = incomeExpenseSums(sql`t.amount_cents`, sql`t.type`, sql`t.status`);
  const [row] = await db.all<{ incomeCents: number; expensesCents: number }>(sql`
    SELECT
      ${sums.incomeCents} AS incomeCents,
      ${sums.expensesCents} AS expensesCents
    FROM transactions t
    WHERE t.user_id = ${userId}
      AND t.status = 'posted'
      AND t.date BETWEEN ${period.from} AND ${period.to}
      AND t.type IN ('income', 'expense')
  `);

  return {
    incomeCents: Number(row?.incomeCents ?? 0),
    expensesCents: Number(row?.expensesCents ?? 0),
  };
}

/**
 * Saldo das contas na data, com a mesma regra de `netWorthSeries`:
 * último snapshot <= data; quando não há snapshot até a data, reconstrói
 * `saldo atual − sinal(conta) × Σ transações com data > asOf (até hoje)`.
 * A partir de hoje a soma fica vazia e vale o saldo atual da conta — o mesmo
 * número da página Contas.
 *
 * As transações entram em uma única agregação por conta (`tx`), lida uma vez.
 *
 * Em cartão de crédito, `balance_cents` é a dívida (faturas não pagas), não um
 * ativo. Por isso o cartão entra em `liabilitiesCents` e nunca em
 * `assetsCents`; o patrimônio é `assets - liabilities` (investimentos são
 * somados pelo chamador).
 */
export async function balanceTotals(
  db: Database,
  userId: string,
  asOf: string,
): Promise<BalanceTotals> {
  const today = todayIsoDate();
  const [row] = await db.all<{ assetsCents: number; liabilitiesCents: number }>(sql`
    WITH tx AS (
      SELECT t.account_id AS account_id, SUM(t.amount_cents) AS amount
        FROM transactions t
        JOIN accounts ta ON ta.id = t.account_id
       WHERE ta.user_id = ${userId}
         AND t.status = 'posted'
         AND t.date > ${asOf}
         AND t.date <= ${today}
       GROUP BY t.account_id
    ),
    account_balances AS (
      SELECT
        a.type AS type,
        ${balanceAtSql({
          accountId: sql`a.id`,
          date: sql`${asOf}`,
          currentBalance: sql`a.balance_cents`,
          direction: sql`(CASE WHEN a.type = 'credit_card' THEN -1 ELSE 1 END)`,
          laterTransactions: sql`COALESCE(tx.amount, 0)`,
        })} AS balance
      FROM accounts a
      LEFT JOIN tx ON tx.account_id = a.id
      WHERE a.user_id = ${userId}
    )
    SELECT
      COALESCE(SUM(CASE WHEN type <> 'credit_card' THEN balance ELSE 0 END), 0) AS assetsCents,
      COALESCE(SUM(CASE WHEN type = 'credit_card' THEN balance ELSE 0 END), 0) AS liabilitiesCents
    FROM account_balances
  `);

  return {
    assetsCents: Number(row?.assetsCents ?? 0),
    liabilitiesCents: Number(row?.liabilitiesCents ?? 0),
  };
}

/** Soma das posições de investimento (valor atual, sem histórico). */
export async function investmentsTotal(db: Database, userId: string): Promise<number> {
  return numberQuery(
    db,
    sql`SELECT COALESCE(SUM(i.balance_cents), 0) AS value FROM investments i WHERE i.user_id = ${userId}`,
  );
}

function bucketExpression(granularity: Granularity) {
  if (granularity === "week") {
    // Segunda-feira da semana (strftime %w: domingo = 0).
    return sql`date(t.date, '-' || ((CAST(strftime('%w', t.date) AS INTEGER) + 6) % 7) || ' days')`;
  }
  if (granularity === "month") {
    return sql`substr(t.date, 1, 7) || '-01'`;
  }
  return sql`t.date`;
}

/** Fluxo de caixa agrupado por dia/semana/mês, sem transfers. */
export async function cashflowBuckets(
  db: Database,
  userId: string,
  period: Period,
  granularity: Granularity,
): Promise<CashflowRow[]> {
  const bucket = bucketExpression(granularity);
  const sums = incomeExpenseSums(sql`t.amount_cents`, sql`t.type`, sql`t.status`);
  const rows = await db.all<{ bucket: string; incomeCents: number; expensesCents: number }>(sql`
    SELECT
      ${bucket} AS bucket,
      ${sums.incomeCents} AS incomeCents,
      ${sums.expensesCents} AS expensesCents
    FROM transactions t
    WHERE t.user_id = ${userId}
      AND t.status = 'posted'
      AND t.date BETWEEN ${period.from} AND ${period.to}
      AND t.type IN ('income', 'expense')
    GROUP BY bucket
    ORDER BY bucket
  `);

  return rows.map((row) => ({
    bucket: row.bucket,
    incomeCents: Number(row.incomeCents),
    expensesCents: Number(row.expensesCents),
  }));
}

/** Ranking de categorias; transações sem categoria entram em "sem-categoria". */
export async function categoryBreakdown(
  db: Database,
  userId: string,
  period: Period,
  type: "expense" | "income",
): Promise<CategoryBreakdownRow[]> {
  const rows = await db.all<{
    categoryId: string | null;
    name: string | null;
    slug: string | null;
    icon: string | null;
    color: string | null;
    amountCents: number;
    transactionCount: number;
  }>(sql`
    SELECT
      t.category_id AS categoryId,
      c.name AS name,
      c.slug AS slug,
      c.icon AS icon,
      c.color AS color,
      COALESCE(SUM(CASE WHEN ${type} = 'expense' THEN -t.amount_cents ELSE t.amount_cents END), 0) AS amountCents,
      COUNT(*) AS transactionCount
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ${userId}
      AND t.status = 'posted'
      AND t.date BETWEEN ${period.from} AND ${period.to}
      AND t.type = ${type}
    GROUP BY t.category_id, c.name, c.slug, c.icon, c.color
    ORDER BY amountCents DESC
  `);

  return rows.map((row) => ({
    ...row,
    amountCents: Number(row.amountCents),
    transactionCount: Number(row.transactionCount),
  }));
}

/** Série mensal (YYYY-MM) de receitas x despesas. */
export async function monthlyTotals(
  db: Database,
  userId: string,
  fromMonthStart: string,
  until: string,
): Promise<MonthlyRow[]> {
  const sums = incomeExpenseSums(sql`t.amount_cents`, sql`t.type`, sql`t.status`);
  const rows = await db.all<{
    month: string;
    incomeCents: number;
    expensesCents: number;
  }>(sql`
    SELECT
      substr(t.date, 1, 7) AS month,
      ${sums.incomeCents} AS incomeCents,
      ${sums.expensesCents} AS expensesCents
    FROM transactions t
    WHERE t.user_id = ${userId}
      AND t.status = 'posted'
      AND t.date >= ${fromMonthStart}
      AND t.date <= ${until}
      AND t.type IN ('income', 'expense')
    GROUP BY month
    ORDER BY month
  `);

  return rows.map((row) => ({
    month: row.month,
    incomeCents: Number(row.incomeCents),
    expensesCents: Number(row.expensesCents),
  }));
}

/**
 * Série patrimonial diária em **uma** consulta (CTE recursiva de datas).
 * `from` é limitado a 366 dias para caber no orçamento de CPU do Free.
 *
 * Por conta e por dia:
 * - dias cobertos por snapshot usam o último snapshot <= dia (o histórico já
 *   gravado não é reconstruído de novo);
 * - os dias sem snapshot até a data são reconstruídos pelos lançamentos:
 *   `saldo(D) = saldo atual − sinal(conta) × Σ transações com data > D` (até
 *   hoje). No cartão `balance_cents` é dívida, então o sinal inverte (compra
 *   negativa aumenta a dívida), como no histórico do sync. Em D = hoje a soma
 *   fica vazia e vale o saldo atual da conta (o número da página Contas).
 *
 * Custo: as datas geradas ficam limitadas a `period.to` (o clamp de 366 dias
 * continua valendo) e as transações são agregadas uma única vez por
 * `(conta, dia)`, com a soma "posterior ao dia" saindo de uma janela
 * acumulada. Quando `to` está no passado, as transações de `(to, hoje]` entram
 * numa CTE `tail` própria, sem expandir dias: o custo cresce com os dias da
 * janela, não com `hoje − from`.
 *
 * Em `to` no passado ("Mês passado", personalizado) o `tail` é o que garante a
 * mesma conta de `balanceTotals` (`Σ` de `(D, hoje]`). Investimentos não têm
 * histórico e entram constantes em todos os pontos.
 */
export async function netWorthSeries(
  db: Database,
  userId: string,
  period: Period,
): Promise<Array<{ date: string; assetsCents: number; liabilitiesCents: number }>> {
  const today = todayIsoDate();
  // `tail` só existe quando a janela termina no passado: para `to >= hoje` a
  // soma de `(to, hoje]` é vazia e não vale pagar a agregação.
  const needsTail = period.to < today;
  const tailCte = needsTail
    ? sql`, tail AS (
        SELECT t.account_id AS account_id, SUM(t.amount_cents) AS amount
          FROM transactions t
          JOIN accounts ta ON ta.id = t.account_id
         WHERE ta.user_id = ${userId}
           AND t.status = 'posted'
           AND t.date > ${period.to}
           AND t.date <= ${today}
         GROUP BY t.account_id
      )`
    : sql``;
  const tailJoin = needsTail ? sql`LEFT JOIN tail ON tail.account_id = a.id` : sql``;
  const tailAmount = needsTail ? sql`COALESCE(tail.amount, 0)` : sql`0`;
  const tailGroupBy = needsTail ? sql`, tail.amount` : sql``;
  const rows = await db.all<{ date: string; assetsCents: number; liabilitiesCents: number }>(sql`
    WITH RECURSIVE dates(d) AS (
      SELECT ${period.from}
      UNION ALL
      SELECT date(d, '+1 day') FROM dates WHERE d < ${period.to}
    )${tailCte},
    step AS (
      SELECT
        dates.d AS date,
        a.id AS account_id,
        a.type AS type,
        a.balance_cents AS balance,
        COALESCE(SUM(t.amount_cents), 0) AS amount,
        ${tailAmount} AS tail_amount
      FROM dates
      CROSS JOIN accounts a
      ${tailJoin}
      LEFT JOIN transactions t
        ON t.account_id = a.id
       AND t.status = 'posted'
       AND t.date = dates.d
       AND dates.d <= ${today}
      WHERE a.user_id = ${userId}
      GROUP BY dates.d, a.id${tailGroupBy}
    ),
    series AS (
      SELECT
        date,
        account_id,
        type,
        balance,
        tail_amount,
        SUM(amount) OVER (
          PARTITION BY account_id
          ORDER BY date
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS paid_through,
        SUM(amount) OVER (PARTITION BY account_id) AS period_total
      FROM step
    ),
    valued AS (
      SELECT
        date,
        type,
        ${balanceAtSql({
          accountId: sql`series.account_id`,
          date: sql`series.date`,
          currentBalance: sql`balance`,
          direction: sql`(CASE WHEN type = 'credit_card' THEN -1 ELSE 1 END)`,
          laterTransactions: sql`(period_total - paid_through) + tail_amount`,
        })} AS balance
      FROM series
    )
    SELECT
      date,
      COALESCE(SUM(CASE WHEN type <> 'credit_card' THEN balance ELSE 0 END), 0) AS assetsCents,
      COALESCE(SUM(CASE WHEN type = 'credit_card' THEN balance ELSE 0 END), 0) AS liabilitiesCents
    FROM valued
    GROUP BY date
    ORDER BY date
  `);

  const investments = await investmentsTotal(db, userId);
  return rows.map((row) => ({
    date: row.date,
    assetsCents: Number(row.assetsCents) + investments,
    liabilitiesCents: Number(row.liabilitiesCents),
  }));
}
