import { z } from "zod";

import { idSchema, isoDateTimeSchema } from "../common";

/**
 * Usuário exposto pela API. Nunca inclui `password_hash`: o hash só existe no
 * banco e é lido pelo serviço de auth.
 */
export const userSchema = z.object({
  id: idSchema,
  email: z.email(),
  name: z.string().min(1).max(120),
  githubLogin: z.string().min(1).nullable(),
  avatarUrl: z.url().nullable(),
  createdAt: isoDateTimeSchema,
});
export type User = z.infer<typeof userSchema>;
