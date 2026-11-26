import { z } from "zod";

import { currencySchema } from "../common";
import { themeSchema } from "../enums";

/**
 * Settings do usuário (persistidas como linhas `user_id`/`key`/`value_json` no
 * D1 e expostas como um objeto tipado).
 */
export const settingsSchema = z.object({
  theme: themeSchema,
  locale: z.literal("pt-BR"),
  currency: currencySchema,
});
export type Settings = z.infer<typeof settingsSchema>;

/** Valores aplicados quando o usuário ainda não salvou settings. */
export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  locale: "pt-BR",
  currency: "BRL",
};
