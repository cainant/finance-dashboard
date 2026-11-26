import { z } from "zod";

import { amountCentsSchema, currencySchema, idSchema, isoDateTimeSchema } from "../common";
import { investmentTypeSchema, providerIdSchema } from "../enums";

import { institutionSchema } from "./institution";

/** Posição de investimento. Patrimônio usa `balanceCents` (valor líquido). */
export const investmentSchema = z.object({
  id: idSchema,
  userId: idSchema,
  connectionId: idSchema,
  externalId: z.string().min(1),
  type: investmentTypeSchema,
  name: z.string().min(1),
  balanceCents: amountCentsSchema,
  amountProfitCents: amountCentsSchema.nullable(),
  currency: currencySchema,
  updatedAt: isoDateTimeSchema,
  /** Conveniência de leitura. */
  provider: providerIdSchema.optional(),
  institution: institutionSchema.nullable().optional(),
});
export type Investment = z.infer<typeof investmentSchema>;
