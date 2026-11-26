/**
 * Validação de entrada com os schemas de `@fd/contracts`.
 *
 * `jsonBody`, `queryParams` e `routeParams` embrulham `@hono/zod-validator`
 * para que qualquer falha vire `AppError` e caia no handler central de erros
 * (envelope `{ error: { code: "validation_error", ... } }`).
 */
import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";

import { validationError } from "./errors";

const hook = (result: { success: boolean; error?: unknown }): void => {
  if (!result.success) {
    throw validationError(result.error as Parameters<typeof validationError>[0]);
  }
};

export function jsonBody<T extends ZodType>(schema: T) {
  return zValidator("json", schema, hook);
}

export function queryParams<T extends ZodType>(schema: T) {
  return zValidator("query", schema, hook);
}

export function routeParams<T extends ZodType>(schema: T) {
  return zValidator("param", schema, hook);
}
