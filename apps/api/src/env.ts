/**
 * Tipos de ambiente e configuração da API.
 *
 * `AppEnv` é o genérico Hono usado por todas as rotas: bindings do Worker
 * (`Env`) nas `Bindings` e serviços por request nas `Variables`.
 */
import type { Database } from "@fd/database";
import {
  createProviderRegistry,
  type KeyValueCache,
  type ProviderRegistry,
} from "@fd/financial-providers";
import type { User as ApiUser } from "@fd/contracts";

/** Usuário autenticado (sem `password_hash`). */
export type AuthUser = ApiUser;

export interface AuthSession {
  /** SHA-256 (hex) do token; nunca o token em si. */
  id: string;
  expiresAt: string;
}

export interface AppVariables {
  db: Database;
  providers: ProviderRegistry;
  requestId: string;
  user?: AuthUser;
  session?: AuthSession;
}

export type AppEnv = {
  Bindings: Env;
  Variables: AppVariables;
};

function raw(env: Env, key: string): unknown {
  return (env as unknown as Record<string, unknown>)[key];
}

function bool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isProduction(env: Env): boolean {
  return text(raw(env, "APP_ENV")) === "production";
}

/** Login por senha: desabilitado por padrão em produção (PBKDF2 > 10 ms CPU). */
export function isPasswordLoginEnabled(env: Env): boolean {
  const value = raw(env, "ENABLE_PASSWORD_LOGIN");
  if (value === undefined) return !isProduction(env);
  return bool(value);
}

export function isDemoProviderEnabled(env: Env): boolean {
  const value = raw(env, "ENABLE_DEMO_PROVIDER");
  if (value === undefined) return true;
  return bool(value);
}

export interface GithubOAuthConfig {
  clientId: string;
  clientSecret: string;
}

export function githubOAuthConfig(env: Env): GithubOAuthConfig | null {
  const clientId = text(raw(env, "GITHUB_CLIENT_ID"));
  const clientSecret = text(raw(env, "GITHUB_CLIENT_SECRET"));
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Allowlist de logins do GitHub (comparação case-insensitive). */
export function allowedGithubLogins(env: Env): Set<string> {
  const value = text(raw(env, "ALLOWED_GITHUB_LOGINS"));
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((login) => login.trim().toLowerCase())
      .filter((login) => login.length > 0),
  );
}

export function pluggyCredentials(env: Env): { clientId?: string; clientSecret?: string } {
  return {
    clientId: text(raw(env, "PLUGGY_CLIENT_ID")),
    clientSecret: text(raw(env, "PLUGGY_CLIENT_SECRET")),
  };
}

export function webhookSecret(env: Env): string | null {
  return text(raw(env, "PLUGGY_WEBHOOK_SECRET")) ?? null;
}

/** Adapter de KV (cache somente leitura) com guarda para binding ausente. */
export function keyValueCache(env: Env): KeyValueCache | undefined {
  const binding = (env as unknown as { CACHE?: KVNamespace }).CACHE;
  if (!binding) return undefined;
  return {
    get: (key) => binding.get(key),
    put: (key, value, ttlSeconds) => binding.put(key, value, { expirationTtl: ttlSeconds }),
    delete: (key) => binding.delete(key),
  };
}

/** Registry de providers configurado a partir do ambiente do Worker. */
export function createProvidersFromEnv(env: Env): ProviderRegistry {
  const cache = keyValueCache(env);
  const credentials = pluggyCredentials(env);
  return createProviderRegistry(
    {
      PLUGGY_CLIENT_ID: credentials.clientId,
      PLUGGY_CLIENT_SECRET: credentials.clientSecret,
      ENABLE_DEMO_PROVIDER: isDemoProviderEnabled(env),
      CACHE: cache,
    },
    { cache },
  );
}
