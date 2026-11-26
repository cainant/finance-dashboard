import { z } from "zod";

import {
  amountCentsSchema,
  currencySchema,
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
} from "../common";
import { transactionStatusSchema, transactionTypeSchema } from "../enums";

import { accountSummarySchema } from "./account";
import { categorySchema } from "./category";

/**
 * Transação normalizada. `amountCents` positivo = entrada (receita),
 * negativo = saída (despesa). `type` é derivado do sinal, exceto
 * transferências entre contas da mesma pessoa (marcadas como `transfer`).
 */
export const transactionSchema = z.object({
  id: idSchema,
  userId: idSchema,
  accountId: idSchema,
  connectionId: idSchema,
  externalId: z.string().min(1),
  date: isoDateSchema,
  description: z.string().min(1),
  amountCents: amountCentsSchema,
  currency: currencySchema,
  type: transactionTypeSchema,
  categoryId: idSchema.nullable(),
  status: transactionStatusSchema,
  billId: idSchema.nullable(),
  merchant: z.string().nullable(),
  notes: z.string().nullable(),
  /** Parcela no cartão (`3` de `10`); `null` à vista ou quando o provider não informa. */
  installmentNumber: z.number().int().positive().nullable(),
  totalInstallments: z.number().int().positive().nullable(),
  /**
   * Exceção manual do grupo de metas. `null` = vale o grupo da categoria
   * (`Budget.categoryGroups`).
   */
  budgetGroupId: idSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  /** Conveniência de leitura; pode ser omitido quando não houver join. */
  category: categorySchema.nullable().optional(),
  account: accountSummarySchema.nullable().optional(),
});
export type Transaction = z.infer<typeof transactionSchema>;
