import { z } from "zod";

import { idSchema, isoDateSchema } from "../common";

/**
 * Como o usuário paga um cartão:
 * - `pay_on_due`: paga a fatura no vencimento, sem reserva;
 * - `reserve`: guarda o valor das compras numa reserva (conta ou investimento)
 *   ao longo do ciclo, e o app avisa quanto falta guardar.
 */
export const cardPaymentModes = ["pay_on_due", "reserve"] as const;
export const cardPaymentModeSchema = z.enum(cardPaymentModes);
export type CardPaymentMode = z.infer<typeof cardPaymentModeSchema>;

/** Plano de pagamento de um cartão. Sem linha salva = `pay_on_due`. */
export const cardPaymentPlanSchema = z.object({
  accountId: idSchema,
  mode: cardPaymentModeSchema,
  /** Conta (não cartão) onde o dinheiro é guardado. */
  reserveAccountId: idSchema.nullable(),
  /** Investimento (ex.: caixinha) onde o dinheiro é guardado. */
  reserveInvestmentId: idSchema.nullable(),
});
export type CardPaymentPlan = z.infer<typeof cardPaymentPlanSchema>;

export const reserveSourceKindSchema = z.enum(["account", "investment"]);
export type ReserveSourceKind = z.infer<typeof reserveSourceKindSchema>;

/** Situação de uma reserva e dos cartões que guardam nela. */
export const reserveStatusSchema = z.object({
  source: z.object({
    kind: reserveSourceKindSchema,
    id: idSchema,
    name: z.string(),
    institutionName: z.string().nullable(),
  }),
  cards: z.array(
    z.object({
      accountId: idSchema,
      name: z.string(),
      /** Faturas não pagas + fatura corrente derivada (parcelas futuras não entram). */
      neededCents: z.number().int().min(0),
    }),
  ),
  /** Soma de `cards[].neededCents`. */
  neededCents: z.number().int().min(0),
  /** Saldo atual da reserva. */
  reservedCents: z.number().int(),
  /** Quanto falta guardar (`max(0, needed − reserved)`). */
  gapCents: z.number().int().min(0),
  /** Data da última entrada na conta reserva; `null` em investimento ou sem entradas. */
  lastDepositDate: isoDateSchema.nullable(),
  /** Compras líquidas nos cartões desta reserva depois do último depósito. */
  spentSinceDepositCents: z.number().int().nullable(),
});
export type ReserveStatus = z.infer<typeof reserveStatusSchema>;

/** `GET /api/card-reserves`. */
export const cardReservesSchema = z.object({
  plans: z.array(cardPaymentPlanSchema),
  reserves: z.array(reserveStatusSchema),
  /** Cartões em modo `reserve` ainda sem reserva escolhida. */
  unconfiguredCardIds: z.array(idSchema),
});
export type CardReserves = z.infer<typeof cardReservesSchema>;
