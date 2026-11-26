import { z } from "zod";

import { amountCentsSchema, idSchema, isoDateSchema } from "../common";
import { billStatusSchema } from "../enums";

/** Fatura de cartão de crédito. `status` é derivado de datas e pagamentos. */
export const billSchema = z.object({
  id: idSchema,
  accountId: idSchema,
  externalId: z.string().min(1),
  dueDate: isoDateSchema,
  closingDate: isoDateSchema.nullable(),
  totalCents: amountCentsSchema,
  minimumPaymentCents: amountCentsSchema.nullable(),
  status: billStatusSchema,
});
export type Bill = z.infer<typeof billSchema>;

/** Fatura futura/aberta para o card de vencimentos. */
export const upcomingBillSchema = billSchema.extend({
  accountName: z.string().min(1),
  creditCardBrand: z.string().nullable(),
  /** Dias até o vencimento; negativo quando já venceu. */
  daysUntilDue: z.number().int(),
  /**
   * `true` quando a fatura é **derivada** dos lançamentos do cartão em vez de
   * sincronizada do provider (valor parcial, ainda recebendo compras).
   */
  estimated: z.boolean(),
});
export type UpcomingBill = z.infer<typeof upcomingBillSchema>;
