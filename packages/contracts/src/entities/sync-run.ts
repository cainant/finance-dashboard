import { z } from "zod";

import { idSchema, isoDateTimeSchema } from "../common";
import { syncRunStatusSchema } from "../enums";

/** Contadores de uma execução de sync (persistidos em `stats_json`). */
export const syncRunStatsSchema = z.object({
  accounts: z.number().int().nonnegative().optional(),
  transactions: z.number().int().nonnegative().optional(),
  bills: z.number().int().nonnegative().optional(),
  investments: z.number().int().nonnegative().optional(),
  balanceSnapshots: z.number().int().nonnegative().optional(),
});
export type SyncRunStats = z.infer<typeof syncRunStatsSchema>;

/** Registro de sincronização de uma conexão. */
export const syncRunSchema = z.object({
  id: idSchema,
  connectionId: idSchema,
  startedAt: isoDateTimeSchema,
  finishedAt: isoDateTimeSchema.nullable(),
  status: syncRunStatusSchema,
  errorCode: z.string().nullable(),
  /** Mensagem sem dados financeiros/pessoais (nunca inclui payload do provider). */
  errorMessage: z.string().nullable(),
  stats: syncRunStatsSchema.nullable(),
});
export type SyncRun = z.infer<typeof syncRunSchema>;
