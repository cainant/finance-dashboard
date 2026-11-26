import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/**
 * Migrations reais do D1 aplicadas no setup de cada arquivo de teste
 * (workerd + D1 local). Lidas no Node e passadas como binding.
 */
const migrations = await readD1Migrations("../../packages/database/migrations");

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          // Valores fake: nenhuma chamada real ao GitHub/Pluggy nos testes.
          GITHUB_CLIENT_ID: "test-client-id",
          GITHUB_CLIENT_SECRET: "test-client-secret",
          ALLOWED_GITHUB_LOGINS: "cainan,octocat",
          PLUGGY_WEBHOOK_SECRET: "test-webhook-secret",
          ENABLE_PASSWORD_LOGIN: "true",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
