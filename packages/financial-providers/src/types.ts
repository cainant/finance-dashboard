import type { ProviderCategoryHint } from "./categories";

/**
 * Contrato normalizado de providers financeiros do Lumen Finance.
 *
 * Regras (ver `docs/architecture.md`):
 * - dinheiro sempre inteiro em centavos (`amountCents`), moeda ISO 4217;
 * - sinal: positivo = entrada, negativo = saída;
 * - datas: `YYYY-MM-DD` para datas e ISO-8601 UTC para timestamps;
 * - nada de tipos do fornecedor vazando para fora do pacote.
 *
 * O pacote roda em Cloudflare Workers: apenas `fetch`, `AbortSignal`,
 * `setTimeout` e WebCrypto. Não há dependência de Node, Drizzle ou
 * `@fd/contracts`.
 */
export const PROVIDER_IDS = ["demo", "pluggy"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ProviderConnectionStatus =
  "active" | "syncing" | "error" | "login_required" | "outdated" | "disconnected";

export type ProviderInstitutionType = "bank" | "digital_bank" | "credit_union" | "broker" | "other";

export interface ProviderCapabilities {
  /** `PATCH /items/:id` / "sincronizar agora". */
  supportsManualRefresh: boolean;
  /** O provider envia webhooks para a API. */
  supportsWebhooks: boolean;
  supportsCreditCards: boolean;
  supportsInvestments: boolean;
}

export interface ProviderInstitution {
  /** ID estável dentro do provider (ex.: id numérico do conector Pluggy). */
  externalId: string;
  name: string;
  logoUrl?: string;
  /** Hex com `#`, ex.: `"#2563eb"`. */
  primaryColor?: string;
  type: ProviderInstitutionType;
}

export interface ProviderConnection {
  externalId: string;
  provider: ProviderId;
  status: ProviderConnectionStatus;
  /** Diagnóstico curto e sem dados sensíveis (ex.: `"PARTIAL_SUCCESS"`). */
  statusDetail?: string;
  institution: ProviderInstitution;
  /** Última sincronização concluída no fornecedor (ISO-8601 UTC). */
  lastSyncedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Consentimento Open Finance; `null`/ausente quando não se aplica. */
  consentExpiresAt?: string | null;
}

export type ProviderAccountType = "checking" | "savings" | "credit_card" | "investment" | "other";

/**
 * Convenção de sinal de uma conta de cartão:
 * - `purchase_negative`: compras têm `amount` negativo (sandbox/Pluggy Bank);
 * - `purchase_positive`: compras têm `amount` positivo (documentação/Open Finance).
 * O sinal do pagamento de fatura é o oposto.
 */
export type AmountSignConvention = "purchase_negative" | "purchase_positive";

/**
 * Conta normalizada.
 *
 * Em conta de cartão (`type: "credit_card"`), `balanceCents` segue a convenção
 * do Open Finance: valor **devido** (positivo = dívida), não saldo em conta.
 * `availableCents` é o limite disponível.
 */
export interface ProviderAccount {
  externalId: string;
  connectionExternalId: string;
  type: ProviderAccountType;
  /** Subtype cru do fornecedor (`CHECKING_ACCOUNT`, `CREDIT_CARD`, ...). */
  subtype?: string | null;
  name: string;
  numberMasked?: string | null;
  /** Instituição da conta quando difere do item (ex.: MeuPluggy multi-banco). */
  institutionName?: string | null;
  currency: string;
  balanceCents: number;
  availableCents?: number | null;
  updatedAt?: string;
}

export interface ProviderCreditCard {
  accountExternalId: string;
  brand?: string | null;
  level?: string | null;
  limitCents?: number | null;
  availableLimitCents?: number | null;
  /** Dia do mês (1–31). */
  closingDay?: number | null;
  /** Dia do mês (1–31). */
  dueDay?: number | null;
  currency: string;
}

export type ProviderBillStatus = "open" | "closed" | "paid" | "overdue";

/**
 * Fatura normalizada. O fornecedor não envia `status`; o provider deriva a
 * partir de datas e pagamentos (`deriveBillStatus`).
 */
export interface ProviderBill {
  externalId: string;
  accountExternalId: string;
  dueDate: string;
  closingDate?: string | null;
  totalCents: number;
  minimumPaymentCents?: number | null;
  currency: string;
  status: ProviderBillStatus;
}

export type ProviderTransactionType = "income" | "expense" | "transfer";
export type ProviderTransactionStatus = "posted" | "pending";

export interface ProviderTransaction {
  externalId: string;
  accountExternalId: string;
  /** `YYYY-MM-DD` no fuso `America/Sao_Paulo`. */
  date: string;
  description: string;
  merchant?: string | null;
  /** Positivo = entrada, negativo = saída (sempre). */
  amountCents: number;
  currency: string;
  type: ProviderTransactionType;
  status: ProviderTransactionStatus;
  /** Sugestão de categoria de sistema; ver `PROVIDER_CATEGORY_HINTS`. */
  categoryHint: ProviderCategoryHint;
  billExternalId?: string | null;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  /** Código do fornecedor útil para reconciliar transações recriadas. */
  providerCode?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProviderBalance {
  accountExternalId: string;
  balanceCents: number;
  availableCents?: number | null;
  currency: string;
  updatedAt: string;
}

export type ProviderInvestmentType =
  "fixed_income" | "fund" | "equity" | "etf" | "security" | "other";

export interface ProviderInvestment {
  externalId: string;
  connectionExternalId: string;
  type: ProviderInvestmentType;
  subtype?: string | null;
  name: string;
  balanceCents: number;
  amountProfitCents?: number | null;
  currency: string;
  updatedAt: string;
}

export interface ProviderRequestOptions {
  signal?: AbortSignal;
  /**
   * Teto de páginas para operações paginadas (contas, faturas, investimentos).
   * Protege o orçamento de subrequests do Workers Free. Default do provider.
   */
  maxPages?: number;
}

export interface ProviderTransactionsOptions extends ProviderRequestOptions {
  /** `YYYY-MM-DD`, inclusivo. */
  from: string;
  /** `YYYY-MM-DD`, inclusivo. */
  to: string;
  /**
   * Cursor opaco devolvido por `getTransactionsPage`. O provider traduz para o
   * cursor do fornecedor; não é uma URL/query string.
   */
  cursor?: string | null;
  /** Máximo de páginas nesta chamada (default do provider). */
  maxPages?: number;
  /**
   * Orçamento de subrequests HTTP para esta chamada. Protect o limite de 50
   * subrequests/request do Workers Free.
   */
  requestBudget?: number;
  /** Tipo da conta dona das transações; ajuda no sinal quando o fornecedor não envia `type`. */
  accountType?: "bank" | "credit_card";
  /**
   * Convenção de sinal já persistida para a conta de cartão. Quando presente,
   * só é reavaliada com amostra suficiente (>= 5 lançamentos).
   */
  amountSignConvention?: AmountSignConvention | null;
  /**
   * Nome(s) do titular para reconhecer transferências entre contas próprias
   * (contraparte = titular). Providers que não usam isso (demo) ignoram.
   */
  holderNames?: readonly string[];
}

export interface ProviderTransactionsPage {
  transactions: ProviderTransaction[];
  nextCursor: string | null;
  /**
   * `true` quando a coleta parou por `maxPages`/`requestBudget` e ainda há
   * páginas. O chamador deve persistir `nextCursor` e continuar no próximo
   * ciclo/cron.
   */
  partial: boolean;
  /** Quantas chamadas HTTP foram feitas nesta operação (observabilidade). */
  requestCount: number;
  /**
   * Convenção detectada para conta de cartão que deve ser persistida. `null`
   * quando não houve amostra suficiente ou quando a convenção já persistida
   * continua válida.
   */
  detectedSignConvention?: AmountSignConvention | null;
  /** Tamanho da amostra usada na detecção (para diagnóstico/testes). */
  signConventionSampleSize?: number;
}

export interface ProviderRefreshResult {
  refreshed: boolean;
  /** Motivo curto, sem dados sensíveis (ex.: `"meu_pluggy_reads_only"`). */
  detail?: string;
}

export interface FinancialProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;

  getConnection(externalId: string, opts?: ProviderRequestOptions): Promise<ProviderConnection>;

  getAccounts(
    connectionExternalId: string,
    opts?: ProviderRequestOptions,
  ): Promise<ProviderAccount[]>;

  /**
   * Conveniência sobre `getTransactionsPage`: segue páginas até acabar ou até
   * o orçamento padrão. Para sincronização incremental com continuação entre
   * execuções, use `getTransactionsPage`.
   */
  getTransactions(
    accountExternalId: string,
    opts: ProviderTransactionsOptions,
  ): Promise<ProviderTransaction[]>;

  /**
   * Extensão opcional ao contrato base para paginação com orçamento. Providers
   * que não paginam (demo) podem omitir ou devolver tudo com `partial: false`.
   */
  getTransactionsPage?(
    accountExternalId: string,
    opts: ProviderTransactionsOptions,
  ): Promise<ProviderTransactionsPage>;

  getCreditCards(
    connectionExternalId: string,
    opts?: ProviderRequestOptions,
  ): Promise<ProviderCreditCard[]>;

  getBills(accountExternalId: string, opts?: ProviderRequestOptions): Promise<ProviderBill[]>;

  getBalances(
    connectionExternalId: string,
    opts?: ProviderRequestOptions,
  ): Promise<ProviderBalance[]>;

  getInvestments(
    connectionExternalId: string,
    opts?: ProviderRequestOptions,
  ): Promise<ProviderInvestment[]>;

  /**
   * Remove o item no fornecedor (ex.: `DELETE /items/:id` no Pluggy).
   * Opcional: nem todo provider tem recurso remoto para revogar.
   */
  deleteConnection?(externalId: string, opts?: ProviderRequestOptions): Promise<void>;

  /**
   * Dispara atualização no fornecedor. Opcional porque nem todo provider
   * aceita "sincronizar agora" (MeuPluggy só relê dados).
   */
  refreshConnection?(
    externalId: string,
    opts?: ProviderRequestOptions,
  ): Promise<ProviderRefreshResult>;
}
