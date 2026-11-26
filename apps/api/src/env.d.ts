/**
 * Secrets e bindings opcionais (não aparecem no `wrangler.jsonc` porque secrets
 * não são versionados). Complementam o `Env` gerado em worker-configuration.d.ts.
 */
interface Env {
  PLUGGY_CLIENT_ID?: string;
  PLUGGY_CLIENT_SECRET?: string;
  PLUGGY_WEBHOOK_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  ALLOWED_GITHUB_LOGINS?: string;
  /** Não usado na v1 (sem Queues no plano Free); ver wrangler.jsonc. */
  SYNC_QUEUE?: Queue;
}
