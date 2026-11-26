import { z } from "zod";

import { hexColorSchema, idSchema, slugSchema } from "./common";
import { categoryKindSchema, providerIdSchema } from "./enums";
import { settingsSchema } from "./entities/settings";
import { cardPaymentModeSchema } from "./entities/card-reserve";
import { BUDGET_MAX_GROUPS, BUDGET_TOTAL_BPS, budgetGroupSchema } from "./entities/budget";

/** `POST /api/auth/login`. */
export const loginBody = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});
export type LoginBody = z.infer<typeof loginBody>;

/** `POST /api/auth/setup` (somente quando ainda não existe nenhum usuário). */
export const setupBody = z.object({
  email: z.email(),
  name: z.string().min(2).max(120),
  password: z.string().min(8, "a senha deve ter ao menos 8 caracteres").max(128),
});
export type SetupBody = z.infer<typeof setupBody>;

/** `PATCH /api/transactions/:id` — exige ao menos um campo. */
export const updateTransactionBody = z
  .object({
    /** `null` remove a categoria. */
    categoryId: idSchema.nullable().optional(),
    /** `null` limpa as notas. */
    notes: z.string().max(2000).nullable().optional(),
    /** `null` remove a exceção e volta ao grupo da categoria. */
    budgetGroupId: idSchema.nullable().optional(),
  })
  .refine(
    (value) =>
      value.categoryId !== undefined ||
      value.notes !== undefined ||
      value.budgetGroupId !== undefined,
    { message: "informe ao menos `categoryId`, `notes` ou `budgetGroupId`" },
  );
export type UpdateTransactionBody = z.infer<typeof updateTransactionBody>;

/** `POST /api/categories`. `slug` é derivado do nome quando omitido. */
export const createCategoryBody = z.object({
  name: z.string().min(1).max(60),
  slug: slugSchema.optional(),
  /** Nome do ícone lucide (ex.: `ShoppingCart`). */
  icon: z.string().min(1).max(60),
  color: hexColorSchema,
  kind: categoryKindSchema,
  parentId: idSchema.nullable().optional(),
});
export type CreateCategoryBody = z.infer<typeof createCategoryBody>;

/**
 * `POST /api/connections`.
 * - `demo`: sem campos extras.
 * - `pluggy`: exige `itemId` (item criado no widget ou cadastrado no MeuPluggy).
 */
export const createConnectionBody = z
  .object({
    provider: providerIdSchema,
    /** Pluggy: id do item (`/items/:id`). */
    itemId: idSchema.optional(),
    /** Instituição conhecida (opcional; o provider é a fonte da verdade). */
    institutionId: idSchema.optional(),
    /** Nome exibido quando o provider não informa instituição (ex.: demo). */
    institutionName: z.string().min(1).max(120).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.provider === "pluggy" && !value.itemId) {
      ctx.addIssue({
        code: "custom",
        path: ["itemId"],
        message: "`itemId` é obrigatório para conexões Pluggy/MeuPluggy",
      });
    }
  });
export type CreateConnectionBody = z.infer<typeof createConnectionBody>;

/**
 * `POST /api/providers/pluggy/connect-token`.
 *
 * `itemId` é opcional e, quando presente, cria o token para **reconectar /
 * atualizar** um item existente (o widget recebe o mesmo id em `updateItem`).
 */
export const connectTokenBody = z.object({
  itemId: idSchema.optional(),
});
export type ConnectTokenBody = z.infer<typeof connectTokenBody>;

/** `PUT /api/settings` — atualização parcial, ao menos uma chave. */
export const updateSettingsBody = settingsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "informe ao menos uma setting",
  });
export type UpdateSettingsBody = z.infer<typeof updateSettingsBody>;

/**
 * Grupo enviado em `PUT /api/budget`. Sem `id` = grupo novo; a ordem do array
 * vira `position`.
 */
export const budgetGroupInput = budgetGroupSchema
  .pick({ name: true, color: true, targetBps: true })
  .extend({ id: idSchema.optional() });
export type BudgetGroupInput = z.infer<typeof budgetGroupInput>;

/**
 * `PUT /api/budget` — atualização parcial. `groups` substitui a lista inteira:
 * grupo ausente é removido (transações e categorias dele voltam a "sem grupo").
 */
export const updateBudgetBody = z
  .object({
    referenceIncomeCents: z.number().int().min(0).max(10_000_000_000).nullable().optional(),
    groups: z.array(budgetGroupInput).min(1).max(BUDGET_MAX_GROUPS).optional(),
  })
  .refine((value) => value.referenceIncomeCents !== undefined || value.groups !== undefined, {
    message: "informe ao menos `referenceIncomeCents` ou `groups`",
  })
  .refine(
    (value) =>
      value.groups === undefined ||
      value.groups.reduce((sum, group) => sum + group.targetBps, 0) <= BUDGET_TOTAL_BPS,
    { path: ["groups"], message: "as metas somam mais de 100%" },
  )
  .refine(
    (value) => {
      const ids = (value.groups ?? []).flatMap((group) => (group.id ? [group.id] : []));
      return new Set(ids).size === ids.length;
    },
    { path: ["groups"], message: "grupo repetido" },
  );
export type UpdateBudgetBody = z.infer<typeof updateBudgetBody>;

/** `PUT /api/budget/categories/:categoryId` — `null` desvincula a categoria. */
export const updateBudgetCategoryBody = z.object({
  groupId: idSchema.nullable(),
});
export type UpdateBudgetCategoryBody = z.infer<typeof updateBudgetCategoryBody>;

/**
 * `PUT /api/credit-cards/:id/payment-plan`. No modo `reserve`, no máximo uma
 * fonte (conta ou investimento); ambas `null` = reserva ainda não escolhida.
 * Em `pay_on_due` as fontes são ignoradas e gravadas como `null`.
 */
export const updateCardPaymentPlanBody = z
  .object({
    mode: cardPaymentModeSchema,
    reserveAccountId: idSchema.nullable().optional(),
    reserveInvestmentId: idSchema.nullable().optional(),
  })
  .refine((value) => !(value.reserveAccountId && value.reserveInvestmentId), {
    message: "escolha uma conta ou um investimento como reserva, não os dois",
  });
export type UpdateCardPaymentPlanBody = z.infer<typeof updateCardPaymentPlanBody>;
