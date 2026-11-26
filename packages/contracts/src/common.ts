import { z } from "zod";

/** Prefixo de todas as rotas HTTP da API. */
export const API_PREFIX = "/api" as const;
export type ApiPrefix = typeof API_PREFIX;

/** Moeda suportada pela v1 (ISO 4217). */
export const currencySchema = z.literal("BRL");
export type Currency = z.infer<typeof currencySchema>;

/**
 * Dinheiro é SEMPRE inteiro em centavos. Nunca use float para valores
 * monetários: `R$ 12,34` -> `1234`.
 */
export const amountCentsSchema = z.number().int();
export type AmountCents = z.infer<typeof amountCentsSchema>;

/** Data civil ISO 8601 (`YYYY-MM-DD`), sem fuso. */
export const isoDateSchema = z.iso.date();
export type IsoDate = z.infer<typeof isoDateSchema>;

/** Timestamp ISO 8601 em UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`). */
export const isoDateTimeSchema = z.iso.datetime();
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;

/** Identificador opaco (UUID ou string curta gerada pelo app). */
export const idSchema = z.string().min(1).max(128);
export type Id = z.infer<typeof idSchema>;

/** Slug de categoria: minúsculas, números e hífens. */
export const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug deve usar apenas a-z, 0-9 e hífens");
export type Slug = z.infer<typeof slugSchema>;

/** Cor em hexadecimal no formato `#RRGGBB`. */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "cor deve ser hexadecimal no formato #RRGGBB");
export type HexColor = z.infer<typeof hexColorSchema>;

/** Metadados de paginação por cursor (ver docs/architecture.md). */
export const pageInfoSchema = z.object({
  cursor: z.string().nullable().optional(),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative().optional(),
});
export type PageInfo = z.infer<typeof pageInfoSchema>;

/** Envelope de lista paginada: `{ data: T[], page: {...} }`. */
export interface Paginated<T> {
  data: T[];
  page: PageInfo;
}

/** Cria o schema de uma lista paginada para um schema de item. */
export function paginatedSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    page: pageInfoSchema,
  });
}

/**
 * Códigos de erro recomendados. O campo `code` do envelope é `string` livre
 * para permitir códigos específicos sem quebrar clientes antigos.
 */
export const API_ERROR_CODES = [
  "bad_request",
  "validation_error",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "provider_error",
  "internal_error",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Envelope padrão de erro: `{ error: { code, message, details? } }`. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>["error"];
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Quantidade de dias do período padrão (`periodQuery`). */
export const PERIOD_DEFAULT_DAYS = 30;

/** Converte um `Date` para data civil UTC (`YYYY-MM-DD`). */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Data civil de "hoje" em UTC. Injetável para testes. */
export function todayIsoDate(now: Date = new Date()): string {
  return toIsoDate(now);
}

/**
 * Soma dias a uma data civil ISO (`YYYY-MM-DD`), sem depender do fuso local.
 * Aceita valores negativos.
 */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const base = Date.UTC(year!, month! - 1, day!);
  return toIsoDate(new Date(base + days * 86_400_000));
}
