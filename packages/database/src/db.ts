/**
 * Conexão Drizzle com o binding D1 do Cloudflare Workers.
 *
 * Uso na API: `createDb(env.DB)`. O schema é tipado com as tabelas de
 * `./schema`, então `db.select().from(users)` etc. são type-safe.
 */
import { drizzle } from "drizzle-orm/d1";

import { schema } from "./schema";

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
