import { addDays, type Period } from "@fd/contracts";

/** Número de dias inclusivos do período. */
export function periodDays(period: Period): number {
  const from = Date.parse(`${period.from}T00:00:00.000Z`);
  const to = Date.parse(`${period.to}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000) + 1;
}

/** Período anterior de mesmo tamanho, imediatamente antes de `from`. */
export function previousPeriod(period: Period): Period {
  const days = periodDays(period);
  const previousTo = addDays(period.from, -1);
  return { from: addDays(previousTo, -(days - 1)), to: previousTo };
}

/**
 * Lista de inícios de bucket para preencher a série de cashflow (inclui o
 * bucket parcial que começa antes de `from` em granularidade semanal).
 * Limitada a 400 pontos para proteger CPU.
 */
export function enumerateBuckets(period: Period, granularity: "day" | "week" | "month"): string[] {
  const buckets: string[] = [];
  if (granularity === "day") {
    let current = period.from;
    while (current <= period.to && buckets.length < 400) {
      buckets.push(current);
      current = addDays(current, 1);
    }
    return buckets;
  }

  if (granularity === "week") {
    const day = new Date(`${period.from}T00:00:00.000Z`).getUTCDay();
    let current = addDays(period.from, -((day + 6) % 7));
    while (current <= period.to && buckets.length < 400) {
      buckets.push(current);
      current = addDays(current, 7);
    }
    return buckets;
  }

  let current = `${period.from.slice(0, 7)}-01`;
  while (current <= period.to && buckets.length < 400) {
    buckets.push(current);
    current = addMonths(current, 1);
  }
  return buckets;
}

/** Lista os últimos `months` meses (inclui o atual), do mais antigo ao atual. */
export function lastMonths(count: number, today: string): string[] {
  const current = `${today.slice(0, 7)}-01`;
  const months: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    months.push(addMonths(current, -index));
  }
  return months;
}

export function addMonths(monthStart: string, months: number): string {
  const [year, month] = monthStart.split("-").map(Number);
  const base = new Date(Date.UTC(year!, month! - 1, 1));
  base.setUTCMonth(base.getUTCMonth() + months);
  return base.toISOString().slice(0, 10);
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}
