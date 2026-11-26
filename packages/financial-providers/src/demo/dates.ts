/**
 * Aritmética de datas do demo, toda em UTC. Datas do domínio são strings
 * `YYYY-MM-DD`; timestamps são ISO-8601 UTC.
 */

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0));
}

export function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12, 0, 0, 0));
}

export function addUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 12, 0, 0, 0));
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days, 12, 0, 0, 0),
  );
}

/** Soma meses preservando o dia (clampado ao último dia do mês destino). */
export function addUtcMonthsKeepingDay(date: Date, months: number): Date {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 12, 0, 0, 0),
  );
  return dayInUtcMonth(target, date.getUTCDate());
}

export function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 12, 0, 0, 0)).getUTCDate();
}

/** Dia `day` do mês, limitado ao último dia (ex.: 31 em fevereiro). */
export function dayInUtcMonth(date: Date, day: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const clamped = Math.min(Math.max(day, 1), daysInUtcMonth(year, month));
  return utcDate(year, month, clamped);
}

/** Primeiro dia do mês em que `date` cai, deslocado `offset` meses. */
export function monthStartOffset(date: Date, offset: number): Date {
  return addUtcMonths(startOfUtcMonth(date), offset);
}

export function isOnOrAfter(date: Date, reference: Date): boolean {
  return isoDate(date) >= isoDate(reference);
}

export function isOnOrBefore(date: Date, reference: Date): boolean {
  return isoDate(date) <= isoDate(reference);
}

export function minUtcDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

export function maxUtcDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}
