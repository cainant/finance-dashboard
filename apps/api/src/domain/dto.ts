/**
 * Mapeamento de linhas do D1 para os DTOs de `@fd/contracts`.
 *
 * Nenhum campo interno (ex.: `category_source`, `password_hash`) vaza para a
 * API. Valores monetários já são inteiros em centavos no banco.
 */
import type {
  Account as AccountRow,
  Bill as BillRow,
  Category as CategoryRow,
  Connection as ConnectionRow,
  CreditCard as CreditCardRow,
  Institution as InstitutionRow,
  Investment as InvestmentRow,
  SyncRun as SyncRunRow,
  Transaction as TransactionRow,
  User as UserRow,
} from "@fd/database";
import type {
  Account,
  AccountSummary,
  Bill,
  Category,
  Connection,
  CreditCard,
  Investment,
  SyncRun,
  Transaction,
  UpcomingBill,
  User,
} from "@fd/contracts";
import type { ProviderId } from "@fd/financial-providers";

import { toApiUser } from "../auth/sessions";
import { billStatusOnDate } from "./bills";

export { toApiUser };

const BRL = "BRL" as const;

export function institutionDto(row: InstitutionRow) {
  return {
    id: row.id,
    provider: row.provider as ProviderId,
    externalId: row.externalId,
    name: row.name,
    logoUrl: row.logoUrl,
    primaryColor: row.primaryColor,
    type: row.type,
  };
}

export function accountDto(row: AccountRow, provider?: ProviderId): Account {
  return {
    id: row.id,
    userId: row.userId,
    connectionId: row.connectionId,
    externalId: row.externalId,
    type: row.type,
    subtype: row.subtype,
    name: row.name,
    numberMasked: row.numberMasked,
    currency: BRL,
    balanceCents: row.balanceCents,
    availableCents: row.availableCents,
    updatedAt: row.updatedAt,
    ...(provider ? { provider } : {}),
    ...(row.institutionName ? { institutionName: row.institutionName } : {}),
  };
}

export function accountSummaryDto(
  row: AccountRow,
  provider: ProviderId,
  institution?: InstitutionRow | null,
): AccountSummary {
  return {
    id: row.id,
    name: row.name,
    numberMasked: row.numberMasked,
    currency: BRL,
    balanceCents: row.balanceCents,
    availableCents: row.availableCents,
    provider,
    institutionName: row.institutionName ?? institution?.name ?? null,
    institutionLogoUrl: institution?.logoUrl ?? null,
  };
}

export function categoryDto(row: CategoryRow): Category {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    color: row.color,
    kind: row.kind,
    parentId: row.parentId,
  };
}

export function transactionDto(
  row: TransactionRow,
  extras: {
    category?: CategoryRow | null;
    account?: { row: AccountRow; provider: ProviderId; institution?: InstitutionRow | null };
  } = {},
): Transaction {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    connectionId: row.connectionId,
    externalId: row.externalId,
    date: row.date,
    description: row.description,
    amountCents: row.amountCents,
    currency: BRL,
    type: row.type,
    categoryId: row.categoryId,
    status: row.status,
    billId: row.billId,
    merchant: row.merchant,
    notes: row.notes,
    installmentNumber: row.installmentNumber,
    totalInstallments: row.totalInstallments,
    budgetGroupId: row.budgetGroupId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(extras.category !== undefined
      ? { category: extras.category ? categoryDto(extras.category) : null }
      : {}),
    ...(extras.account
      ? {
          account: accountSummaryDto(
            extras.account.row,
            extras.account.provider,
            extras.account.institution,
          ),
        }
      : {}),
  };
}

export function billDto(row: BillRow, today?: string): Bill {
  return {
    id: row.id,
    accountId: row.accountId,
    externalId: row.externalId,
    dueDate: row.dueDate,
    closingDate: row.closingDate,
    totalCents: row.totalCents,
    minimumPaymentCents: row.minimumPaymentCents,
    status: billStatusOnDate(row, today),
  };
}

export function upcomingBillDto(
  row: BillRow & { accountName: string; brand: string | null },
  today: string,
): UpcomingBill {
  return {
    ...billDto(row, today),
    accountName: row.accountName,
    creditCardBrand: row.brand,
    daysUntilDue: diffDays(today, row.dueDate),
    /** Fatura sincronizada do provider: só a derivada marca `estimated`. */
    estimated: false,
  };
}

export function creditCardDto(
  row: CreditCardRow,
  account: AccountRow,
  provider: ProviderId,
  institution?: InstitutionRow | null,
  /** Fallback do fechamento derivado das faturas quando o provider omite. */
  derivedClosingDay: number | null = null,
): CreditCard {
  return {
    accountId: row.accountId,
    brand: row.brand,
    level: row.level,
    limitCents: row.limitCents,
    availableLimitCents: row.availableLimitCents,
    closingDay: row.closingDay ?? derivedClosingDay,
    dueDay: row.dueDay,
    account: accountSummaryDto(account, provider, institution),
  };
}

export function investmentDto(
  row: InvestmentRow,
  provider?: ProviderId,
  institution?: InstitutionRow | null,
): Investment {
  return {
    id: row.id,
    userId: row.userId,
    connectionId: row.connectionId,
    externalId: row.externalId,
    type: row.type,
    name: row.name,
    balanceCents: row.balanceCents,
    amountProfitCents: row.amountProfitCents,
    currency: BRL,
    updatedAt: row.updatedAt,
    ...(provider ? { provider } : {}),
    ...(institution !== undefined
      ? { institution: institution ? institutionDto(institution) : null }
      : {}),
  };
}

export function connectionDto(row: ConnectionRow, institution?: InstitutionRow | null): Connection {
  return {
    id: row.id,
    provider: row.provider as ProviderId,
    externalId: row.externalId,
    institutionId: row.institutionId,
    status: row.status,
    statusDetail: row.statusDetail,
    lastSyncedAt: row.lastSyncedAt,
    providerUpdatedAt: row.providerUpdatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    consentExpiresAt: row.consentExpiresAt,
    ...(institution !== undefined
      ? { institution: institution ? institutionDto(institution) : null }
      : {}),
  };
}

export function syncRunDto(row: SyncRunRow): SyncRun {
  return {
    id: row.id,
    connectionId: row.connectionId,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    status: row.status,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    stats: parseStats(row.statsJson),
  };
}

function parseStats(value: string | null): SyncRun["stats"] {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    // Filtra chaves internas (ex.: `_pending` de cursor) do contrato público.
    const source = parsed as Record<string, unknown>;
    const stats: NonNullable<SyncRun["stats"]> = {};
    for (const key of [
      "accounts",
      "transactions",
      "bills",
      "investments",
      "balanceSnapshots",
    ] as const) {
      const count = source[key];
      if (typeof count === "number" && Number.isInteger(count) && count >= 0) {
        stats[key] = count;
      }
    }
    return stats;
  } catch {
    return null;
  }
}

function diffDays(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

export type UserDto = User;
export type UserRowLike = UserRow;
