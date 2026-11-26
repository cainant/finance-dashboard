/**
 * Schema Drizzle (SQLite/D1) do Finance Dashboard.
 *
 * Colunas em camelCase no TypeScript e snake_case no SQL. Dinheiro sempre em
 * centavos (`integer`); datas e timestamps como `text` ISO 8601.
 *
 * Fonte da verdade: docs/architecture.md (seção "Modelo de dados (D1 / Drizzle)").
 */
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

const nowIso = (): string => new Date().toISOString();

/** Tipos de conta financeira. */
export const accountTypes = ["checking", "savings", "credit_card", "investment", "other"] as const;
export type AccountType = (typeof accountTypes)[number];

/** Status da conexão com o provider. */
export const connectionStatuses = [
  "active",
  "syncing",
  "error",
  "login_required",
  "outdated",
  "disconnected",
] as const;
export type ConnectionStatus = (typeof connectionStatuses)[number];

/** Natureza de categoria/transação. */
export const transactionTypes = ["income", "expense", "transfer"] as const;
export type TransactionType = (typeof transactionTypes)[number];

/** Status de transação. */
export const transactionStatuses = ["posted", "pending"] as const;
export type TransactionStatus = (typeof transactionStatuses)[number];

/** Status derivado de fatura (Pluggy não envia; derivar por datas/pagamentos). */
export const billStatuses = ["open", "closed", "paid", "overdue"] as const;
export type BillStatus = (typeof billStatuses)[number];

/** Tipos de investimento. */
export const investmentTypes = [
  "fixed_income",
  "fund",
  "equity",
  "etf",
  "security",
  "other",
] as const;
export type InvestmentType = (typeof investmentTypes)[number];

/** Status de execução de sincronização. */
export const syncRunStatuses = ["running", "success", "error"] as const;
export type SyncRunStatus = (typeof syncRunStatuses)[number];

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  githubLogin: text("github_login").unique(),
  avatarUrl: text("avatar_url"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => nowIso()),
});

export const sessions = sqliteTable("sessions", {
  /** SHA-256 (hex) do token de sessão — o token em si nunca é persistido. */
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => nowIso()),
  userAgent: text("user_agent"),
});

export const institutions = sqliteTable(
  "institutions",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    primaryColor: text("primary_color"),
    type: text("type"),
  },
  (table) => [
    uniqueIndex("institutions_provider_external_id_unique").on(table.provider, table.externalId),
  ],
);

export const connections = sqliteTable("connections", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  institutionId: text("institution_id").references(() => institutions.id, { onDelete: "set null" }),
  status: text("status", { enum: connectionStatuses }).notNull(),
  statusDetail: text("status_detail"),
  lastSyncedAt: text("last_synced_at"),
  /**
   * Quando o provider atualizou o item pela última vez (`Item.lastUpdatedAt`
   * no Pluggy), ISO-8601 UTC. É o frescor do dado, separado de
   * `last_synced_at`, que registra quando o Lumen leu.
   */
  providerUpdatedAt: text("provider_updated_at"),
  /** Consentimento Open Finance (MeuPluggy: 1 ano), ISO-8601 UTC. */
  consentExpiresAt: text("consent_expires_at"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => nowIso()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => nowIso()),
});

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    type: text("type", { enum: accountTypes }).notNull(),
    subtype: text("subtype"),
    name: text("name").notNull(),
    numberMasked: text("number_masked"),
    /** Instituição da própria conta (MeuPluggy pode trazer bancos diferentes). */
    institutionName: text("institution_name"),
    currency: text("currency").notNull().default("BRL"),
    balanceCents: integer("balance_cents").notNull(),
    availableCents: integer("available_cents"),
    /** Convenção de sinal de cartão detectada (ver AmountSignConvention). */
    amountSignConvention: text("amount_sign_convention"),
    /** Quando o histórico inicial desta conta terminou de ser importado. */
    historySyncedAt: text("history_synced_at"),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => nowIso()),
  },
  (table) => [
    uniqueIndex("accounts_connection_external_id_unique").on(table.connectionId, table.externalId),
  ],
);

export const creditCards = sqliteTable("credit_cards", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  brand: text("brand"),
  level: text("level"),
  limitCents: integer("limit_cents"),
  availableLimitCents: integer("available_limit_cents"),
  closingDay: integer("closing_day"),
  dueDay: integer("due_day"),
});

export const bills = sqliteTable(
  "bills",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    dueDate: text("due_date").notNull(),
    closingDate: text("closing_date"),
    totalCents: integer("total_cents").notNull(),
    minimumPaymentCents: integer("minimum_payment_cents"),
    status: text("status", { enum: billStatuses }).notNull(),
  },
  (table) => [
    uniqueIndex("bills_account_external_id_unique").on(table.accountId, table.externalId),
  ],
);

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  /** `null` = categoria de sistema, compartilhada por todos os usuários. */
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  /** Nome do ícone Lucide (ex.: "ShoppingCart"). */
  icon: text("icon").notNull(),
  color: text("color").notNull(),
  kind: text("kind", { enum: transactionTypes }).notNull(),
  parentId: text("parent_id").references((): AnySQLiteColumn => categories.id, {
    onDelete: "set null",
  }),
});

/**
 * Grupo de metas do orçamento (ex.: "Custos Fixos"). A meta é um percentual da
 * renda de referência em pontos-base (`2500` = 25%); o valor em R$ é derivado.
 */
export const budgetGroups = sqliteTable(
  "budget_groups",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    targetBps: integer("target_bps").notNull().default(0),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => nowIso()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => nowIso()),
  },
  (table) => [index("budget_groups_user_id_idx").on(table.userId)],
);

/** Grupo padrão de cada categoria, por usuário (categorias de sistema são compartilhadas). */
export const budgetCategoryGroups = sqliteTable(
  "budget_category_groups",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => budgetGroups.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.categoryId] })],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    date: text("date").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("BRL"),
    type: text("type", { enum: transactionTypes }).notNull(),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    /**
     * Origem da categoria: `provider` = dica do provider aplicada pelo sync;
     * `user` = editada manualmente (`PATCH /api/transactions/:id`). O sync nunca
     * sobrescreve uma categoria com `category_source = 'user'`.
     */
    categorySource: text("category_source", { enum: ["provider", "user"] })
      .notNull()
      .default("provider"),
    status: text("status", { enum: transactionStatuses }).notNull(),
    billId: text("bill_id").references(() => bills.id, { onDelete: "set null" }),
    merchant: text("merchant"),
    notes: text("notes"),
    /** Parcela de compra no cartão (`3` de `10`); `null` quando à vista ou desconhecido. */
    installmentNumber: integer("installment_number"),
    totalInstallments: integer("total_installments"),
    /**
     * Exceção manual do grupo de metas. `null` = usa o grupo da categoria
     * (`budget_category_groups`). O sync nunca escreve esta coluna.
     */
    budgetGroupId: text("budget_group_id").references(() => budgetGroups.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => nowIso()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => nowIso()),
  },
  (table) => [
    uniqueIndex("transactions_account_external_id_unique").on(table.accountId, table.externalId),
    index("transactions_user_id_date_idx").on(table.userId, table.date),
    index("transactions_account_id_date_idx").on(table.accountId, table.date),
    index("transactions_category_id_idx").on(table.categoryId),
  ],
);

export const balanceSnapshots = sqliteTable(
  "balance_snapshots",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    balanceCents: integer("balance_cents").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.date] })],
);

export const syncRuns = sqliteTable("sync_runs", {
  id: text("id").primaryKey(),
  connectionId: text("connection_id")
    .notNull()
    .references(() => connections.id, { onDelete: "cascade" }),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  status: text("status", { enum: syncRunStatuses }).notNull(),
  errorCode: text("error_code"),
  /** Mensagem sem dados financeiros/pessoais. */
  errorMessage: text("error_message"),
  statsJson: text("stats_json"),
});

export const investments = sqliteTable(
  "investments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    type: text("type", { enum: investmentTypes }).notNull(),
    name: text("name").notNull(),
    balanceCents: integer("balance_cents").notNull(),
    amountProfitCents: integer("amount_profit_cents"),
    currency: text("currency").notNull().default("BRL"),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => nowIso()),
  },
  (table) => [
    uniqueIndex("investments_connection_external_id_unique").on(
      table.connectionId,
      table.externalId,
    ),
  ],
);

/** Modos de pagamento de cartão (ver `@fd/contracts` `cardPaymentModes`). */
export const cardPaymentModes = ["pay_on_due", "reserve"] as const;

/**
 * Como o usuário paga cada cartão. Sem linha = `pay_on_due`. No modo `reserve`
 * o dinheiro fica numa conta **ou** num investimento (no máximo um).
 */
export const cardPaymentPlans = sqliteTable(
  "card_payment_plans",
  {
    accountId: text("account_id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: cardPaymentModes }).notNull().default("pay_on_due"),
    reserveAccountId: text("reserve_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    reserveInvestmentId: text("reserve_investment_id").references(() => investments.id, {
      onDelete: "set null",
    }),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => nowIso()),
  },
  (table) => [index("card_payment_plans_user_id_idx").on(table.userId)],
);

export const settings = sqliteTable(
  "settings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueJson: text("value_json").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })],
);

export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    /** Chave do rate limit (ex.: e-mail normalizado ou IP). */
    key: text("key").notNull(),
    attemptedAt: text("attempted_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.key, table.attemptedAt] })],
);

export const schema = {
  users,
  sessions,
  institutions,
  connections,
  accounts,
  creditCards,
  bills,
  categories,
  transactions,
  balanceSnapshots,
  syncRuns,
  investments,
  settings,
  budgetGroups,
  budgetCategoryGroups,
  cardPaymentPlans,
  loginAttempts,
};

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Institution = typeof institutions.$inferSelect;
export type NewInstitution = typeof institutions.$inferInsert;

export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type CreditCard = typeof creditCards.$inferSelect;
export type NewCreditCard = typeof creditCards.$inferInsert;

export type Bill = typeof bills.$inferSelect;
export type NewBill = typeof bills.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type BalanceSnapshot = typeof balanceSnapshots.$inferSelect;
export type NewBalanceSnapshot = typeof balanceSnapshots.$inferInsert;

export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;

export type Investment = typeof investments.$inferSelect;
export type NewInvestment = typeof investments.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type BudgetGroup = typeof budgetGroups.$inferSelect;
export type NewBudgetGroup = typeof budgetGroups.$inferInsert;
export type BudgetCategoryGroup = typeof budgetCategoryGroups.$inferSelect;
export type CardPaymentPlan = typeof cardPaymentPlans.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;
