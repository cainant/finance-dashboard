import { z } from "zod";

import { amountCentsSchema, currencySchema, idSchema, isoDateTimeSchema } from "../common";
import { accountTypeSchema, providerIdSchema } from "../enums";

/** Conta bancária ou cartão de crédito sincronizado. */
export const accountSchema = z.object({
  id: idSchema,
  userId: idSchema,
  connectionId: idSchema,
  externalId: z.string().min(1),
  type: accountTypeSchema,
  /** Subtipo bruto do provider (ex.: `CHECKING_ACCOUNT`, `CREDIT_CARD`). */
  subtype: z.string().nullable(),
  name: z.string().min(1),
  numberMasked: z.string().nullable(),
  currency: currencySchema,
  /**
   * Em conta bancária: saldo disponível. Em cartão: valor da fatura aberta
   * (positivo = dívida).
   */
  balanceCents: amountCentsSchema,
  availableCents: amountCentsSchema.nullable(),
  updatedAt: isoDateTimeSchema,
  /** Conveniência de leitura (provider vem da conexão). */
  provider: providerIdSchema.optional(),
  /**
   * Instituição da conta quando difere da conexão (ex.: item MeuPluggy com
   * contas de bancos diferentes). `null`/ausente usa a instituição da conexão.
   */
  institutionName: z.string().nullable().optional(),
});
export type Account = z.infer<typeof accountSchema>;

/**
 * Resumo de conta usado em listas agregadas (cartões, faturas). Inclui o
 * provider e a instituição para permitir o badge "Demonstração" na UI.
 */
export const accountSummarySchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  numberMasked: z.string().nullable(),
  currency: currencySchema,
  balanceCents: amountCentsSchema,
  availableCents: amountCentsSchema.nullable(),
  provider: providerIdSchema,
  institutionName: z.string().nullable(),
  institutionLogoUrl: z.url().nullable(),
});
export type AccountSummary = z.infer<typeof accountSummarySchema>;
