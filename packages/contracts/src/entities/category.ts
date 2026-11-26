import { z } from "zod";

import { hexColorSchema, idSchema, slugSchema } from "../common";
import { categoryKindSchema } from "../enums";

/** Categoria de transação. `userId: null` = categoria de sistema. */
export const categorySchema = z.object({
  id: idSchema,
  userId: idSchema.nullable(),
  name: z.string().min(1).max(60),
  slug: slugSchema,
  /** Nome do ícone lucide (ex.: `ShoppingCart`). */
  icon: z.string().min(1).max(60),
  color: hexColorSchema,
  kind: categoryKindSchema,
  parentId: idSchema.nullable(),
});
export type Category = z.infer<typeof categorySchema>;
