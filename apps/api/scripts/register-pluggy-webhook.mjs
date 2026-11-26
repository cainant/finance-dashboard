#!/usr/bin/env node
/**
 * Registra (ou atualiza) o webhook GLOBAL do Pluggy para o Lumen Finance.
 *
 * Por que global: o webhook criado em `POST /webhooks` assina todos os itens da
 * aplicação e aceita `headers` customizados (o `webhookUrl` de um Item/Connect
 * Token não envia headers). O endpoint do app valida `x-webhook-secret` e
 * confere `clientId`; a Pluggy não assina webhooks com HMAC.
 *
 * Uso (PowerShell/bash, a partir de `apps/api`):
 *   node --env-file=.dev.vars scripts/register-pluggy-webhook.mjs
 *
 * Variáveis:
 *   PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_WEBHOOK_SECRET  (obrigatórias)
 *   PLUGGY_WEBHOOK_URL  URL completa do endpoint (ex.: https://app/api/webhooks/pluggy)
 *   APP_URL             alternativa: origem do app (ex.: https://seu-dominio.exemplo)
 *   PLUGGY_BASE_URL     default https://api.pluggy.ai
 *
 * Idempotente: lista os webhooks, procura a mesma URL e faz PATCH; se não
 * existir, cria com POST. Nunca imprime clientSecret, apiKey ou webhook secret.
 */
const baseUrl = (process.env.PLUGGY_BASE_URL?.trim() || "https://api.pluggy.ai").replace(
  /\/+$/,
  "",
);
const clientId = process.env.PLUGGY_CLIENT_ID?.trim();
const clientSecret = process.env.PLUGGY_CLIENT_SECRET?.trim();
const webhookSecret = process.env.PLUGGY_WEBHOOK_SECRET?.trim();

function webhookUrlFromEnv() {
  const direct = process.env.PLUGGY_WEBHOOK_URL?.trim();
  if (direct) return direct;

  const appUrl = (process.env.APP_URL?.trim() || process.env.WEB_URL?.trim() || "").replace(
    /\/+$/,
    "",
  );
  if (appUrl) return `${appUrl}/api/webhooks/pluggy`;

  return null;
}

function fail(message) {
  console.error(`[pluggy-webhook] ${message}`);
  process.exit(1);
}

const webhookUrl = webhookUrlFromEnv();
if (!clientId || !clientSecret || !webhookSecret) {
  fail(
    "defina PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET e PLUGGY_WEBHOOK_SECRET (use --env-file=.dev.vars em dev).",
  );
}
if (!webhookUrl) {
  fail("defina PLUGGY_WEBHOOK_URL ou APP_URL (ex.: APP_URL=https://seu-dominio.exemplo).");
}

let parsedUrl;
try {
  parsedUrl = new URL(webhookUrl);
} catch {
  fail("PLUGGY_WEBHOOK_URL/APP_URL não formam uma URL válida.");
}
if (parsedUrl.protocol !== "https:") {
  fail("o webhook precisa de HTTPS; a Pluggy não aceita HTTP nem localhost.");
}

const normalizedUrl = parsedUrl.toString();

async function api(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const detail =
      (typeof body?.codeDescription === "string" && body.codeDescription) ||
      (typeof body?.message === "string" && body.message) ||
      `HTTP ${response.status}`;
    const error = new Error(`${init.method ?? "GET"} ${path} falhou: ${detail}`);
    error.status = response.status;
    throw error;
  }

  return body;
}

async function main() {
  const auth = await api("/auth", {
    method: "POST",
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!auth || typeof auth.apiKey !== "string" || auth.apiKey.length === 0) {
    fail("POST /auth não devolveu apiKey.");
  }

  const apiKey = auth.apiKey;
  const headers = { "x-api-key": apiKey };
  const page = await api("/webhooks?page=1&pageSize=500", { headers });
  const webhooks = Array.isArray(page) ? page : (page?.results ?? []);
  const existing = webhooks.find(
    (webhook) =>
      typeof webhook?.url === "string" && normalize(webhook.url) === normalize(normalizedUrl),
  );

  const payload = {
    url: normalizedUrl,
    event: "all",
    headers: { "X-Webhook-Secret": webhookSecret },
  };

  if (existing?.id) {
    try {
      await api(`/webhooks/${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      });
      console.log(
        JSON.stringify({
          action: "updated",
          id: existing.id,
          url: normalizedUrl,
          event: "all",
          header: "X-Webhook-Secret",
        }),
      );
      return;
    } catch (error) {
      // Webhook removido entre o GET e o PATCH: cai para criação.
      if (error?.status !== 404) throw error;
    }
  }

  const created = await api("/webhooks", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  console.log(
    JSON.stringify({
      action: "created",
      id: created?.id ?? null,
      url: normalizedUrl,
      event: "all",
      header: "X-Webhook-Secret",
    }),
  );
}

function normalize(value) {
  return value.trim().replace(/\/+$/, "");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : "falha inesperada");
});
