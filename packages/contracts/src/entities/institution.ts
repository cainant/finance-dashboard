import { z } from "zod";

import { idSchema } from "../common";
import { providerIdSchema } from "../enums";

/** Instituição financeira (banco, cooperativa, emissor de cartão). */
export const institutionSchema = z.object({
  id: idSchema,
  provider: providerIdSchema,
  externalId: z.string().min(1),
  name: z.string().min(1),
  logoUrl: z.url().nullable(),
  /** Cor primária enviada pela instituição; pode vir sem `#` (ex.: `ef294b`). */
  primaryColor: z.string().min(1).nullable(),
  /** Tipo bruto da instituição (ex.: `PERSONAL_BANK`). */
  type: z.string().nullable(),
});
export type Institution = z.infer<typeof institutionSchema>;
