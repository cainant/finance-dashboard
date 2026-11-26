import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";

// Binding de teste definido em vitest.config.ts (readD1Migrations no Node).
const migrations = (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS;

// Cada arquivo de teste roda em storage isolado; aplica as migrations reais.
await applyD1Migrations(env.DB, migrations);
