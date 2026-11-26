/**
 * `GET/PUT /api/settings`.
 *
 * Colunas `settings(user_id, key, value_json)` são expostas como um objeto
 * tipado (`theme`, `locale`, `currency`). Valores corrompidos são ignorados e
 * caem no default.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  updateSettingsBody,
  type Settings,
  type SettingsResponse,
} from "@fd/contracts";
import { settings } from "@fd/database/schema";
import { eq } from "drizzle-orm";

import { currentUser } from "../auth/middleware";
import type { AppEnv } from "../env";
import { jsonBody } from "../http/validate";

export const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.get("/", async (c) => {
  const body: SettingsResponse = { data: await loadSettings(c) };
  return c.json(body);
});

settingsRoutes.put("/", jsonBody(updateSettingsBody), async (c) => {
  const user = currentUser(c);
  const changes = c.req.valid("json");

  // `settingsSchema` tem no máximo 3 chaves: um único batch D1 (que conta como
  // uma query no Free) em vez de 1–3 escritas sequenciais.
  const statements = Object.entries(changes).map(([key, value]) =>
    c.env.DB.prepare(
      "INSERT INTO settings (user_id, key, value_json) VALUES (?, ?, ?) " +
        "ON CONFLICT(user_id, key) DO UPDATE SET value_json = excluded.value_json",
    ).bind(user.id, key, JSON.stringify(value)),
  );
  if (statements.length > 0) await c.env.DB.batch(statements);

  const body: SettingsResponse = { data: await loadSettings(c) };
  return c.json(body);
});

async function loadSettings(c: Context<AppEnv>): Promise<Settings> {
  const user = currentUser(c);
  const rows = await c.get("db").select().from(settings).where(eq(settings.userId, user.id));

  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    try {
      merged[row.key] = JSON.parse(row.valueJson) as unknown;
    } catch {
      // Ignora JSON inválido; o default permanece.
    }
  }

  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}
