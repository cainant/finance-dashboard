import type { BillStatus } from "@fd/contracts";
import { addDays, toIsoDate, todayIsoDate } from "@fd/contracts";
import type { Bill as BillRow } from "@fd/database";

/** Faturas vencidas há mais que isso são histórico fechado, não "atrasadas". */
const HISTORICAL_BILL_DAYS = 90;

/**
 * Prefixo do id sintético da fatura aberta derivada. Esse id **não existe** na
 * tabela `bills`: a rota `GET /api/bills/:id/transactions` só encontra faturas
 * persistidas (responde 404 para ele) e nenhuma tela oferece ação por id a
 * partir de `GET /api/bills/upcoming`.
 */
export const DERIVED_OPEN_BILL_PREFIX = "open-invoice";

/**
 * Status efetivo de uma fatura na data: o Pluggy não envia status e o banco
 * pode ter sido sincronizado há dias. `paid` é preservado porque o pagamento é
 * informação do provider; o restante é rederivado por datas. Faturas muito
 * antigas (sandbox de 2023) ficam `closed` em vez de `overdue` para sempre.
 */
export function billStatusOnDate(row: BillRow, today: string = todayIsoDate()): BillStatus {
  if (row.status === "paid") return "paid";
  if (row.dueDate < today) {
    return row.dueDate < addDays(today, -HISTORICAL_BILL_DAYS) ? "closed" : "overdue";
  }
  if (row.closingDate && row.closingDate <= today) return "closed";
  return "open";
}

/** `open`/`closed`/`overdue` contam como dívida; `paid` não. */
export function isUnpaidStatus(status: BillStatus): boolean {
  return status !== "paid";
}

/** Dia `day` do mês, limitado ao último dia (31 em fevereiro vira 28/29). */
function dayInMonth(year: number, monthIndex: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const safeDay = Math.min(Math.max(day, 1), lastDay);
  return toIsoDate(new Date(Date.UTC(year, monthIndex, safeDay)));
}

/** Mesmo dia do mês (clampado) `months` meses depois de `isoDate`. */
function shiftMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return dayInMonth(year!, month! - 1 + months, day!);
}

function isValidDay(day: number | null): day is number {
  return day !== null && Number.isInteger(day) && day >= 1 && day <= 31;
}

/** Primeira ocorrência do dia `day` a partir de `from` (inclusive). */
function firstDayOnOrAfter(from: string, day: number): string {
  const [year, month] = from.split("-").map(Number);
  const candidate = dayInMonth(year!, month! - 1, day);

  return candidate >= from ? candidate : dayInMonth(year!, month!, day);
}

/** Primeira ocorrência do dia `day` estritamente depois de `from`. */
function firstDayAfter(from: string, day: number): string {
  return firstDayOnOrAfter(addDays(from, 1), day);
}

/** Última ocorrência do dia `day` até `until` (inclusive). */
function lastDayOnOrBefore(until: string, day: number): string {
  const [year, month] = until.split("-").map(Number);
  const candidate = dayInMonth(year!, month! - 1, day);

  return candidate <= until ? candidate : dayInMonth(year!, month! - 2, day);
}

/**
 * Próximo vencimento da fatura corrente: a primeira ocorrência de `due_day`
 * **estritamente depois** da última fatura conhecida do cartão (pagas
 * incluídas) e nunca no passado. Isso evita apontar a fatura derivada para o
 * ciclo que acabou de ser pago — uma fatura de 07/11 paga leva a próxima para
 * 07/12 mesmo quando "hoje" ainda é 31/10.
 *
 * "Hoje" é a data civil **UTC** (`todayIsoDate`), como no resto da API: das
 * 21h às 23h59 BRT o dia UTC já virou e a derivada pode pular de mês no dia do
 * vencimento. `null` quando o cartão não informa `due_day`.
 */
export function nextDueDate(
  dueDay: number | null,
  lastBillDueDate: string | null,
  today: string,
): string | null {
  if (!isValidDay(dueDay)) return null;

  const afterLastBill = lastBillDueDate === null ? null : addDays(lastBillDueDate, 1);
  const base = afterLastBill !== null && afterLastBill > today ? afterLastBill : today;

  return firstDayOnOrAfter(base, dueDay);
}

/**
 * Fechamento da fatura que vence em `dueDate`. Com histórico de faturas, é o
 * primeiro `closing_day` depois do último fechamento conhecido (ou o mesmo dia
 * um mês depois, quando o cartão não informa `closing_day`); sem histórico, é
 * o último `closing_day` antes do vencimento. O fechamento nunca passa do
 * vencimento — dados fora desse padrão viram `null`.
 */
export function derivedClosingDate(
  closingDay: number | null,
  lastClosingDate: string | null,
  dueDate: string,
): string | null {
  if (lastClosingDate !== null) {
    const candidate = isValidDay(closingDay)
      ? firstDayAfter(lastClosingDate, closingDay)
      : shiftMonths(lastClosingDate, 1);
    const adjusted = candidate > dueDate ? shiftMonths(candidate, -1) : candidate;

    return adjusted > lastClosingDate && adjusted <= dueDate ? adjusted : null;
  }

  return isValidDay(closingDay) ? lastDayOnOrBefore(dueDate, closingDay) : null;
}

/** Cartão (conta + metadados + agregados das faturas) para derivar a aberta. */
export interface OpenBillCard {
  accountId: string;
  accountName: string;
  brand: string | null;
  /** Saldo devedor do cartão (`accounts.balance_cents`): teto da fatura. */
  balanceCents: number;
  closingDay: number | null;
  dueDay: number | null;
  /** `MAX(bills.due_date)` do cartão, pagas incluídas. */
  lastBillDueDate: string | null;
  /** `MAX(bills.closing_date)` do cartão (null quando o provider não informa). */
  lastClosingDate: string | null;
  /**
   * Compras líquidas do ciclo (`expense` − `income`) desde `lastClosingDate`,
   * em centavos positivos.
   */
  cycleNetCents: number;
}

/** Id sintético estável por cartão e ciclo (nunca colide com ids do D1). */
export function derivedOpenBillId(accountId: string, dueDate: string): string {
  return `${DERIVED_OPEN_BILL_PREFIX}:${accountId}:${dueDate}`;
}

/**
 * Valor da fatura corrente derivada. Com histórico de faturas é a soma das
 * compras líquidas do ciclo (despesas menos estornos, desde o último
 * fechamento), **limitada pelo saldo devedor**: o `balance_cents` do provider
 * é o total que se deve, então serve de teto — um ciclo já pago (o pagamento
 * chega como `transfer` e não entraria na conta) não pode gerar fatura maior
 * que a dívida real. Sem **nenhuma** fatura sincronizada, o saldo devedor é a
 * única fonte disponível.
 *
 * Fatura sem `closing_date` (o provider não informa o fechamento) não permite
 * separar o que é do ciclo: derivar pelo saldo contaria em dobro com a fatura
 * já existente, então o total é zero e a linha não aparece.
 *
 * Aproximações conhecidas: transações `pending` datadas 1–2 dias antes do
 * fechamento e sem `bill_id` não entram (o corte é `date >= lastClosing` e elas
 * ficaram fora da fatura fechada, que só soma `posted`); o teto pelo saldo
 * superestima quando o saldo inclui parcelas futuras e há pagamento antecipado
 * no ciclo.
 */
export function derivedOpenBillTotalCents(card: OpenBillCard): number {
  if (card.lastBillDueDate === null) return card.balanceCents;
  if (card.lastClosingDate === null) return 0;

  return Math.min(card.cycleNetCents, card.balanceCents);
}

/**
 * Fatura corrente derivada do cartão — usada quando o provider só trouxe
 * faturas pagas e a fatura em aberto nunca aparece em `bills`. `null` quando
 * não há valor em aberto ou quando o cartão não informa vencimento.
 *
 * Não é preciso bloquear por fatura não paga: o vencimento derivado é sempre
 * estritamente posterior a `MAX(bills.due_date)` (pagas incluídas), então
 * qualquer fatura existente — paga ou não — fica em ciclo anterior.
 */
export function derivedOpenBillRow(
  card: OpenBillCard,
  today: string = todayIsoDate(),
): BillRow | null {
  const dueDate = nextDueDate(card.dueDay, card.lastBillDueDate, today);
  if (dueDate === null) return null;

  const totalCents = derivedOpenBillTotalCents(card);
  if (totalCents <= 0) return null;

  return {
    id: derivedOpenBillId(card.accountId, dueDate),
    accountId: card.accountId,
    externalId: `${DERIVED_OPEN_BILL_PREFIX}-${dueDate}`,
    dueDate,
    closingDate: derivedClosingDate(card.closingDay, card.lastClosingDate, dueDate),
    totalCents,
    minimumPaymentCents: null,
    status: "open",
  };
}

const ISO_DATE_DAY = /^\d{4}-\d{2}-(\d{2})/;

/**
 * Quantas faturas entram na moda. O fechamento de uma fatura específica pode
 * cair no dia anterior/seguinte quando o dia nominal é fim de semana ou
 * feriado (a própria demo tem faturas fechando dia 20 e dia 15), então um dia
 * isolado não representa o cartão.
 */
export const CLOSING_DAY_SAMPLE = 6;

/**
 * Dia de fechamento derivado das faturas sincronizadas: a moda dos dias das
 * últimas {@link CLOSING_DAY_SAMPLE} faturas com `closingDate` (as mais
 * recentes por vencimento); empate fica com o dia da fatura mais recente.
 * O Pluggy pode omitir `creditData.balanceCloseDate` no cartão, mas
 * `billClosingDate` vem em cada fatura; sem o fallback a tela mostrava
 * "Fecha dia —".
 */
export function closingDayFromBills(
  rows: readonly Pick<BillRow, "dueDate" | "closingDate">[],
): number | null {
  const days = [...rows]
    .filter((row): row is Pick<BillRow, "dueDate" | "closingDate"> & { closingDate: string } =>
      Boolean(row.closingDate),
    )
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    .slice(0, CLOSING_DAY_SAMPLE)
    .map((row) => Number(ISO_DATE_DAY.exec(row.closingDate)?.[1]))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31);

  if (days.length === 0) return null;

  const counts = new Map<number, number>();
  for (const day of days) counts.set(day, (counts.get(day) ?? 0) + 1);

  // Percorre da mais recente para a mais antiga: `>` (e não `>=`) mantém o dia
  // mais recente quando dois dias empatam em frequência.
  let mode = days[0]!;
  let modeCount = 0;
  for (const day of days) {
    const count = counts.get(day) ?? 0;
    if (count > modeCount) {
      mode = day;
      modeCount = count;
    }
  }

  return mode;
}
