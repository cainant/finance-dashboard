import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

/**
 * Reaproveitar servidores já rodando só com `E2E_REUSE=1`: um wrangler antigo na porta serve
 * código velho e derruba o e2e de forma confusa. Sem a flag, porta ocupada falha na hora.
 */
const reuseServers = !isCI && process.env.E2E_REUSE === "1";

/** Estado de sessão gerado por `e2e/auth.setup.ts` (usuário demo do seed). */
const authFile = "e2e/.auth/user.json";

/** Porta da API configurável para conviver com outros worktrees na mesma máquina. */
const apiPort = process.env.E2E_API_PORT ?? "8787";
const apiUrl = `http://127.0.0.1:${apiPort}`;

/** Porta do Vite (idem: outros agentes podem estar usando 5173). */
const webPort = process.env.E2E_WEB_PORT ?? "5173";
const webUrl = `http://127.0.0.1:${webPort}`;

/**
 * No CI (ou com `E2E_PREVIEW=1`) o front é servido já empacotado por `vite preview`, em vez do
 * dev server: sem transformar centenas de módulos a cada página, o e2e gasta bem menos CPU.
 * O build usa `NODE_ENV=development` para manter `import.meta.env.DEV` (rota /dev-ui e erro
 * em resposta fora do contrato), e sai em `node_modules/.cache` para não tocar o `dist` do deploy.
 */
const usePreview = isCI || process.env.E2E_PREVIEW === "1";
const previewDir = "node_modules/.cache/e2e-web";
const vite = "pnpm --filter @fd/web exec vite";
const webCommand = usePreview
  ? `${vite} build --mode development --outDir ${previewDir} && ${vite} preview --outDir ${previewDir} --port ${webPort} --strictPort`
  : `${vite} --port ${webPort} --strictPort`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: webUrl,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: authFile },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      command: `pnpm --filter @fd/api exec wrangler dev --port ${apiPort}`,
      url: `${apiUrl}/api/health`,
      reuseExistingServer: reuseServers,
      timeout: 120_000,
    },
    {
      command: webCommand,
      url: webUrl,
      env: { API_PROXY_TARGET: apiUrl, ...(usePreview ? { NODE_ENV: "development" } : {}) },
      reuseExistingServer: reuseServers,
      timeout: 120_000,
    },
  ],
});
