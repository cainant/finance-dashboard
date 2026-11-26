#!/usr/bin/env node
/**
 * Executa comandos `wrangler` de produção injetando os IDs reais de D1 e KV
 * em um arquivo temporário gitignored (`.wrangler.prod.generated.jsonc`).
 *
 * Assim o `wrangler.jsonc` versionado permanece público com placeholders e o
 * deploy (CI ou local) usa os IDs configurados em env vars ou em `.env.deploy`.
 */
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLACEHOLDER_D1 = "00000000-0000-0000-0000-000000000000";
const PLACEHOLDER_KV = "00000000000000000000000000000000";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(scriptDir, "..");
const wranglerPath = path.join(apiDir, "wrangler.jsonc");
const generatedPath = path.join(apiDir, ".wrangler.prod.generated.jsonc");
const envDeployPath = path.join(apiDir, ".env.deploy");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const result = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

function stripJsonc(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += ch;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

function fail(message) {
  console.error(`[with-prod-wrangler] ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  fail("uso: node scripts/with-prod-wrangler.mjs <args do wrangler...>");
}

const fileEnv = parseEnvFile(envDeployPath);
const d1Id = (
  process.env.CLOUDFLARE_D1_DATABASE_ID ??
  fileEnv.CLOUDFLARE_D1_DATABASE_ID ??
  ""
).trim();
const kvId = (
  process.env.CLOUDFLARE_KV_NAMESPACE_ID ??
  fileEnv.CLOUDFLARE_KV_NAMESPACE_ID ??
  ""
).trim();

if (!d1Id || d1Id === PLACEHOLDER_D1) {
  fail(
    "defina CLOUDFLARE_D1_DATABASE_ID no ambiente ou em apps/api/.env.deploy (veja apps/api/.env.deploy.example).",
  );
}
if (!kvId || kvId === PLACEHOLDER_KV) {
  fail(
    "defina CLOUDFLARE_KV_NAMESPACE_ID no ambiente ou em apps/api/.env.deploy (veja apps/api/.env.deploy.example).",
  );
}

const config = JSON.parse(stripJsonc(fs.readFileSync(wranglerPath, "utf8")));
if (!config.env?.production) {
  fail("bloco env.production não encontrado em apps/api/wrangler.jsonc.");
}
if (Array.isArray(config.env.production.d1_databases) && config.env.production.d1_databases[0]) {
  config.env.production.d1_databases[0].database_id = d1Id;
}
if (Array.isArray(config.env.production.kv_namespaces) && config.env.production.kv_namespaces[0]) {
  config.env.production.kv_namespaces[0].id = kvId;
}

fs.writeFileSync(generatedPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

const cleanup = () => {
  try {
    if (fs.existsSync(generatedPath)) fs.unlinkSync(generatedPath);
  } catch {
    // best-effort cleanup
  }
};

process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

try {
  const isWin = process.platform === "win32";
  const result = cp.spawnSync(
    "pnpm",
    ["exec", "wrangler", "--config", path.basename(generatedPath), ...args],
    {
      cwd: apiDir,
      stdio: "inherit",
      shell: isWin,
      env: process.env,
    },
  );
  process.exitCode = result.status ?? 1;
} finally {
  cleanup();
}
