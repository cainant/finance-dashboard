/**
 * Tipos crus da API do Pluggy (tolerantes a campos ausentes).
 *
 * A API adiciona campos sem versionar; os mappers usam apenas o que importa e
 * ignoram o resto. Nenhum tipo deste arquivo é exportado pelo índice público
 * como contrato de domínio — use os tipos `Provider*`.
 */

export interface PluggyConnector {
  id: number;
  name?: string | null;
  primaryColor?: string | null;
  imageUrl?: string | null;
  type?: string | null;
  isSandbox?: boolean | null;
  products?: string[] | null;
}

export interface PluggyItemError {
  code?: string | null;
  message?: string | null;
  providerMessage?: string | null;
}

export interface PluggyItem {
  id: string;
  status?: string | null;
  executionStatus?: string | null;
  error?: PluggyItemError | null;
  connector?: PluggyConnector | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastUpdatedAt?: string | null;
  consentExpiresAt?: string | null;
  nextAutoSyncAt?: string | null;
}

export interface PluggyCreditData {
  level?: string | null;
  brand?: string | null;
  balanceCloseDate?: string | null;
  balanceDueDate?: string | null;
  availableCreditLimit?: number | null;
  creditLimit?: number | null;
  minimumPayment?: number | null;
  status?: string | null;
}

export interface PluggyBankData {
  /** COMPE / Agência / Conta (ex.: `341/0001/12345-0`). */
  transferNumber?: string | null;
  closingBalance?: number | null;
  automaticallyInvestedBalance?: number | null;
  overdraftContractedLimit?: number | null;
  overdraftUsedLimit?: number | null;
}

export interface PluggyAccount {
  id: string;
  type: string;
  subtype: string;
  number?: string | null;
  name: string;
  marketingName?: string | null;
  balance: number;
  itemId: string;
  currencyCode: string;
  bankData?: PluggyBankData | null;
  creditData?: PluggyCreditData | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PluggyTransactionMerchant {
  name?: string | null;
  businessName?: string | null;
  cnpj?: string | null;
  category?: string | null;
}

export interface PluggyCreditCardMetadata {
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  totalAmount?: number | null;
  payeeMCC?: number | null;
  cardNumber?: string | null;
  billId?: string | null;
  purchaseDate?: string | null;
  billForecastDate?: string | null;
}

export interface PluggyTransaction {
  id: string;
  description: string;
  descriptionRaw?: string | null;
  currencyCode?: string | null;
  amount: number;
  date: string;
  accountId: string;
  /** `DEBIT | CREDIT`; opcional no schema, obrigatório na doc de produto. */
  type?: string | null;
  /** `POSTED | PENDING`; opcional no schema. */
  status?: string | null;
  category?: string | null;
  categoryId?: string | null;
  merchant?: PluggyTransactionMerchant | null;
  creditCardMetadata?: PluggyCreditCardMetadata | null;
  operationType?: string | null;
  providerCode?: string | null;
  providerId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PluggyBillPayment {
  id?: string | null;
  valueType?: string | null;
  paymentDate?: string | null;
  paymentMode?: string | null;
  amount?: number | null;
  currencyCode?: string | null;
}

export interface PluggyFinanceCharge {
  id?: string | null;
  type?: string | null;
  amount?: number | null;
  currencyCode?: string | null;
}

export interface PluggyBill {
  id: string;
  dueDate: string;
  /** Pode vir como number|string|null em conectores; só string é usada. */
  billClosingDate?: string | number | null;
  totalAmount: number;
  totalAmountCurrencyCode?: string | null;
  minimumPaymentAmount?: number | null;
  allowsInstallments?: boolean | null;
  financeCharges?: PluggyFinanceCharge[] | null;
  payments?: PluggyBillPayment[] | null;
}

export interface PluggyInvestmentInstitution {
  name?: string | null;
  number?: string | null;
}

export interface PluggyInvestment {
  id: string;
  itemId?: string | null;
  type: string;
  subtype?: string | null;
  name: string;
  number?: string | null;
  balance: number;
  quantity?: number | null;
  value?: number | null;
  amount?: number | null;
  amountOriginal?: number | null;
  amountProfit?: number | null;
  taxes?: number | null;
  rate?: number | null;
  rateType?: string | null;
  dueDate?: string | null;
  issuer?: string | null;
  code?: string | null;
  isin?: string | null;
  status?: string | null;
  institution?: PluggyInvestmentInstitution | null;
  currencyCode?: string | null;
  updatedAt?: string | null;
}

export interface PluggyPage<T> {
  total?: number;
  totalPages?: number;
  page?: number;
  results: T[];
  next?: string | null;
}

export interface PluggyTransactionsPage {
  results: PluggyTransaction[];
  /** Query string pronta, começando com `?`; `null` na última página. */
  next?: string | null;
}

export interface PluggyAccountBalance {
  balance: number;
  blockedBalance?: number | null;
  automaticallyInvestedBalance?: number | null;
  closingBalance?: number | null;
  currencyCode: string;
  updateDateTime: string;
}

export interface PluggyAuthResponse {
  apiKey: string;
}

export interface PluggyConnectTokenResponse {
  accessToken: string;
}

export interface PluggyErrorBody {
  code?: number | string;
  message?: string;
  codeDescription?: string;
  errorId?: string;
}

export interface PluggyConnectTokenOptions {
  /** Atualiza um item existente (widget). */
  itemId?: string;
  clientUserId?: string;
  webhookUrl?: string;
  oauthRedirectUri?: string;
  avoidDuplicates?: boolean;
  products?: string[];
}

export interface PluggyConnectorQuery {
  sandbox?: boolean;
  /** ISO-3166-1 alpha-2 (ex.: `BR`); a API aceita lista separada por vírgula. */
  countries?: string;
  signal?: AbortSignal;
}
