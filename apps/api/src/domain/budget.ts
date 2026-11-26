/**
 * Metas por grupo: leitura, grupos padrão e regras de escrita.
 *
 * A renda de referência mora em `settings` (chave `BUDGET_INCOME_SETTING_KEY`);
 * grupos em `budget_groups` e o vínculo categoria → grupo em
 * `budget_category_groups`. Ver `docs/decisions/2026-11-17-metas-por-grupo.md`.
 */
import {
  BUDGET_TOTAL_BPS,
  monthBounds,
  type Budget,
  type BudgetGroupInput,
  type BudgetProgress,
  type IsoMonth,
} from "@fd/contracts";
import type { Database } from "@fd/database";
import { budgetCategoryGroups, budgetGroups, settings } from "@fd/database/schema";
import { and, asc, eq } from "drizzle-orm";

export const BUDGET_INCOME_SETTING_KEY = "budgetReferenceIncomeCents";

interface DefaultGroup {
  slug: string;
  name: string;
  color: string;
  targetBps: number;
  /** Categorias de sistema (`categories.id`) que caem no grupo por padrão. */
  categoryIds: readonly string[];
}

/**
 * Grupos criados no primeiro acesso. "Liberdade Financeira" e "Metas" não têm
 * categoria de despesa: representam dinheiro guardado/investido.
 */
export const DEFAULT_BUDGET_GROUPS: readonly DefaultGroup[] = [
  {
    slug: "liberdade-financeira",
    name: "Liberdade Financeira",
    color: "#6d5bd0",
    targetBps: 2500,
    categoryIds: [],
  },
  {
    slug: "custos-fixos",
    name: "Custos Fixos",
    color: "#0a84ff",
    targetBps: 3000,
    categoryIds: [
      "cat_moradia",
      "cat_contas-e-servicos",
      "cat_mercado",
      "cat_transporte",
      "cat_saude",
      "cat_impostos-e-taxas",
    ],
  },
  {
    slug: "conforto",
    name: "Conforto",
    color: "#ff66b2",
    targetBps: 1500,
    categoryIds: ["cat_compras", "cat_assinaturas", "cat_pets"],
  },
  { slug: "metas", name: "Metas", color: "#8e1a8e", targetBps: 1500, categoryIds: [] },
  {
    slug: "prazeres",
    name: "Prazeres",
    color: "#ff7a00",
    targetBps: 1500,
    categoryIds: ["cat_restaurantes", "cat_lazer", "cat_viagem"],
  },
  {
    slug: "conhecimento",
    name: "Conhecimento",
    color: "#facc15",
    targetBps: 0,
    categoryIds: ["cat_educacao"],
  },
];

/** Id determinístico do grupo padrão: dois GETs simultâneos não duplicam grupos. */
export function defaultGroupId(userId: string, slug: string): string {
  return `${userId}:${slug}`;
}

/**
 * Cria os grupos padrão quando o usuário ainda não tem nenhum. `PUT /api/budget`
 * exige ao menos um grupo, então "zero grupos" só acontece antes do primeiro uso.
 */
export async function ensureDefaultBudgetGroups(
  d1: D1Database,
  db: Database,
  userId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: budgetGroups.id })
    .from(budgetGroups)
    .where(eq(budgetGroups.userId, userId))
    .limit(1);
  if (existing) return;

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  DEFAULT_BUDGET_GROUPS.forEach((group, position) => {
    const id = defaultGroupId(userId, group.slug);
    statements.push(
      d1
        .prepare(
          "INSERT OR IGNORE INTO budget_groups " +
            "(id, user_id, name, color, target_bps, position, created_at, updated_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id, userId, group.name, group.color, group.targetBps, position, now, now),
    );
    if (group.categoryIds.length === 0) return;
    // SELECT em vez de VALUES: categoria de sistema ausente (banco de teste) não
    // quebra a FK; OR IGNORE preserva um vínculo que o usuário já tenha.
    const placeholders = group.categoryIds.map(() => "?").join(", ");
    statements.push(
      d1
        .prepare(
          "INSERT OR IGNORE INTO budget_category_groups (user_id, category_id, group_id) " +
            `SELECT ?, id, ? FROM categories WHERE user_id IS NULL AND id IN (${placeholders})`,
        )
        .bind(userId, id, ...group.categoryIds),
    );
  });
  await d1.batch(statements);
}

export async function loadBudget(d1: D1Database, db: Database, userId: string): Promise<Budget> {
  await ensureDefaultBudgetGroups(d1, db, userId);

  const [groupRows, mappingRows, incomeRows] = await Promise.all([
    db
      .select()
      .from(budgetGroups)
      .where(eq(budgetGroups.userId, userId))
      .orderBy(asc(budgetGroups.position), asc(budgetGroups.createdAt)),
    db
      .select({
        categoryId: budgetCategoryGroups.categoryId,
        groupId: budgetCategoryGroups.groupId,
      })
      .from(budgetCategoryGroups)
      .where(eq(budgetCategoryGroups.userId, userId)),
    db
      .select({ valueJson: settings.valueJson })
      .from(settings)
      .where(and(eq(settings.userId, userId), eq(settings.key, BUDGET_INCOME_SETTING_KEY)))
      .limit(1),
  ]);

  return {
    referenceIncomeCents: parseIncome(incomeRows[0]?.valueJson),
    groups: groupRows.map((row, index) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      targetBps: row.targetBps,
      position: index,
    })),
    categoryGroups: mappingRows,
  };
}

function parseIncome(valueJson: string | undefined): number | null {
  if (valueJson === undefined) return null;
  try {
    const value: unknown = JSON.parse(valueJson);
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Statements que substituem a lista de grupos: atualiza os existentes, cria os
 * novos e remove os ausentes (o CASCADE/SET NULL limpa vínculos e exceções).
 * `existingIds` são os ids atuais do usuário; id desconhecido é erro do chamador.
 */
export function replaceGroupsStatements(
  d1: D1Database,
  userId: string,
  input: readonly BudgetGroupInput[],
  existingIds: ReadonlySet<string>,
  now: string,
): D1PreparedStatement[] {
  const keptIds = new Set<string>();
  const statements: D1PreparedStatement[] = [];

  input.forEach((group, position) => {
    if (group.id !== undefined) {
      keptIds.add(group.id);
      statements.push(
        d1
          .prepare(
            "UPDATE budget_groups SET name = ?, color = ?, target_bps = ?, position = ?, " +
              "updated_at = ? WHERE id = ? AND user_id = ?",
          )
          .bind(group.name, group.color, group.targetBps, position, now, group.id, userId),
      );
      return;
    }
    statements.push(
      d1
        .prepare(
          "INSERT INTO budget_groups " +
            "(id, user_id, name, color, target_bps, position, created_at, updated_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          crypto.randomUUID(),
          userId,
          group.name,
          group.color,
          group.targetBps,
          position,
          now,
          now,
        ),
    );
  });

  for (const id of existingIds) {
    if (keptIds.has(id)) continue;
    statements.push(
      d1.prepare("DELETE FROM budget_groups WHERE id = ? AND user_id = ?").bind(id, userId),
    );
  }
  return statements;
}

export function incomeStatement(
  d1: D1Database,
  userId: string,
  referenceIncomeCents: number | null,
): D1PreparedStatement {
  if (referenceIncomeCents === null) {
    return d1
      .prepare("DELETE FROM settings WHERE user_id = ? AND key = ?")
      .bind(userId, BUDGET_INCOME_SETTING_KEY);
  }
  return d1
    .prepare(
      "INSERT INTO settings (user_id, key, value_json) VALUES (?, ?, ?) " +
        "ON CONFLICT(user_id, key) DO UPDATE SET value_json = excluded.value_json",
    )
    .bind(userId, BUDGET_INCOME_SETTING_KEY, JSON.stringify(referenceIncomeCents));
}

interface ProgressRow {
  group_id: string | null;
  spent_cents: number;
  transaction_count: number;
}

/**
 * Realizado × meta de um mês, numa agregação SQL. Grupo efetivo =
 * `transactions.budget_group_id ?? budget_category_groups.group_id`. Entram
 * saídas de despesa (efetivadas e pendentes: o orçamento quer o gasto já feito)
 * e transferências de saída só com grupo atribuído à mão. A data é a da
 * transação: cada parcela do cartão já vem datada no ciclo em que cai.
 */
export async function budgetProgress(
  d1: D1Database,
  db: Database,
  userId: string,
  month: IsoMonth,
): Promise<BudgetProgress> {
  const { from, to } = monthBounds(month);
  const [budget, result] = await Promise.all([
    loadBudget(d1, db, userId),
    d1
      .prepare(
        `SELECT COALESCE(t.budget_group_id, bcg.group_id) AS group_id,
                SUM(-t.amount_cents) AS spent_cents,
                COUNT(*) AS transaction_count
           FROM transactions t
           LEFT JOIN budget_category_groups bcg
             ON bcg.user_id = t.user_id AND bcg.category_id = t.category_id
          WHERE t.user_id = ?
            AND t.date >= ? AND t.date <= ?
            AND t.amount_cents < 0
            AND (t.type = 'expense' OR (t.type = 'transfer' AND t.budget_group_id IS NOT NULL))
          GROUP BY 1`,
      )
      .bind(userId, from, to)
      .all<ProgressRow>(),
  ]);

  const byGroup = new Map(result.results.map((row) => [row.group_id, row]));
  const unassigned = byGroup.get(null);
  const income = budget.referenceIncomeCents;

  return {
    month,
    from,
    to,
    referenceIncomeCents: income,
    groups: budget.groups.map((group) => {
      const row = byGroup.get(group.id);
      return {
        groupId: group.id,
        targetCents:
          income === null ? null : Math.round((income * group.targetBps) / BUDGET_TOTAL_BPS),
        spentCents: row?.spent_cents ?? 0,
        transactionCount: row?.transaction_count ?? 0,
      };
    }),
    unassigned: {
      spentCents: unassigned?.spent_cents ?? 0,
      transactionCount: unassigned?.transaction_count ?? 0,
    },
  };
}
