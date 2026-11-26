/**
 * Fixtures dos testes de integração.
 *
 * Inserem linhas financeiras fake direto no D1 via Drizzle (mesmo `db` dos
 * helpers), sem passar pelos providers, para que cada teste controle
 * exatamente os valores que as rotas agregam. Dinheiro sempre em centavos e
 * datas civis em `YYYY-MM-DD`.
 */
import type {
  AccountType,
  BillStatus,
  ConnectionStatus,
  InvestmentType,
  ProviderId,
  TransactionStatus,
  TransactionType,
} from "@fd/contracts";
import type {
  Account as AccountRow,
  Bill as BillRow,
  Category as CategoryRow,
  Connection as ConnectionRow,
  CreditCard as CreditCardRow,
  Institution as InstitutionRow,
  Investment as InvestmentRow,
  Transaction as TransactionRow,
} from "@fd/database";
import {
  accounts,
  balanceSnapshots,
  bills,
  categories,
  connections,
  creditCards,
  institutions,
  investments,
  transactions,
} from "@fd/database/schema";
import { eq } from "drizzle-orm";

import { db } from "./helpers";

function newId(): string {
  return crypto.randomUUID();
}

/** Slug local (independente do `domain/slug` da API) para os seeds. */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function required<T>(row: T | undefined, entity: string): T {
  if (!row) throw new Error(`Falha ao inserir fixture de ${entity}`);
  return row;
}

/* -------------------------------------------------------------------------- */
/* Instituições e conexões                                                    */
/* -------------------------------------------------------------------------- */

export interface InstitutionFixtureInput {
  provider: ProviderId;
  name: string;
  externalId?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  type?: string | null;
}

export async function createInstitution(input: InstitutionFixtureInput): Promise<InstitutionRow> {
  const [row] = await db
    .insert(institutions)
    .values({
      id: newId(),
      provider: input.provider,
      externalId: input.externalId ?? newId(),
      name: input.name,
      logoUrl: input.logoUrl ?? null,
      primaryColor: input.primaryColor ?? null,
      type: input.type ?? "bank",
    })
    .returning();
  return required(row, "instituição");
}

export interface ConnectionFixtureInput {
  userId: string;
  provider: ProviderId;
  externalId?: string;
  institutionId?: string | null;
  status?: ConnectionStatus;
  statusDetail?: string | null;
  lastSyncedAt?: string | null;
  providerUpdatedAt?: string | null;
}

export async function createConnection(input: ConnectionFixtureInput): Promise<ConnectionRow> {
  const [row] = await db
    .insert(connections)
    .values({
      id: newId(),
      userId: input.userId,
      provider: input.provider,
      externalId: input.externalId ?? newId(),
      institutionId: input.institutionId ?? null,
      status: input.status ?? "active",
      statusDetail: input.statusDetail ?? null,
      lastSyncedAt: input.lastSyncedAt ?? null,
      providerUpdatedAt: input.providerUpdatedAt ?? null,
    })
    .returning();
  return required(row, "conexão");
}

/* -------------------------------------------------------------------------- */
/* Contas, cartões, faturas                                                   */
/* -------------------------------------------------------------------------- */

export interface AccountFixtureInput {
  userId: string;
  connectionId: string;
  type?: AccountType;
  name?: string;
  externalId?: string;
  subtype?: string | null;
  numberMasked?: string | null;
  balanceCents: number;
  availableCents?: number | null;
  historySyncedAt?: string | null;
}

export async function createAccount(input: AccountFixtureInput): Promise<AccountRow> {
  const [row] = await db
    .insert(accounts)
    .values({
      id: newId(),
      userId: input.userId,
      connectionId: input.connectionId,
      externalId: input.externalId ?? newId(),
      type: input.type ?? "checking",
      subtype: input.subtype ?? null,
      name: input.name ?? "Conta Corrente",
      numberMasked: input.numberMasked ?? null,
      currency: "BRL",
      balanceCents: input.balanceCents,
      availableCents: input.availableCents ?? null,
      historySyncedAt: input.historySyncedAt ?? null,
    })
    .returning();
  return required(row, "conta");
}

export interface CreditCardFixtureInput {
  accountId: string;
  brand?: string | null;
  level?: string | null;
  limitCents?: number | null;
  availableLimitCents?: number | null;
  closingDay?: number | null;
  dueDay?: number | null;
}

export async function createCreditCard(input: CreditCardFixtureInput): Promise<CreditCardRow> {
  const [row] = await db
    .insert(creditCards)
    .values({
      accountId: input.accountId,
      brand: input.brand ?? "VISA",
      level: input.level ?? "PLATINUM",
      limitCents: input.limitCents ?? null,
      availableLimitCents: input.availableLimitCents ?? null,
      closingDay: input.closingDay ?? null,
      dueDay: input.dueDay ?? null,
    })
    .returning();
  return required(row, "cartão");
}

export interface BillFixtureInput {
  accountId: string;
  dueDate: string;
  totalCents: number;
  externalId?: string;
  closingDate?: string | null;
  minimumPaymentCents?: number | null;
  status?: BillStatus;
}

export async function createBill(input: BillFixtureInput): Promise<BillRow> {
  const [row] = await db
    .insert(bills)
    .values({
      id: newId(),
      accountId: input.accountId,
      externalId: input.externalId ?? newId(),
      dueDate: input.dueDate,
      closingDate: input.closingDate ?? null,
      totalCents: input.totalCents,
      minimumPaymentCents: input.minimumPaymentCents ?? null,
      status: input.status ?? "open",
    })
    .returning();
  return required(row, "fatura");
}

/* -------------------------------------------------------------------------- */
/* Categorias e transações                                                    */
/* -------------------------------------------------------------------------- */

export interface CategoryFixtureInput {
  /** `null` = categoria de sistema (compartilhada por todos os usuários). */
  userId: string | null;
  name: string;
  kind: TransactionType;
  slug?: string;
  icon?: string;
  color?: string;
  parentId?: string | null;
}

export async function createCategory(input: CategoryFixtureInput): Promise<CategoryRow> {
  const [row] = await db
    .insert(categories)
    .values({
      id: newId(),
      userId: input.userId,
      name: input.name,
      slug: input.slug ?? slugify(input.name),
      icon: input.icon ?? "CircleHelp",
      color: input.color ?? "#71717a",
      kind: input.kind,
      parentId: input.parentId ?? null,
    })
    .returning();
  return required(row, "categoria");
}

export interface TransactionFixtureInput {
  userId: string;
  accountId: string;
  connectionId: string;
  date: string;
  description: string;
  amountCents: number;
  externalId?: string;
  /** Default: derivado do sinal (`amountCents < 0` = `expense`). */
  type?: TransactionType;
  status?: TransactionStatus;
  categoryId?: string | null;
  categorySource?: "provider" | "user";
  billId?: string | null;
  merchant?: string | null;
  notes?: string | null;
}

export async function createTransaction(input: TransactionFixtureInput): Promise<TransactionRow> {
  const [row] = await db
    .insert(transactions)
    .values({
      id: newId(),
      userId: input.userId,
      accountId: input.accountId,
      connectionId: input.connectionId,
      externalId: input.externalId ?? newId(),
      date: input.date,
      description: input.description,
      amountCents: input.amountCents,
      currency: "BRL",
      type: input.type ?? (input.amountCents < 0 ? "expense" : "income"),
      categoryId: input.categoryId ?? null,
      categorySource: input.categorySource ?? "provider",
      status: input.status ?? "posted",
      billId: input.billId ?? null,
      merchant: input.merchant ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return required(row, "transação");
}

/* -------------------------------------------------------------------------- */
/* Snapshots, investimentos e settings                                        */
/* -------------------------------------------------------------------------- */

export interface BalanceSnapshotFixtureInput {
  accountId: string;
  date: string;
  balanceCents: number;
}

export async function createBalanceSnapshot(input: BalanceSnapshotFixtureInput): Promise<void> {
  await db.insert(balanceSnapshots).values({
    accountId: input.accountId,
    date: input.date,
    balanceCents: input.balanceCents,
  });
}

export interface InvestmentFixtureInput {
  userId: string;
  connectionId: string;
  name: string;
  balanceCents: number;
  externalId?: string;
  type?: InvestmentType;
  amountProfitCents?: number | null;
}

export async function createInvestment(input: InvestmentFixtureInput): Promise<InvestmentRow> {
  const [row] = await db
    .insert(investments)
    .values({
      id: newId(),
      userId: input.userId,
      connectionId: input.connectionId,
      externalId: input.externalId ?? newId(),
      type: input.type ?? "fixed_income",
      name: input.name,
      balanceCents: input.balanceCents,
      amountProfitCents: input.amountProfitCents ?? null,
      currency: "BRL",
    })
    .returning();
  return required(row, "investimento");
}

/* -------------------------------------------------------------------------- */
/* Consultas de apoio                                                         */
/* -------------------------------------------------------------------------- */

/** Relê uma transação direto do D1 (para conferir colunas fora do DTO). */
export async function readTransaction(id: string): Promise<TransactionRow | undefined> {
  const [row] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  return row;
}
