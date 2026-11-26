import { z } from "zod";

import { APP_TIME_ZONE } from "./format";

/** Filtros de período globais da aplicação (search params validados). */

export const PERIOD_VALUES = [
  "7d",
  "30d",
  "90d",
  "12m",
  "mtd",
  "last-month",
  "ytd",
  "custom",
] as const;

export type Period = (typeof PERIOD_VALUES)[number];

export interface PeriodSelection {
  period: Period;
  from?: string;
  to?: string;
}

/** Search params do layout `_app`; o padrão (30d) não é serializado na URL. */
export interface PeriodSearch {
  period?: Period;
  from?: string;
  to?: string;
}

export interface ResolvedPeriod {
  period: Period;
  /** Data inicial inclusiva, `YYYY-MM-DD`. */
  from: string;
  /** Data final inclusiva, `YYYY-MM-DD`. */
  to: string;
  label: string;
}

export const DEFAULT_PERIOD: Period = "30d";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const isoDateSchema = z
  .string()
  .regex(ISO_DATE_PATTERN)
  .refine(isValidIsoDate, "Data inválida")
  .optional()
  .catch(undefined);

/**
 * Campos de período reutilizados pelos schemas de search params das rotas.
 * Entradas inválidas caem no padrão (30d) em vez de derrubar a navegação.
 */
export const periodSearchShape = {
  period: z.enum(PERIOD_VALUES).catch(DEFAULT_PERIOD),
  from: isoDateSchema,
  to: isoDateSchema,
} as const;

/**
 * Normaliza os campos crus de período para o contrato de search params.
 *
 * Devolve sempre as três chaves, com `undefined` nas descartadas. O router monta a search de
 * cada rota como `{ ...searchDoPai, ...searchValidada }` (router-core `matchRoutes`): uma chave
 * omitida aqui voltaria com o valor bruto da URL. `undefined` explícito a sobrescreve (e o
 * serializador da URL ignora `undefined`).
 */
export function normalizePeriodSearch(value: {
  period: Period;
  from?: string;
  to?: string;
}): PeriodSearch {
  if (value.period === "custom") {
    if (!value.from || !value.to) {
      return { period: undefined, from: undefined, to: undefined };
    }

    return { period: "custom", from: value.from, to: value.to };
  }

  return {
    period: value.period === DEFAULT_PERIOD ? undefined : value.period,
    from: undefined,
    to: undefined,
  };
}

/**
 * Schema dos search params do layout autenticado. `custom` exige from/to e o
 * período padrão é omitido da URL.
 */
export const periodSearchSchema = z
  .object(periodSearchShape)
  .transform((value): PeriodSearch => normalizePeriodSearch(value));

/** Normaliza a search opcional para o contrato exigido pelo PeriodFilter. */
export function periodSelectionFromSearch(search: PeriodSearch): PeriodSelection {
  return {
    period: search.period ?? DEFAULT_PERIOD,
    from: search.from,
    to: search.to,
  };
}

export const PERIOD_OPTIONS = [
  { value: "7d", label: "Últimos 7 dias", shortLabel: "7D" },
  { value: "30d", label: "Últimos 30 dias", shortLabel: "30D" },
  { value: "90d", label: "Últimos 90 dias", shortLabel: "90D" },
  { value: "12m", label: "Últimos 12 meses", shortLabel: "12M" },
  { value: "mtd", label: "Este mês", shortLabel: "Este mês" },
  { value: "last-month", label: "Mês passado", shortLabel: "Mês passado" },
  { value: "ytd", label: "Este ano", shortLabel: "Este ano" },
  { value: "custom", label: "Personalizado", shortLabel: "Período" },
] as const satisfies ReadonlyArray<{ value: Period; label: string; shortLabel: string }>;

export function periodLabel(period: Period): string {
  return PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? "Últimos 30 dias";
}

function toIsoDate(date: Date): string {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/** Mês corrente (`YYYY-MM`) no fuso do app (São Paulo), não o do navegador. */
export function currentMonthInAppTimeZone(now: Date = new Date()): string {
  return todayInAppTimeZone(now).toISOString().slice(0, 7);
}

function todayInAppTimeZone(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);

  return new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
}

function addDaysUtc(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Soma dias a uma data civil `YYYY-MM-DD` sem depender do fuso local. */
export function addDaysIso(isoDate: string, days: number): string {
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number);
  return toIsoDate(new Date(Date.UTC(year, month - 1, day) + days * 86_400_000));
}

/** Diferença em dias entre duas datas civis (`to - from`). */
export function daysBetweenIso(from: string, to: string): number {
  const parse = (value: string) => {
    const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };

  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** Intervalo anterior de mesmo tamanho, imediatamente antes de `period`. */
export function previousPeriod(period: { from: string; to: string }): {
  from: string;
  to: string;
} {
  const length = daysBetweenIso(period.from, period.to) + 1;
  const to = addDaysIso(period.from, -1);

  return { from: addDaysIso(to, -(length - 1)), to };
}

/**
 * Converte a seleção em um intervalo concreto (inclusivo) para a API.
 * 7d/30d/90d são janelas móveis incluindo hoje; 12m começa no primeiro dia do
 * mês 11 meses atrás; "Este mês" começa no dia 1º; "Mês passado" cobre o mês
 * anterior inteiro; YTD começa em 1º de janeiro.
 */
export function resolvePeriod(selection: PeriodSelection, now: Date = new Date()): ResolvedPeriod {
  const today = todayInAppTimeZone(now);
  const to = toIsoDate(today);

  if (selection.period === "custom" && selection.from && selection.to) {
    const from = selection.from <= selection.to ? selection.from : selection.to;
    const end = selection.from <= selection.to ? selection.to : selection.from;

    return { period: "custom", from, to: end, label: "Personalizado" };
  }

  const period = selection.period === "custom" ? DEFAULT_PERIOD : selection.period;

  switch (period) {
    case "7d":
      return { period, from: toIsoDate(addDaysUtc(today, -6)), to, label: periodLabel(period) };
    case "90d":
      return { period, from: toIsoDate(addDaysUtc(today, -89)), to, label: periodLabel(period) };
    case "12m": {
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
      return { period, from: toIsoDate(from), to, label: periodLabel(period) };
    }
    case "mtd": {
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { period, from: toIsoDate(from), to, label: periodLabel(period) };
    }
    case "last-month": {
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      // Dia 0 do mês corrente é o último dia do mês anterior.
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return { period, from: toIsoDate(from), to: toIsoDate(end), label: periodLabel(period) };
    }
    case "ytd": {
      const from = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      return { period, from: toIsoDate(from), to, label: periodLabel(period) };
    }
    case "30d":
    default:
      return {
        period: DEFAULT_PERIOD,
        from: toIsoDate(addDaysUtc(today, -29)),
        to,
        label: periodLabel(DEFAULT_PERIOD),
      };
  }
}
