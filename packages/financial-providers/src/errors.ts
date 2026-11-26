/**
 * Erro tipado dos providers financeiros.
 *
 * Mensagens nunca carregam corpo de resposta, URL com query string, token ou
 * dado de cliente: apenas um texto curto, em pt-BR, e o código do fornecedor
 * quando ele é seguro (ex.: `ITEM_NOT_FOUND`).
 */
export const PROVIDER_ERROR_CODES = [
  "unavailable",
  "auth_failed",
  "login_required",
  "rate_limited",
  "not_found",
  "invalid_response",
] as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

const DEFAULT_RETRYABLE: Readonly<Record<ProviderErrorCode, boolean>> = {
  unavailable: true,
  auth_failed: false,
  login_required: false,
  rate_limited: true,
  not_found: false,
  invalid_response: false,
};

const FALLBACK_MESSAGE: Readonly<Record<ProviderErrorCode, string>> = {
  unavailable: "Falha temporária no provider financeiro.",
  auth_failed: "Não foi possível autenticar no provider financeiro.",
  login_required: "O login na instituição precisa ser refeito.",
  rate_limited: "Limite de requisições do provider financeiro atingido.",
  not_found: "Recurso não encontrado no provider financeiro.",
  invalid_response: "O provider financeiro retornou uma resposta inválida.",
};

export interface ProviderErrorOptions {
  /** Sobrescreve o padrão do código. */
  retryable?: boolean;
  /** Status HTTP, quando aplicável. */
  status?: number;
  /** Causa original (nunca é serializada para o cliente da API). */
  cause?: unknown;
  /** Delay indicado pelo fornecedor (ex.: `Retry-After`), em ms. */
  retryAfterMs?: number;
  /** Metadados seguros para diagnóstico. Nunca incluir payload/segredo. */
  details?: Record<string, unknown>;
}

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ProviderErrorCode, message: string, options: ProviderErrorOptions = {}) {
    super(
      sanitizeProviderMessage(message, FALLBACK_MESSAGE[code]),
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "ProviderError";
    this.code = code;
    this.retryable = options.retryable ?? DEFAULT_RETRYABLE[code];
    if (options.status !== undefined) this.status = options.status;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
    if (options.details !== undefined) this.details = options.details;
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

/**
 * Normaliza qualquer exceção em `ProviderError`, preservando um erro já
 * tipado. Abortos do chamador não são retryable.
 */
export function asProviderError(
  error: unknown,
  fallbackCode: ProviderErrorCode = "unavailable",
): ProviderError {
  if (isProviderError(error)) return error;

  if (isAbortError(error)) {
    return new ProviderError("unavailable", "Requisição cancelada.", {
      retryable: false,
      cause: error,
    });
  }

  return new ProviderError(fallbackCode, FALLBACK_MESSAGE[fallbackCode], { cause: error });
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/**
 * Mapeia status HTTP da API do fornecedor para o code do domínio.
 * 401/403 viram `auth_failed`; 400/405/406/409/422 são resposta inválida;
 * 404 é `not_found`; 429 é `rate_limited`; 5xx é `unavailable`.
 */
export function providerErrorFromStatus(status: number, message?: string): ProviderError {
  const code = statusToCode(status);
  const retryable = status === 429 || status >= 500;
  return new ProviderError(code, message ?? FALLBACK_MESSAGE[code], { status, retryable });
}

function statusToCode(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "auth_failed";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "invalid_response";
}

const MAX_MESSAGE_LENGTH = 240;

/**
 * Remove caracteres de controle, credenciais óbvias e limita o tamanho. Não é
 * um sanitizador de dados pessoais: os chamadores não devem passar payloads
 * para cá.
 */
export function sanitizeProviderMessage(message: unknown, fallback: string): string {
  if (typeof message !== "string") return fallback;

  const cleaned = message
    .replace(/\p{Cc}/gu, " ")
    .replace(/\b(authorization)\b\s*[:=]\s*(?:Bearer\s+)?\S+/gi, "$1: Bearer [redacted]")
    .replace(/\b(x-api-key|client[-_ ]?secret|api[-_ ]?key)\b\s*[:=]\s*\S+/gi, "$1: [redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length === 0) return fallback;
  if (cleaned.length <= MAX_MESSAGE_LENGTH) return cleaned;
  return `${cleaned.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;
}
