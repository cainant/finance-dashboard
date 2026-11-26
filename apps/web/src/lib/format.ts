/**
 * Formatação de dinheiro, datas e percentuais no padrão brasileiro.
 *
 * ## Convenção de percentuais (importante)
 *
 * Existem duas representações no app e elas NÃO são intercambiáveis:
 *
 * - **Pontos percentuais** — a convenção da API (`deltaPercent`, `percentage`):
 *   `2.9` significa 2,9%. Formate com {@link formatPercentPoints}.
 * - **Razão/fração (0–1)** — valores calculados no próprio web a partir de
 *   centavos (uso do limite, taxa de poupança): `0.029` significa 2,9%.
 *   Formate com {@link formatPercent}.
 *
 * Escolha o helper pelo que o número representa na origem; nunca multiplique
 * ou divida por 100 no meio da tela (era assim que `2.9` virava "290%").
 */

export const APP_LOCALE = "pt-BR";
export const APP_TIME_ZONE = "America/Sao_Paulo";
export const DEFAULT_CURRENCY = "BRL";

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type SignDisplay = "auto" | "always" | "never" | "exceptZero";

export interface CurrencyFormatOptions {
  currency?: string;
  locale?: string;
  /** `always` prefixa + em valores positivos; útil para entradas/saídas. */
  signDisplay?: SignDisplay;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /** Notação compacta (1,2 mi) para eixos de gráfico. */
  compact?: boolean;
}

/**
 * Teto de formatadores guardados. As combinações reais de opções são poucas;
 * o limite só evita crescimento sem fim se alguém criar opções por valor.
 */
const FORMATTER_CACHE_LIMIT = 64;

/**
 * Constrói o formatador uma vez por combinação de opções. `Intl.NumberFormat`
 * e `Intl.DateTimeFormat` são caros de instanciar (~centenas de microssegundos)
 * e baratos de reutilizar; a tabela formata dezenas de valores por frame de
 * rolagem, então criar um formatador por célula dominava o custo dos frames.
 */
function cachedFormatter<T>(cache: Map<string, T>, key: string, create: () => T): T {
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const formatter = create();
  if (cache.size >= FORMATTER_CACHE_LIMIT) {
    cache.clear();
  }
  cache.set(key, formatter);
  return formatter;
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(options: CurrencyFormatOptions): Intl.NumberFormat {
  const locale = options.locale ?? APP_LOCALE;
  const currency = options.currency ?? DEFAULT_CURRENCY;
  const signDisplay = options.signDisplay ?? "auto";
  const minimumFractionDigits = options.minimumFractionDigits ?? 2;
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  const key = [
    locale,
    currency,
    signDisplay,
    minimumFractionDigits,
    maximumFractionDigits,
    options.compact ? "compact" : "full",
  ].join("|");

  return cachedFormatter(
    currencyFormatters,
    key,
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        signDisplay,
        minimumFractionDigits,
        maximumFractionDigits,
        ...(options.compact ? { notation: "compact" as const } : {}),
      }),
  );
}

/**
 * Converte centavos inteiros (domínio) em texto BRL: 123456 → "R$ 1.234,56".
 * O Intl usa espaço não separável entre "R$" e o número — mantenha-o para o
 * valor nunca quebrar linha no meio.
 */
export function formatCurrencyFromCents(
  cents: number,
  options: CurrencyFormatOptions = {},
): string {
  if (!Number.isFinite(cents)) {
    return "—";
  }

  return currencyFormatter(options).format(cents / 100);
}

export interface PercentFormatOptions {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  signDisplay?: SignDisplay;
}

const percentFormatters = new Map<string, Intl.NumberFormat>();

function percentFormatter(options: PercentFormatOptions): Intl.NumberFormat {
  const locale = options.locale ?? APP_LOCALE;
  const minimumFractionDigits = options.minimumFractionDigits ?? 0;
  const maximumFractionDigits = options.maximumFractionDigits ?? 1;
  const signDisplay = options.signDisplay ?? "auto";
  const key = [locale, minimumFractionDigits, maximumFractionDigits, signDisplay].join("|");

  return cachedFormatter(
    percentFormatters,
    key,
    () =>
      new Intl.NumberFormat(locale, {
        style: "percent",
        minimumFractionDigits,
        maximumFractionDigits,
        signDisplay,
      }),
  );
}

/**
 * Formata uma **razão** como percentual: `0.124` → "12,4%".
 * Use apenas para valores calculados no web a partir de centavos (uso do
 * limite, taxa de poupança). Percentuais que vêm da API estão em pontos e
 * devem usar {@link formatPercentPoints}.
 */
export function formatPercent(value: number, options: PercentFormatOptions = {}): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return percentFormatter(options).format(value);
}

/**
 * Formata **pontos percentuais**, a convenção da API: `2.9` → "2,9%" (e não
 * "290%"). Use em todo `deltaPercent`/`percentage` devolvido pelo backend.
 */
export function formatPercentPoints(value: number, options: PercentFormatOptions = {}): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return formatPercent(value / 100, options);
}

export interface NumberFormatOptions {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  compact?: boolean;
}

const numberFormatters = new Map<string, Intl.NumberFormat>();

function numberFormatter(options: NumberFormatOptions): Intl.NumberFormat {
  const locale = options.locale ?? APP_LOCALE;
  const minimumFractionDigits = options.minimumFractionDigits ?? 0;
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  const key = [
    locale,
    minimumFractionDigits,
    maximumFractionDigits,
    options.compact ? "compact" : "full",
  ].join("|");

  return cachedFormatter(
    numberFormatters,
    key,
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits,
        maximumFractionDigits,
        ...(options.compact ? { notation: "compact" as const } : {}),
      }),
  );
}

export function formatNumber(value: number, options: NumberFormatOptions = {}): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return numberFormatter(options).format(value);
}

export type DateStyleOption = "short" | "medium" | "long" | "monthYear";

function parseDateInput(value: string | number | Date): { date: Date; dateOnly: boolean } | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : { date: value, dateOnly: false };
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : { date, dateOnly: false };
  }

  const dateOnlyMatch = DATE_ONLY_PATTERN.exec(value);
  if (dateOnlyMatch) {
    // Datas de calendário (YYYY-MM-DD) são formatadas em UTC para não
    // deslocar o dia em fusos negativos como America/Sao_Paulo.
    const date = new Date(
      Date.UTC(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3])),
    );
    return Number.isNaN(date.getTime()) ? null : { date, dateOnly: true };
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : { date, dateOnly: false };
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(style: DateStyleOption, timeZone: string): Intl.DateTimeFormat {
  const key = `${APP_LOCALE}|${style}|${timeZone}`;

  return cachedFormatter(dateFormatters, key, () => {
    const options: Intl.DateTimeFormatOptions =
      style === "monthYear"
        ? { month: "long", year: "numeric" }
        : { dateStyle: style === "short" ? "short" : style };

    return new Intl.DateTimeFormat(APP_LOCALE, { ...options, timeZone });
  });
}

/**
 * Datas pt-BR. Strings `YYYY-MM-DD` são datas de calendário e formatadas em UTC;
 * timestamps ISO são exibidos no fuso de São Paulo.
 */
export function formatDate(
  value: string | number | Date,
  style: DateStyleOption = "short",
): string {
  const parsed = parseDateInput(value);
  if (!parsed) {
    return "—";
  }

  return dateFormatter(style, parsed.dateOnly ? "UTC" : APP_TIME_ZONE).format(parsed.date);
}

/** Timestamp completo (data + hora) no fuso de São Paulo. */
export function formatDateTime(value: string | number | Date): string {
  const parsed = parseDateInput(value);
  if (!parsed) {
    return "—";
  }

  const formatter = cachedFormatter(
    dateFormatters,
    `${APP_LOCALE}|datetime|${APP_TIME_ZONE}`,
    () =>
      new Intl.DateTimeFormat(APP_LOCALE, {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: APP_TIME_ZONE,
      }),
  );

  return formatter.format(parsed.date);
}

/** Formata centavos de forma compacta para eixos: 123456789 → "R$ 1,2 mi". */
export function formatCompactCurrencyFromCents(cents: number): string {
  return formatCurrencyFromCents(cents, {
    compact: true,
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });
}

/** Trunca (em vez de arredondar) para não inflar valores compactos na UI. */
function truncateToOneDecimal(value: number): number {
  const truncated = Math.trunc(value * 10) / 10;
  return truncated === 0 ? 0 : truncated;
}

/**
 * Rótulo compacto pt-BR sem "R$", com unidade explícita para controlar o
 * arredondamento (o `notation: "compact"` do Intl arredondaria 49,45 → 49,5).
 */
function formatCompactReais(reais: number, compactFromAbs: number): string {
  const abs = Math.abs(reais);

  if (abs >= 1_000_000_000) {
    return `${formatNumber(truncateToOneDecimal(reais / 1_000_000_000), {
      maximumFractionDigits: 1,
    })} bi`;
  }

  if (abs >= 1_000_000) {
    return `${formatNumber(truncateToOneDecimal(reais / 1_000_000), {
      maximumFractionDigits: 1,
    })} mi`;
  }

  if (abs >= compactFromAbs) {
    return `${formatNumber(truncateToOneDecimal(reais / 1_000), {
      maximumFractionDigits: 1,
    })} mil`;
  }

  // Evita "-0" em valores entre -R$ 0,50 e R$ 0,00.
  const rounded = Math.abs(reais) < 0.5 ? 0 : reais;
  return formatNumber(rounded, { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

/**
 * Valor curto sem "R$" para a sidebar: 4945015 → "49,4 mil", 106218 → "1.062".
 * Até R$ 9.999 mostra o inteiro com separador de milhar; acima disso usa a
 * notação compacta pt-BR. Sempre trunca a primeira casa decimal.
 */
export function formatCompactAmountFromCents(cents: number): string {
  if (!Number.isFinite(cents)) {
    return "—";
  }

  return formatCompactReais(cents / 100, 10_000);
}

/**
 * Valor curto **com moeda** para slots estreitos (sidebar, pills):
 * 12300 → "R$ 123", -250000 → "-R$ 2.500", 3450000 → "R$ 34,5 mil".
 *
 * Centavos só aparecem quando existem e o valor é pequeno ("R$ 7,50"): é a
 * faixa em que perdê-los mudaria a leitura de uma fatura. No resto o valor é
 * truncado, nunca arredondado para cima (432,99 → "R$ 432", 8.888,50 →
 * "R$ 8.888").
 */
export function formatCompactMoneyFromCents(cents: number): string {
  if (!Number.isFinite(cents)) {
    return "—";
  }

  const absCents = Math.abs(cents);
  if (absCents > 0 && absCents < 10_000 && cents % 100 !== 0) {
    // `formatCurrencyFromCents` já usa o espaço não separável entre "R$" e o número.
    return formatCurrencyFromCents(cents);
  }

  const sign = cents < 0 ? "-" : "";
  const absReais = absCents / 100;

  if (absReais < 10_000) {
    return `${sign}R$\u00A0${formatNumber(Math.trunc(absReais), { maximumFractionDigits: 0 })}`;
  }

  return `${sign}R$\u00A0${formatCompactAmountFromCents(absCents)}`;
}

/**
 * Rótulo curto de eixo Y, sem "R$" e sem risco de corte: 8000000 → "80 mil",
 * 250000 → "2,5 mil", 0 → "0". A partir de R$ 1.000 usa notação compacta.
 */
export function formatAxisAmountFromCents(cents: number): string {
  if (!Number.isFinite(cents)) {
    return "—";
  }

  return formatCompactReais(cents / 100, 1_000);
}

/**
 * Dia e mês curtos para o eixo X de séries diárias: "2026-10-18" → "18/10".
 * Datas de calendário são formatadas em UTC (como em {@link formatDate}).
 */
export function formatDayMonth(value: string): string {
  const parsed = parseDateInput(value);
  if (!parsed) {
    return "—";
  }

  return new Intl.DateTimeFormat(APP_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    timeZone: parsed.dateOnly ? "UTC" : APP_TIME_ZONE,
  }).format(parsed.date);
}

/**
 * Mês `YYYY-MM` para rótulo curto pt-BR ("nov"). Datas de calendário são
 * formatadas em UTC para não deslocar o mês em fusos negativos.
 */
export function formatMonthShort(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    return month;
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat(APP_LOCALE, { month: "short", timeZone: "UTC" })
    .format(date)
    .replace(".", "");
}

/** Mês `YYYY-MM` por extenso ("novembro de 2026"). */
export function formatMonthLong(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    return month;
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat(APP_LOCALE, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

const dayLabelFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Data por extenso para o cabeçalho de cada dia da lista: "Sábado, 14 de
 * novembro". O ano aparece só quando difere do ano de `now`, para o período de
 * 12 meses não misturar dezembros. `YYYY-MM-DD` é data de calendário (UTC).
 */
export function formatDayLabel(value: string, now: Date = new Date()): string {
  const parsed = parseDateInput(value);
  if (!parsed) {
    return "—";
  }

  const yearFormatter = cachedFormatter(
    dayLabelFormatters,
    `${APP_LOCALE}|year`,
    () => new Intl.DateTimeFormat(APP_LOCALE, { year: "numeric", timeZone: APP_TIME_ZONE }),
  );
  const currentYear = Number(yearFormatter.format(now));
  const withYear = parsed.date.getUTCFullYear() !== currentYear;
  const key = `${APP_LOCALE}|day|${withYear}`;
  const formatter = cachedFormatter(
    dayLabelFormatters,
    key,
    () =>
      new Intl.DateTimeFormat(APP_LOCALE, {
        weekday: "long",
        day: "numeric",
        month: "long",
        ...(withYear ? { year: "numeric" } : {}),
        timeZone: "UTC",
      }),
  );
  const text = formatter.format(parsed.date);

  return text.charAt(0).toUpperCase() + text.slice(1);
}
