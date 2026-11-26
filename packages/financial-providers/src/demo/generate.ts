import { deriveBillStatus } from "../bills";
import type { ProviderCategoryHint } from "../categories";
import type {
  ProviderAccount,
  ProviderBalance,
  ProviderBill,
  ProviderConnection,
  ProviderCreditCard,
  ProviderInvestment,
  ProviderTransaction,
  ProviderTransactionStatus,
  ProviderTransactionType,
} from "../types";
import {
  DEMO_ACCOUNTS,
  DEMO_CARDS,
  DEMO_CONNECTION_EXTERNAL_IDS,
  DEMO_FREELANCE_CLIENTS,
  DEMO_INSTITUTIONS,
  DEMO_INVESTMENTS,
  DEMO_MERCHANTS,
  DEMO_MONTHLY_TRANSFERS,
  DEMO_PIX_IN_NAMES,
  DEMO_PIX_OUT_NAMES,
  DEMO_RECURRING_BY_ACCOUNT,
  DEMO_SEED,
  DEMO_OPENING_BALANCES_CENTS,
  type DemoAccountConfig,
  type DemoCardConfig,
  type DemoMerchant,
} from "./data";
import { createPrng, type Prng } from "./prng";
import {
  addUtcDays,
  addUtcMonths,
  addUtcMonthsKeepingDay,
  dayInUtcMonth,
  daysInUtcMonth,
  isoDate,
  minUtcDate,
  monthStartOffset,
  utcDate,
} from "./dates";

/** Dataset fictício completo, já normalizado. */
export interface DemoDataset {
  today: string;
  builtAt: string;
  connections: ProviderConnection[];
  accounts: ProviderAccount[];
  creditCards: ProviderCreditCard[];
  bills: ProviderBill[];
  transactions: ProviderTransaction[];
  balances: ProviderBalance[];
  investments: ProviderInvestment[];
}

interface TxDraft {
  externalId: string;
  accountExternalId: string;
  date: string;
  description: string;
  merchant: string | null;
  amountCents: number;
  type: ProviderTransactionType;
  status: ProviderTransactionStatus;
  categoryHint: ProviderCategoryHint;
  billExternalId: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  createdAt: string;
  updatedAt: string;
}

class TransactionCollector {
  readonly drafts: TxDraft[] = [];
  private readonly sequenceByAccount = new Map<string, number>();

  add(input: {
    accountExternalId: string;
    date: Date;
    description: string;
    amountCents: number;
    type: ProviderTransactionType;
    categoryHint: ProviderCategoryHint;
    status?: ProviderTransactionStatus;
    merchant?: string | null;
    billExternalId?: string | null;
    installmentNumber?: number | null;
    totalInstallments?: number | null;
  }): TxDraft {
    const date = isoDate(input.date);
    const sequence = (this.sequenceByAccount.get(input.accountExternalId) ?? 0) + 1;
    this.sequenceByAccount.set(input.accountExternalId, sequence);
    const stamp = `${date}T12:00:00.000Z`;
    const draft: TxDraft = {
      externalId: `demo-tx-${input.accountExternalId}-${date.replaceAll("-", "")}-${String(
        sequence,
      ).padStart(4, "0")}`,
      accountExternalId: input.accountExternalId,
      date,
      description: input.description,
      merchant: input.merchant ?? null,
      amountCents: input.amountCents,
      type: input.type,
      status: input.status ?? "posted",
      categoryHint: input.categoryHint,
      billExternalId: input.billExternalId ?? null,
      installmentNumber: input.installmentNumber ?? null,
      totalInstallments: input.totalInstallments ?? null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.drafts.push(draft);
    return draft;
  }
}

const SAVINGS_YIELD_RATE: Readonly<Record<string, number>> = {
  "demo-acc-aurora-savings": 0.0052,
  "demo-acc-horizonte-savings": 0.0061,
};

const CARD_PURCHASE_CATEGORIES: readonly ProviderCategoryHint[] = [
  "mercado",
  "restaurantes",
  "transporte",
  "saude",
  "lazer",
  "compras",
  "assinaturas",
  "viagem",
  "pets",
  "educacao",
];

export interface BuildDemoDatasetOptions {
  /** Instante de referência; injetável para testes. */
  now: Date;
}

export function buildDemoDataset({ now }: BuildDemoDatasetOptions): DemoDataset {
  const prng = createPrng(DEMO_SEED);
  const collector = new TransactionCollector();

  const today = utcDate(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const todayIso = isoDate(today);
  const builtAt = now.toISOString();

  const accountsByExternalId = new Map(
    DEMO_ACCOUNTS.map((account) => [account.externalId, account]),
  );
  const firstMonth = monthStartOffset(today, -11);
  const months = Array.from({ length: 12 }, (_, index) => addUtcMonths(firstMonth, index));

  // 1. Contas correntes: lançamentos fixos, variáveis e transferências internas.
  //    As transferências são geradas uma vez por mês (com os dois lados), não
  //    por conta, para não duplicar.
  for (const monthStart of months) {
    for (const account of DEMO_ACCOUNTS) {
      if (account.kind !== "checking") continue;
      generateCheckingMonthTransactions(account, monthStart, today, prng, collector);
    }
    generateInternalTransfers(monthStart, today, collector);
  }

  // 2. Faturas e compras dos cartões (gera também o pagamento nas contas).
  const { bills, creditCards, cardOwedCents } = generateCards(
    today,
    prng,
    collector,
    accountsByExternalId,
  );

  // 3. Rendimento das poupanças, calculado sobre o saldo de cada mês fechado.
  addSavingsYields(months, today, collector);

  // 4. Saldos: abertura + transações posted (pending não entra).
  const postedByAccount = new Map<string, number>();
  for (const draft of collector.drafts) {
    if (draft.status !== "posted") continue;
    postedByAccount.set(
      draft.accountExternalId,
      (postedByAccount.get(draft.accountExternalId) ?? 0) + draft.amountCents,
    );
  }

  const connections: ProviderConnection[] = DEMO_INSTITUTIONS.map((institution) => ({
    externalId: DEMO_CONNECTION_EXTERNAL_IDS[institution.key],
    provider: "demo",
    status: "active",
    institution: {
      externalId: institution.externalId,
      name: institution.name,
      primaryColor: institution.primaryColor,
      type: institution.type,
    },
    lastSyncedAt: builtAt,
    createdAt: `${isoDate(monthStartOffset(today, -13))}T12:00:00.000Z`,
    updatedAt: builtAt,
  }));

  const accounts: ProviderAccount[] = DEMO_ACCOUNTS.map((account) => {
    const balanceCents =
      (DEMO_OPENING_BALANCES_CENTS[account.externalId] ?? 0) +
      (postedByAccount.get(account.externalId) ?? 0);
    return {
      externalId: account.externalId,
      connectionExternalId: account.connectionExternalId,
      type: account.kind === "credit_card" ? "credit_card" : account.kind,
      subtype: account.subtype,
      name: account.name,
      numberMasked: account.numberMasked,
      currency: "BRL",
      balanceCents,
      availableCents: null,
      updatedAt: builtAt,
    };
  });

  for (const card of DEMO_CARDS) {
    const owed = cardOwedCents.get(card.externalId) ?? 0;
    accounts.push({
      externalId: card.externalId,
      connectionExternalId: card.connectionExternalId,
      type: "credit_card",
      subtype: "CREDIT_CARD",
      name: card.accountName,
      numberMasked: card.numberMasked,
      currency: "BRL",
      balanceCents: owed,
      availableCents: card.limitCents - owed,
      updatedAt: builtAt,
    });
  }

  const balances: ProviderBalance[] = accounts.map((account) => ({
    accountExternalId: account.externalId,
    balanceCents: account.balanceCents,
    availableCents: account.availableCents ?? null,
    currency: account.currency,
    updatedAt: builtAt,
  }));

  const investments: ProviderInvestment[] = DEMO_INVESTMENTS.map((investment) => ({
    externalId: investment.externalId,
    connectionExternalId: DEMO_CONNECTION_EXTERNAL_IDS.horizonte,
    type: investment.type,
    subtype: investment.subtype,
    name: investment.name,
    balanceCents: investment.balanceCents,
    amountProfitCents: investment.amountProfitCents,
    currency: "BRL",
    updatedAt: builtAt,
  }));

  const transactions: ProviderTransaction[] = collector.drafts.map((draft) => ({
    externalId: draft.externalId,
    accountExternalId: draft.accountExternalId,
    date: draft.date,
    description: draft.description,
    merchant: draft.merchant,
    amountCents: draft.amountCents,
    currency: "BRL",
    type: draft.type,
    status: draft.status,
    categoryHint: draft.categoryHint,
    billExternalId: draft.billExternalId,
    installmentNumber: draft.installmentNumber,
    totalInstallments: draft.totalInstallments,
    providerCode: null,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  }));

  transactions.sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    return byDate !== 0 ? byDate : b.externalId.localeCompare(a.externalId);
  });

  bills.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return {
    today: todayIso,
    builtAt,
    connections,
    accounts,
    creditCards,
    bills,
    transactions,
    balances,
    investments,
  };
}

function availableDayInMonth(monthStart: Date, today: Date): number {
  const sameMonth =
    monthStart.getUTCFullYear() === today.getUTCFullYear() &&
    monthStart.getUTCMonth() === today.getUTCMonth();
  if (sameMonth) return today.getUTCDate();
  return daysInUtcMonth(monthStart.getUTCFullYear(), monthStart.getUTCMonth());
}

function pickDateInMonth(
  prng: Prng,
  monthStart: Date,
  minDay: number,
  maxDay: number,
  today: Date,
): Date | null {
  const available = availableDayInMonth(monthStart, today);
  const low = Math.max(1, minDay);
  const high = Math.min(maxDay, available);
  if (high < low) return null;
  return dayInUtcMonth(monthStart, prng.int(low, high));
}

function pickDateBetween(prng: Prng, start: Date, end: Date): Date | null {
  const dayCount = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  if (dayCount < 0) return null;
  return addUtcDays(start, prng.int(0, dayCount));
}

function generateCheckingMonthTransactions(
  account: DemoAccountConfig,
  monthStart: Date,
  today: Date,
  prng: Prng,
  collector: TransactionCollector,
): void {
  const randomSpecs = randomSpecsForAccount(account.externalId);

  for (const recurring of DEMO_RECURRING_BY_ACCOUNT[account.externalId] ?? []) {
    const date = pickDateInMonth(prng, monthStart, recurring.day, recurring.day, today);
    if (!date) continue;
    const amount =
      recurring.amountCents ??
      (recurring.minCents !== undefined && recurring.maxCents !== undefined
        ? prng.int(recurring.minCents, recurring.maxCents)
        : 0);
    if (amount <= 0) continue;
    collector.add({
      accountExternalId: account.externalId,
      date,
      description: recurring.description,
      amountCents: recurring.type === "income" ? amount : -amount,
      type: recurring.type,
      categoryHint: recurring.category,
    });
  }

  generateRandomExpenses(account.externalId, monthStart, today, prng, collector, randomSpecs);
  generatePixTransactions(account.externalId, monthStart, today, prng, collector);
}

function generateInternalTransfers(
  monthStart: Date,
  today: Date,
  collector: TransactionCollector,
): void {
  for (const transfer of DEMO_MONTHLY_TRANSFERS) {
    const available = availableDayInMonth(monthStart, today);
    if (transfer.day > available) continue;
    const date = dayInUtcMonth(monthStart, transfer.day);
    collector.add({
      accountExternalId: transfer.fromAccountExternalId,
      date,
      description: transfer.fromDescription,
      amountCents: -transfer.amountCents,
      type: "transfer",
      categoryHint: "transferencias",
    });
    collector.add({
      accountExternalId: transfer.toAccountExternalId,
      date,
      description: transfer.toDescription,
      amountCents: transfer.amountCents,
      type: "transfer",
      categoryHint: "transferencias",
    });
  }
}

interface RandomSpec {
  categories: readonly ProviderCategoryHint[];
  minCount: number;
  maxCount: number;
  weekly?: boolean;
  dayMin?: number;
  dayMax?: number;
}

function randomSpecsForAccount(accountExternalId: string): readonly RandomSpec[] {
  if (accountExternalId === "demo-acc-aurora-checking") {
    return [
      { categories: ["mercado"], minCount: 4, maxCount: 4, weekly: true },
      { categories: ["restaurantes"], minCount: 2, maxCount: 3 },
      { categories: ["transporte"], minCount: 3, maxCount: 5 },
      { categories: ["saude"], minCount: 1, maxCount: 2 },
      { categories: ["lazer"], minCount: 0, maxCount: 1 },
      { categories: ["compras"], minCount: 1, maxCount: 2 },
    ];
  }
  if (accountExternalId === "demo-acc-nuvem-checking") {
    return [
      { categories: ["restaurantes"], minCount: 2, maxCount: 3 },
      { categories: ["transporte"], minCount: 2, maxCount: 3 },
      { categories: ["mercado"], minCount: 1, maxCount: 1 },
      { categories: ["compras"], minCount: 0, maxCount: 1 },
      { categories: ["saude"], minCount: 0, maxCount: 1 },
      { categories: ["assinaturas"], minCount: 0, maxCount: 1 },
    ];
  }
  if (accountExternalId === "demo-acc-horizonte-checking") {
    return [
      { categories: ["mercado"], minCount: 1, maxCount: 2 },
      { categories: ["restaurantes"], minCount: 0, maxCount: 1 },
      { categories: ["transporte"], minCount: 0, maxCount: 1 },
      { categories: ["pets"], minCount: 0, maxCount: 1 },
      { categories: ["lazer"], minCount: 0, maxCount: 1 },
    ];
  }
  return [];
}

function merchantsForCategories(
  categories: readonly ProviderCategoryHint[],
): readonly DemoMerchant[] {
  return DEMO_MERCHANTS.filter((merchant) => categories.includes(merchant.category));
}

function generateRandomExpenses(
  accountExternalId: string,
  monthStart: Date,
  today: Date,
  prng: Prng,
  collector: TransactionCollector,
  specs: readonly RandomSpec[],
): void {
  for (const spec of specs) {
    const merchants = merchantsForCategories(spec.categories);
    if (merchants.length === 0) continue;

    if (spec.weekly) {
      // Uma compra por semana, em dias espalhados (2–25), sem depender de catapora.
      for (let week = 0; week < 4; week += 1) {
        const day = 2 + week * 7 + prng.int(0, 2);
        const date = pickDateInMonth(prng, monthStart, day, day, today);
        if (!date) continue;
        addRandomPurchase(accountExternalId, date, today, prng, collector, merchants);
      }
      continue;
    }

    const count = prng.int(spec.minCount, spec.maxCount);
    for (let index = 0; index < count; index += 1) {
      const date = pickDateInMonth(prng, monthStart, spec.dayMin ?? 1, spec.dayMax ?? 28, today);
      if (!date) continue;
      addRandomPurchase(accountExternalId, date, today, prng, collector, merchants);
    }
  }
}

function addRandomPurchase(
  accountExternalId: string,
  date: Date,
  today: Date,
  prng: Prng,
  collector: TransactionCollector,
  merchants: readonly DemoMerchant[],
): void {
  const merchant = prng.pick(merchants);
  const pending =
    date.getTime() >= addUtcDays(today, -3).getTime() && prng.chance(0.35) ? "pending" : "posted";
  collector.add({
    accountExternalId,
    date,
    description: merchant.description,
    amountCents: -prng.int(merchant.minCents, merchant.maxCents),
    type: "expense",
    status: pending,
    categoryHint: merchant.category,
  });
}

function generatePixTransactions(
  accountExternalId: string,
  monthStart: Date,
  today: Date,
  prng: Prng,
  collector: TransactionCollector,
): void {
  const available = availableDayInMonth(monthStart, today);
  if (available < 1) return;

  if (accountExternalId === "demo-acc-aurora-checking") {
    if (prng.chance(0.5)) {
      const date = pickDateInMonth(prng, monthStart, 12, 26, today);
      if (date) {
        collector.add({
          accountExternalId,
          date,
          description: `PIX RECEBIDO - ${prng.pick(DEMO_FREELANCE_CLIENTS)}`,
          amountCents: prng.int(120_000, 280_000),
          type: "income",
          categoryHint: "freelance",
        });
      }
    }
    if (prng.chance(0.55)) {
      const date = pickDateInMonth(prng, monthStart, 3, 28, today);
      if (date) {
        collector.add({
          accountExternalId,
          date,
          description: `PIX RECEBIDO - ${prng.pick(DEMO_PIX_IN_NAMES)}`,
          amountCents: prng.int(5_000, 80_000),
          type: "income",
          categoryHint: "pix-recebido",
        });
      }
    }
  }

  if (accountExternalId === "demo-acc-nuvem-checking" && prng.chance(0.45)) {
    const date = pickDateInMonth(prng, monthStart, 8, 24, today);
    if (date) {
      collector.add({
        accountExternalId,
        date,
        description: `PIX RECEBIDO - ${prng.pick(DEMO_FREELANCE_CLIENTS)}`,
        amountCents: prng.int(80_000, 220_000),
        type: "income",
        categoryHint: "freelance",
      });
    }
  }

  const pixOutCount = prng.int(1, 2);
  for (let index = 0; index < pixOutCount; index += 1) {
    const date = pickDateInMonth(prng, monthStart, 2, 27, today);
    if (!date) continue;
    collector.add({
      accountExternalId,
      date,
      description: `PIX ENVIADO - ${prng.pick(DEMO_PIX_OUT_NAMES)}`,
      amountCents: -prng.int(3_000, 45_000),
      type: "expense",
      categoryHint: "transferencias",
    });
  }
}

interface CardCycle {
  index: number;
  closing: Date;
  due: Date;
  start: Date;
  end: Date;
  billExternalId: string;
}

function dueDateForClosing(closing: Date, closingDay: number, dueDay: number): Date {
  const base = dueDay <= closingDay ? addUtcMonthsKeepingDay(closing, 1) : closing;
  return dayInUtcMonth(base, dueDay);
}

function buildCardCycles(card: DemoCardConfig, today: Date): CardCycle[] {
  let openClosing = dayInUtcMonth(today, card.closingDay);
  if (isoDate(openClosing) <= isoDate(today)) {
    openClosing = dayInUtcMonth(addUtcMonthsKeepingDay(openClosing, 1), card.closingDay);
  }

  const cycles: CardCycle[] = [];
  for (let index = 0; index < 7; index += 1) {
    const closing = dayInUtcMonth(addUtcMonthsKeepingDay(openClosing, index - 6), card.closingDay);
    const due = dueDateForClosing(closing, card.closingDay, card.dueDay);
    const previousClosing = dayInUtcMonth(addUtcMonthsKeepingDay(closing, -1), card.closingDay);
    const start = addUtcDays(previousClosing, 1);
    const end = minUtcDate(closing, today);
    cycles.push({
      index,
      closing,
      due,
      start,
      end,
      billExternalId: `demo-bill-${card.key}-${closing.getUTCFullYear()}${String(
        closing.getUTCMonth() + 1,
      ).padStart(2, "0")}`,
    });
  }
  return cycles;
}

function splitInstallmentCents(
  totalCents: number,
  totalInstallments: number,
  installmentNumber: number,
): number {
  const base = Math.floor(totalCents / totalInstallments);
  const remainder = totalCents - base * totalInstallments;
  return base + (installmentNumber <= remainder ? 1 : 0);
}

function generateCards(
  today: Date,
  prng: Prng,
  collector: TransactionCollector,
  accountsByExternalId: ReadonlyMap<string, DemoAccountConfig>,
): {
  bills: ProviderBill[];
  creditCards: ProviderCreditCard[];
  cardOwedCents: Map<string, number>;
} {
  const bills: ProviderBill[] = [];
  const creditCards: ProviderCreditCard[] = [];
  const cardOwedCents = new Map<string, number>();
  const todayIso = isoDate(today);
  const purchaseMerchants = merchantsForCategories(CARD_PURCHASE_CATEGORIES);

  for (const card of DEMO_CARDS) {
    const cycles = buildCardCycles(card, today);
    let owed = 0;

    for (const cycle of cycles) {
      let billTotal = 0;

      if (isoDate(cycle.start) <= isoDate(cycle.end)) {
        const purchaseCount = prng.int(3, 6);
        for (let index = 0; index < purchaseCount; index += 1) {
          const date = pickDateBetween(prng, cycle.start, cycle.end);
          if (!date) continue;
          addCardPurchase(card, cycle, date, today, prng, collector, purchaseMerchants, (cents) => {
            billTotal += cents;
          });
        }
      }

      for (const plan of card.installmentPlans) {
        const installmentNumber = cycle.index - plan.startBillOffset + 1;
        if (installmentNumber < 1 || installmentNumber > plan.installments) continue;
        const amount = splitInstallmentCents(plan.totalCents, plan.installments, installmentNumber);
        const date = pickDateBetween(prng, cycle.start, cycle.end);
        if (!date) continue;
        collector.add({
          accountExternalId: card.externalId,
          date,
          description: `${plan.description} - Parcela ${installmentNumber}/${plan.installments}`,
          amountCents: -amount,
          type: "expense",
          categoryHint: plan.category,
          billExternalId: cycle.billExternalId,
          installmentNumber,
          totalInstallments: plan.installments,
        });
        billTotal += amount;
      }

      const closed = cycle.index < 6;
      const alreadyDue = isoDate(cycle.due) <= todayIso;
      const leaveUnpaid = card.leaveLatestClosedUnpaid && cycle.index === 5;
      const paid = closed && alreadyDue && !leaveUnpaid;

      const status = deriveBillStatus({
        dueDate: isoDate(cycle.due),
        closingDate: isoDate(cycle.closing),
        totalCents: billTotal,
        paidCents: paid ? billTotal : 0,
        today: todayIso,
      });

      if (status !== "paid") owed += billTotal;

      bills.push({
        externalId: cycle.billExternalId,
        accountExternalId: card.externalId,
        dueDate: isoDate(cycle.due),
        closingDate: isoDate(cycle.closing),
        totalCents: billTotal,
        minimumPaymentCents: Math.round(billTotal * 0.1),
        currency: "BRL",
        status,
      });

      if (paid) {
        const payingAccount = accountsByExternalId.get(card.payingAccountExternalId);
        if (payingAccount) {
          const description = `PAGAMENTO FATURA CARTAO - ${card.accountName.toUpperCase()}`;
          collector.add({
            accountExternalId: payingAccount.externalId,
            date: cycle.due,
            description,
            amountCents: -billTotal,
            type: "transfer",
            categoryHint: "transferencias",
          });
          collector.add({
            accountExternalId: card.externalId,
            date: cycle.due,
            description,
            amountCents: billTotal,
            type: "transfer",
            categoryHint: "transferencias",
          });
        }
      }
    }

    cardOwedCents.set(card.externalId, owed);
    creditCards.push({
      accountExternalId: card.externalId,
      brand: card.brand,
      level: card.level,
      limitCents: card.limitCents,
      availableLimitCents: card.limitCents - owed,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      currency: "BRL",
    });
  }

  // `months` existe para deixar explícito que as faturas dos cartões cobrem o
  // mesmo horizonte do extrato; nenhuma transação de cartão é gerada fora das
  // 7 faturas.
  return { bills, creditCards, cardOwedCents };
}

function addCardPurchase(
  card: DemoCardConfig,
  cycle: CardCycle,
  date: Date,
  today: Date,
  prng: Prng,
  collector: TransactionCollector,
  merchants: readonly DemoMerchant[],
  addToBill: (cents: number) => void,
): void {
  const merchant = prng.pick(merchants);
  const amount = prng.int(merchant.minCents, merchant.maxCents);
  const pending =
    date.getTime() >= addUtcDays(today, -3).getTime() && prng.chance(0.3) ? "pending" : "posted";
  collector.add({
    accountExternalId: card.externalId,
    date,
    description: merchant.description,
    amountCents: -amount,
    type: "expense",
    status: pending,
    categoryHint: merchant.category,
    billExternalId: cycle.billExternalId,
  });
  addToBill(amount);
}

function addSavingsYields(
  months: readonly Date[],
  today: Date,
  collector: TransactionCollector,
): void {
  for (const account of DEMO_ACCOUNTS) {
    if (account.kind !== "savings") continue;
    const rate = SAVINGS_YIELD_RATE[account.externalId];
    if (rate === undefined) continue;

    let running = DEMO_OPENING_BALANCES_CENTS[account.externalId] ?? 0;
    const todayIso = isoDate(today);
    for (const monthStart of months) {
      const monthEnd = dayInUtcMonth(
        monthStart,
        daysInUtcMonth(monthStart.getUTCFullYear(), monthStart.getUTCMonth()),
      );
      const monthStartIso = isoDate(monthStart);
      const monthEndIso = isoDate(monthEnd);

      for (const draft of collector.drafts) {
        if (draft.accountExternalId !== account.externalId) continue;
        if (draft.status !== "posted") continue;
        if (draft.date < monthStartIso || draft.date > monthEndIso) continue;
        running += draft.amountCents;
      }

      if (monthEndIso <= todayIso) {
        const yieldCents = Math.max(1, Math.round(running * rate));
        collector.add({
          accountExternalId: account.externalId,
          date: monthEnd,
          description: "RENDIMENTO DA POUPANCA",
          amountCents: yieldCents,
          type: "income",
          categoryHint: "rendimentos",
        });
        running += yieldCents;
      }
    }
  }
}
