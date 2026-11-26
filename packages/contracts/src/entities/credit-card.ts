import { z } from "zod";

import { amountCentsSchema, idSchema } from "../common";

import { accountSummarySchema } from "./account";

/**
 * Metadados de cartão de crédito (tabela `credit_cards`, PK = `accountId`).
 * O saldo/fatura aberta vem de `account.balanceCents`.
 */
export const creditCardCoreSchema = z.object({
  accountId: idSchema,
  brand: z.string().nullable(),
  level: z.string().nullable(),
  limitCents: amountCentsSchema.nullable(),
  availableLimitCents: amountCentsSchema.nullable(),
  /** Dia do mês (1-31) em que a fatura fecha. */
  closingDay: z.number().int().min(1).max(31).nullable(),
  /** Dia do mês (1-31) de vencimento. */
  dueDay: z.number().int().min(1).max(31).nullable(),
});
export type CreditCardCore = z.infer<typeof creditCardCoreSchema>;

/** DTO de `GET /api/credit-cards`: metadados + resumo da conta. */
export const creditCardSchema = creditCardCoreSchema.extend({
  account: accountSummarySchema,
});
export type CreditCard = z.infer<typeof creditCardSchema>;
