import { z } from "zod";

import { hexColorSchema, idSchema } from "../common";

/** 100% em pontos-base: metas somam no máximo isto. */
export const BUDGET_TOTAL_BPS = 10_000;

/** Percentual em pontos-base (`2500` = 25%), de 0 a 100%. */
export const budgetBpsSchema = z.number().int().min(0).max(BUDGET_TOTAL_BPS);
export type BudgetBps = z.infer<typeof budgetBpsSchema>;

/** Máximo de grupos por usuário (a tela de metas é uma lista, não uma tabela). */
export const BUDGET_MAX_GROUPS = 12;

/**
 * Grupo de metas (ex.: "Custos Fixos"). A meta é um percentual da renda de
 * referência; o valor em R$ é derivado (`targetBps × renda / 10.000`).
 */
export const budgetGroupSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(40),
  color: hexColorSchema,
  targetBps: budgetBpsSchema,
  /** Ordem de exibição, a partir de 0. */
  position: z.number().int().min(0),
});
export type BudgetGroup = z.infer<typeof budgetGroupSchema>;

/** Grupo padrão de uma categoria (transações da categoria caem nele). */
export const budgetCategoryGroupSchema = z.object({
  categoryId: idSchema,
  groupId: idSchema,
});
export type BudgetCategoryGroup = z.infer<typeof budgetCategoryGroupSchema>;

/**
 * Configuração de metas do usuário. `referenceIncomeCents` é só a base de
 * planejamento: não representa receita real nem cria lançamento.
 */
export const budgetSchema = z.object({
  referenceIncomeCents: z.number().int().min(0).nullable(),
  groups: z.array(budgetGroupSchema),
  categoryGroups: z.array(budgetCategoryGroupSchema),
});
export type Budget = z.infer<typeof budgetSchema>;

/** Mês civil `YYYY-MM`. */
export const isoMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "mês no formato YYYY-MM");
export type IsoMonth = z.infer<typeof isoMonthSchema>;

/** Primeiro e último dia (`YYYY-MM-DD`) de um mês `YYYY-MM`. */
export function monthBounds(month: IsoMonth): { from: string; to: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/** Realizado de um grupo no mês. `targetCents` é `null` sem renda de referência. */
export const budgetGroupProgressSchema = z.object({
  groupId: idSchema,
  targetCents: z.number().int().min(0).nullable(),
  /** Saídas do mês atribuídas ao grupo (positivo = gasto). */
  spentCents: z.number().int(),
  transactionCount: z.number().int().min(0),
});
export type BudgetGroupProgress = z.infer<typeof budgetGroupProgressSchema>;

/**
 * Realizado × meta de um mês. Conta despesas (efetivadas e pendentes) pela data
 * da transação — cada parcela já vem datada no ciclo em que cai — e
 * transferências de saída só quando atribuídas a um grupo à mão (ex.: aplicação
 * em "Liberdade Financeira").
 */
export const budgetProgressSchema = z.object({
  month: isoMonthSchema,
  from: z.iso.date(),
  to: z.iso.date(),
  referenceIncomeCents: z.number().int().min(0).nullable(),
  groups: z.array(budgetGroupProgressSchema),
  /** Despesas sem grupo (categoria sem vínculo e sem exceção). */
  unassigned: z.object({
    spentCents: z.number().int(),
    transactionCount: z.number().int().min(0),
  }),
});
export type BudgetProgress = z.infer<typeof budgetProgressSchema>;
