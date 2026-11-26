import { z } from "zod";

import { idSchema, isoDateTimeSchema } from "../common";
import { connectionStatusSchema, providerIdSchema } from "../enums";

import { institutionSchema } from "./institution";

/** Conexão com um provider (item do Pluggy ou conexão demo). */
export const connectionSchema = z.object({
  id: idSchema,
  provider: providerIdSchema,
  externalId: z.string().min(1),
  institutionId: idSchema.nullable(),
  status: connectionStatusSchema,
  /** Diagnóstico curto e sem dados sensíveis (ex.: `PARTIAL_SUCCESS`). */
  statusDetail: z.string().nullable(),
  lastSyncedAt: isoDateTimeSchema.nullable(),
  /**
   * Quando o provider atualizou o item pela última vez (`Item.lastUpdatedAt`
   * no Pluggy). `null`/ausente quando o provider não informa.
   */
  providerUpdatedAt: isoDateTimeSchema.nullable().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  /** Conveniência de leitura: instituição da conexão, quando houver join. */
  institution: institutionSchema.nullable().optional(),
  /** Consentimento Open Finance (MeuPluggy: 1 ano); `null` quando não se aplica. */
  consentExpiresAt: isoDateTimeSchema.nullable().optional(),
});
export type Connection = z.infer<typeof connectionSchema>;
