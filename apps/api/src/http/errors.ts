/**
 * Erros de aplicação e mapeamento para o envelope padrão da API:
 * `{ error: { code, message, details? } }`.
 */
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

import { isProviderError } from "@fd/financial-providers";

export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: ContentfulStatusCode, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message = "Requisição inválida", details?: unknown): AppError {
  return new AppError(400, "bad_request", message, details);
}

export function validationError(error: ZodError): AppError {
  return new AppError(400, "validation_error", "Dados inválidos", {
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
      code: issue.code,
    })),
  });
}

export function unauthorized(message = "Não autenticado"): AppError {
  return new AppError(401, "unauthorized", message);
}

export function forbidden(message = "Acesso negado"): AppError {
  return new AppError(403, "forbidden", message);
}

export function notFound(message = "Recurso não encontrado"): AppError {
  return new AppError(404, "not_found", message);
}

export function conflict(message: string, details?: unknown): AppError {
  return new AppError(409, "conflict", message, details);
}

export function rateLimited(message = "Muitas tentativas. Tente novamente mais tarde."): AppError {
  return new AppError(429, "rate_limited", message);
}

export function providerError(message: string, details?: unknown): AppError {
  return new AppError(502, "provider_error", message, details);
}

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface MappedError {
  status: ContentfulStatusCode;
  body: ErrorBody;
  /** Erro original para log interno (nunca vai para o cliente). */
  cause?: unknown;
}

export function mapError(error: unknown): MappedError {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      },
    };
  }

  if (error instanceof ZodError) {
    const mapped = validationError(error);
    return { status: mapped.status, body: toBody(mapped), cause: error };
  }

  if (isProviderError(error)) {
    return {
      status: 502,
      body: {
        error: {
          code: "provider_error",
          message: error.message,
          details: { providerCode: error.code, retryable: error.retryable },
        },
      },
      cause: error,
    };
  }

  if (error instanceof HTTPException) {
    const status = error.status as ContentfulStatusCode;
    const code = status === 404 ? "not_found" : status < 500 ? "bad_request" : "internal_error";
    return { status, body: { error: { code, message: error.message } }, cause: error };
  }

  return {
    status: 500,
    body: { error: { code: "internal_error", message: "Erro interno" } },
    cause: error,
  };
}

function toBody(error: AppError): ErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}
