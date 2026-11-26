import { deriveBillStatus } from "../bills";
import { isProviderCategoryHint, type ProviderCategoryHint } from "../categories";
import { ProviderError, sanitizeProviderMessage } from "../errors";
import {
  holderTokenSets,
  matchesInternalMovement,
  type HolderTokenSet,
} from "./internal-transfers";
import type {
  AmountSignConvention,
  ProviderAccount,
  ProviderAccountType,
  ProviderBill,
  ProviderConnection,
  ProviderConnectionStatus,
  ProviderCreditCard,
  ProviderInstitution,
  ProviderInstitutionType,
  ProviderInvestment,
  ProviderInvestmentType,
  ProviderTransaction,
  ProviderTransactionStatus,
  ProviderTransactionType,
} from "../types";
import type {
  PluggyAccount,
  PluggyBill,
  PluggyConnector,
  PluggyInvestment,
  PluggyItem,
  PluggyTransaction,
} from "./types";

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

/**
 * Tabela de categorias Pluggy → slug de sistema. Pluggy só entrega `category`
 * no plano Pro; quando vem `null`, o mapper cai para heurística de descrição.
 */
export const PLUGGY_CATEGORY_HINT_MAP: Readonly<Record<string, ProviderCategoryHint>> = {
  supermarket: "mercado",
  groceries: "mercado",
  grocery: "mercado",
  mercado: "mercado",
  padaria: "mercado",
  restaurant: "restaurantes",
  restaurants: "restaurantes",
  restaurante: "restaurantes",
  food: "restaurantes",
  "food and beverage": "restaurantes",
  delivery: "restaurantes",
  transport: "transporte",
  transportation: "transporte",
  transporte: "transporte",
  fuel: "transporte",
  "gas station": "transporte",
  posto: "transporte",
  housing: "moradia",
  moradia: "moradia",
  rent: "moradia",
  aluguel: "moradia",
  utilities: "contas-servicos",
  utility: "contas-servicos",
  "contas e servicos": "contas-servicos",
  telecom: "contas-servicos",
  internet: "contas-servicos",
  health: "saude",
  healthcare: "saude",
  saude: "saude",
  pharmacy: "saude",
  farmacia: "saude",
  education: "educacao",
  educacao: "educacao",
  school: "educacao",
  entertainment: "lazer",
  lazer: "lazer",
  leisure: "lazer",
  shopping: "compras",
  compras: "compras",
  clothing: "compras",
  vestuario: "compras",
  subscription: "assinaturas",
  subscriptions: "assinaturas",
  assinaturas: "assinaturas",
  streaming: "assinaturas",
  "video streaming": "assinaturas",
  travel: "viagem",
  viagem: "viagem",
  tourism: "viagem",
  pets: "pets",
  pet: "pets",
  taxes: "impostos-taxas",
  tax: "impostos-taxas",
  impostos: "impostos-taxas",
  taxas: "impostos-taxas",
  transfer: "transferencias",
  transfers: "transferencias",
  transferencias: "transferencias",
  salary: "salario",
  salario: "salario",
  payroll: "salario",
  freelance: "freelance",
  investment: "rendimentos",
  investments: "rendimentos",
  rendimentos: "rendimentos",
  interest: "rendimentos",
  dividends: "rendimentos",
  "pix recebido": "pix-recebido",
  eletronicos: "compras",
  electronics: "compras",
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Normaliza a descrição para casar as regras: sem acento, maiúscula, com
 * pontuação virando espaço (e "+" virando " PLUS ") e sem o ruído que os
 * adquirentes colocam na frente ("DL*UBERRIDES", "Dl *Uberrides",
 * "Mp *Spotify"). O strip do prefixo não é decorativo: a regra do 99 é ancorada
 * no início, então "DL*99 TECNOLOGIA" só casa depois de remover o "DL*".
 */
function normalizeDescriptionForRules(value: string): string {
  return normalizeText(value)
    .replace(/^(?:dl|mp|sq|ec|tst|ifd|ebanx|paypal|pagseguro|stone|cielo|rede)\s*\*\s*/, "")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Traduz `Transaction.category` / `merchant.category` para o slug do app.
 * Retorna `null` quando não há correspondência (o chamador usa descrição).
 */
export function mapPluggyCategory(
  category?: string | null,
  merchantCategory?: string | null,
): ProviderCategoryHint | null {
  for (const value of [category, merchantCategory]) {
    if (!value) continue;
    const mapped = PLUGGY_CATEGORY_HINT_MAP[normalizeText(value)];
    if (mapped) return mapped;
  }
  return null;
}

/**
 * Transferências inequívocas. Valem mesmo quando o Pluggy manda uma categoria
 * genérica; o resto das regras de descrição continua depois da categoria do
 * Pluggy, como antes.
 */
const STRONG_DESCRIPTION_RULES: readonly [RegExp, ProviderCategoryHint][] = [
  [/\bPIX RECEBIDO\b/, "pix-recebido"],
  [/\bPAGAMENTO (DE )?FATURA\b|\bTRANSFERENCIA\b|\bAPLICACAO\b|\bRESGATE\b/, "transferencias"],
];

/**
 * Regras de entrada. Só valem com sinal positivo (ou desconhecido): assim
 * "Juros e encargos" e "LOJA DO SALARIO" em despesa não viram rendimento nem
 * salário.
 */
const INCOME_DESCRIPTION_RULES: readonly [RegExp, ProviderCategoryHint][] = [
  [/\bSALARIO\b|\bPAGAMENTO DE SALARIO\b/, "salario"],
  [/\bFREELA\b|\bFREELANCE\b/, "freelance"],
  [/\bRENDIMENTO\b|\bJUROS\b|\bDIVIDENDO/, "rendimentos"],
];

const DESCRIPTION_CATEGORY_RULES: readonly [RegExp, ProviderCategoryHint][] = [
  // PIX/TED/DOC soltos são fracos: ficam depois da categoria do Pluggy para
  // não transformar "PIX ENVIADO PADARIA" em transferência quando o banco diz
  // que é alimentação.
  [/\bPIX\b|\bTED\b|\bDOC\b/, "transferencias"],
  [/\bSUPERMERCADO\b|\bMERCADO\b|\bATACAD|\bPADARIA\b|\bACOUGUE\b|\bHORTIFRUTI\b/, "mercado"],
  [
    /\bRESTAURANTE\b|\bPIZZARIA\b|\bLANCHONETE\b|\bCAFE\b|\bDELIVERY\b|\bIFOOD\b|\bBAR\b/,
    "restaurantes",
  ],
  [
    /\bUBER\b|\b99APP\b|\bPOSTO\b|\bCOMBUSTIVEL\b|\bESTACIONAMENTO\b|\bMETRO\b|\bONIBUS\b/,
    "transporte",
  ],
  [/\bALUGUEL\b|\bCONDOMINIO\b|\bIMOBILIARIA\b/, "moradia"],
  [
    /\bENERGIA\b|\bELETRICA\b|\bAGUA\b|\bINTERNET\b|\bTELEFONE\b|\bCELULAR\b|\bFIBRA\b/,
    "contas-servicos",
  ],
  [
    /\bFARMACIA\b|\bDROGARIA\b|\bPLANO DE SAUDE\b|\bHOSPITAL\b|\bCLINICA\b|\bODONTOLOGICO\b/,
    "saude",
  ],
  [/\bESCOLA\b|\bCURSO\b|\bFACULDADE\b|\bEDUCACAO\b/, "educacao"],
  [/\bCINEMA\b|\bTEATRO\b|\bSHOW\b|\bACADEMIA\b|\bLIVRARIA\b/, "lazer"],
  [/\bSTREAM|\bMUSIC|\bASSINATURA\b|\bCLOUDSTORE\b|\bJORNAL\b/, "assinaturas"],
  [/\bVIAGEM\b|\bHOTEL\b|\bPASSAGEM\b|\bAEROLINHA\b|\bAIRBNB\b/, "viagem"],
  [/\bPET SHOP\b|\bVETERINAR|\bRACAO\b|\bPET\b/, "pets"],
  [/\bIMPOSTO\b|\bTARIFA\b|\bIOF\b|\bTAXA\b/, "impostos-taxas"],
  [/\bLOJA\b|\bMAGAZINE\b|\bSHOPPING\b|\bCOMPRA\b|\bCASA\b|\bELETRO\b/, "compras"],
];

/**
 * Marcas com categoria inequívoca. Têm prioridade sobre a categoria do Pluggy
 * porque o banco costuma mandar rótulos genéricos ("Utilities", "Telecom",
 * "Services") para assinaturas e transporte — era o caso do Spotify caindo em
 * "Contas e serviços". Só entram marcas cujo nome basta para decidir.
 */
const BRAND_CATEGORY_RULES: readonly [RegExp, ProviderCategoryHint][] = [
  // Uber Eats é comida, não corrida: precisa vir antes da regra do Uber.
  [/\bUBER\s?EATS\b|\bUBEREATS\b/, "restaurantes"],
  [/\bUBER(?:RIDES|TRIP|BAG)?\b/, "transporte"],
  // 99 só como primeiro token (ou 99APP/POP/TAXI/99 TECNOLOGIA): "PADARIA 99",
  // "POSTO 99" e "PARC 03/99" não são corrida. 99 Food é comida.
  [/^99\s?FOOD\b/, "restaurantes"],
  [/^99(?:APP|POP|TAXI|RIDE|RIDES|TECNOLOGIA)?\b/, "transporte"],
  [
    /\bSPOTIFY\b|\bDEEZER\b|\bTIDAL\b|\bAPPLE\s?MUSIC\b|\bYOUTUBE\s?(?:PREMIUM|MUSIC)\b|\bNETFLIX\b|\bDISNEY\s?PLUS\b|\bHBO(?:\s?MAX)?\b|\bGLOBOPLAY\b|\bPARAMOUNT\s?PLUS\b|\bCRUNCHYROLL\b/,
    "assinaturas",
  ],
];

function matchRule(
  rules: readonly [RegExp, ProviderCategoryHint][],
  normalizedDescription: string,
): ProviderCategoryHint | null {
  for (const [pattern, category] of rules) {
    if (pattern.test(normalizedDescription)) return category;
  }
  return null;
}

interface ResolveCategoryHintInput {
  description: string;
  /** Categoria já traduzida do Pluggy, quando houver. */
  mappedCategory?: ProviderCategoryHint | null;
  /** Sinal em centavos; sem ele (inferência isolada), entrada e despesa valem. */
  amountCents?: number;
}

/**
 * Ordem única de decisão: transferência inequívoca → entrada (só com sinal de
 * entrada) → marca conhecida (só em despesa) → categoria do Pluggy → demais
 * regras de descrição.
 */
function resolveCategoryHint(input: ResolveCategoryHintInput): ProviderCategoryHint {
  const normalized = normalizeDescriptionForRules(input.description);
  const income = input.amountCents === undefined || input.amountCents > 0;
  const expense = input.amountCents === undefined || input.amountCents < 0;

  const strong = matchRule(STRONG_DESCRIPTION_RULES, normalized);
  if (strong) return strong;

  if (income) {
    const incomeRule = matchRule(INCOME_DESCRIPTION_RULES, normalized);
    if (incomeRule) return incomeRule;
  }

  // Marca vence a categoria genérica do Pluggy, mas só em despesa: estorno ou
  // reembolso não vira assinatura nem corrida.
  if (expense) {
    const brand = matchRule(BRAND_CATEGORY_RULES, normalized);
    if (brand) return brand;
  }

  if (input.mappedCategory) return input.mappedCategory;

  return matchRule(DESCRIPTION_CATEGORY_RULES, normalized) ?? "outros";
}

export function inferCategoryFromDescription(description: string): ProviderCategoryHint {
  return resolveCategoryHint({ description });
}

// ---------------------------------------------------------------------------
// Item / conexão
// ---------------------------------------------------------------------------

const TRANSIENT_EXECUTION_STATUSES: ReadonlySet<string> = new Set([
  "CREATED",
  "LOGIN_IN_PROGRESS",
  "LOGIN_MFA_IN_PROGRESS",
  "ACCOUNTS_IN_PROGRESS",
  "CREDITCARDS_IN_PROGRESS",
  "TRANSACTIONS_IN_PROGRESS",
  "INVESTMENT_TRANSACTIONS_IN_PROGRESS",
  "PAYMENT_DATA_IN_PROGRESS",
  "IDENTITY_IN_PROGRESS",
  "MERGING",
]);

const LOGIN_REQUIRED_EXECUTION_STATUSES: ReadonlySet<string> = new Set([
  "WAITING_USER_INPUT",
  "USER_AUTHORIZATION_PENDING",
  "USER_INPUT_TIMEOUT",
  "INVALID_CREDENTIALS",
  "INVALID_CREDENTIALS_MFA",
  "ACCOUNT_LOCKED",
  "ACCOUNT_NEEDS_ACTION",
  "ACCOUNT_CREDENTIALS_RESET",
  "USER_AUTHORIZATION_NOT_GRANTED",
  "USER_AUTHORIZATION_REVOKED",
  "USER_AUTHORIZATION_EXPIRED",
]);

const ERROR_EXECUTION_STATUSES: ReadonlySet<string> = new Set([
  "ERROR",
  "MERGE_ERROR",
  "SITE_NOT_AVAILABLE",
  "CONNECTION_ERROR",
  "ALREADY_LOGGED_IN",
  "USER_NOT_SUPPORTED",
]);

export interface MappedItemStatus {
  status: ProviderConnectionStatus;
  statusDetail?: string;
}

/** Mapeia `Item.status` + `Item.executionStatus` para o status do app. */
export function mapPluggyItemStatus(item: PluggyItem): MappedItemStatus {
  const status = (item.status ?? "").trim().toUpperCase();
  const execution = (item.executionStatus ?? "").trim().toUpperCase();
  const errorCode = safeCode(item.error?.code);

  if (LOGIN_REQUIRED_EXECUTION_STATUSES.has(execution)) {
    return { status: "login_required", statusDetail: errorCode ?? execution };
  }
  if (TRANSIENT_EXECUTION_STATUSES.has(execution)) {
    return { status: "syncing" };
  }
  if (status === "UPDATING") {
    return { status: "syncing" };
  }
  if (status === "WAITING_USER_INPUT") {
    return { status: "login_required", statusDetail: errorCode ?? "WAITING_USER_INPUT" };
  }
  if (status === "LOGIN_ERROR") {
    return { status: "login_required", statusDetail: errorCode ?? "LOGIN_ERROR" };
  }
  if (status === "OUTDATED") {
    return { status: "outdated", statusDetail: errorCode ?? (execution || "OUTDATED") };
  }
  if (ERROR_EXECUTION_STATUSES.has(execution)) {
    return { status: "error", statusDetail: errorCode ?? execution };
  }
  if (execution === "PARTIAL_SUCCESS") {
    return { status: "active", statusDetail: "PARTIAL_SUCCESS" };
  }
  if (status === "UPDATED" && (execution === "SUCCESS" || execution === "")) {
    return { status: "active" };
  }
  if (status === "" && execution === "SUCCESS") {
    return { status: "active" };
  }
  return {
    status: "error",
    statusDetail: errorCode ?? (execution || status || "UNKNOWN_STATUS"),
  };
}

function safeCode(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return /^[A-Z0-9_]{1,64}$/.test(trimmed) ? trimmed : undefined;
}

function mapConnectorType(type: string | null | undefined): ProviderInstitutionType {
  const normalized = (type ?? "").trim().toUpperCase();
  if (normalized.includes("CREDIT_UNION") || normalized.includes("COOPERATIVA")) {
    return "credit_union";
  }
  if (normalized.includes("DIGITAL")) return "digital_bank";
  if (normalized.includes("INVEST") || normalized.includes("BROKER")) return "broker";
  if (normalized.includes("BANK")) return "bank";
  return "other";
}

function normalizeColor(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export function mapPluggyConnectorToInstitution(
  connector: PluggyConnector | null | undefined,
): ProviderInstitution {
  const fallback: ProviderInstitution = {
    externalId: "unknown",
    name: "Instituição",
    type: "other",
  };
  if (!connector || typeof connector.id !== "number") return fallback;

  const institution: ProviderInstitution = {
    externalId: String(connector.id),
    name: sanitizeProviderMessage(connector.name, fallback.name),
    type: mapConnectorType(connector.type),
  };
  const logoUrl = connector.imageUrl?.trim();
  if (logoUrl) institution.logoUrl = logoUrl;
  const primaryColor = normalizeColor(connector.primaryColor);
  if (primaryColor) institution.primaryColor = primaryColor;
  return institution;
}

export function mapPluggyItemToConnection(item: PluggyItem): ProviderConnection {
  if (!item.id) {
    throw new ProviderError("invalid_response", "Item do Pluggy sem identificador.");
  }
  const mappedStatus = mapPluggyItemStatus(item);
  const connection: ProviderConnection = {
    externalId: item.id,
    provider: "pluggy",
    status: mappedStatus.status,
    institution: mapPluggyConnectorToInstitution(item.connector),
  };
  if (mappedStatus.statusDetail) connection.statusDetail = mappedStatus.statusDetail;
  const lastSyncedAt = item.lastUpdatedAt ?? item.updatedAt ?? undefined;
  if (lastSyncedAt) connection.lastSyncedAt = lastSyncedAt;
  if (item.createdAt) connection.createdAt = item.createdAt;
  if (item.updatedAt) connection.updatedAt = item.updatedAt;
  if (item.consentExpiresAt !== undefined) connection.consentExpiresAt = item.consentExpiresAt;
  return connection;
}

// ---------------------------------------------------------------------------
// Conta / cartão
// ---------------------------------------------------------------------------

export function mapPluggyAccountType(
  type: string,
  subtype: string | null | undefined,
): ProviderAccountType {
  const normalizedType = (type ?? "").trim().toUpperCase();
  const normalizedSubtype = (subtype ?? "").trim().toUpperCase();
  if (normalizedType === "CREDIT" || normalizedSubtype === "CREDIT_CARD") {
    return "credit_card";
  }
  if (normalizedSubtype.includes("SAVINGS")) return "savings";
  if (normalizedType === "INVESTMENT" || normalizedSubtype.includes("INVESTMENT")) {
    return "investment";
  }
  if (normalizedType === "BANK") return "checking";
  return "other";
}

/**
 * Nomes de bancos por código COMPE (primeiro segmento de
 * `bankData.transferNumber`, ex.: `341/0001/12345-0`). É a única informação de
 * instituição que o Pluggy dá por conta em itens MeuPluggy; quando o código não
 * está no mapa, a UI cai para o nome da conta.
 */
const COMPE_BANK_NAMES: Readonly<Record<string, string>> = {
  "001": "Banco do Brasil",
  "033": "Santander",
  "041": "Banrisul",
  "077": "Banco Inter",
  "104": "Caixa Econômica Federal",
  "121": "Agibank",
  "197": "Stone",
  "208": "BTG Pactual",
  "212": "Banco Original",
  "237": "Bradesco",
  "260": "Nubank",
  "290": "PagBank",
  "323": "Mercado Pago",
  "336": "C6 Bank",
  "341": "Itaú",
  "348": "XP Investimentos",
  "380": "PicPay",
  "389": "Banco Mercantil",
  "422": "Banco Safra",
  "655": "Banco Votorantim",
  "748": "Sicredi",
  "756": "Sicoob",
};

/** Aliases de banco no nome do cartão/conta (fallback quando não há COMPE). */
const ACCOUNT_NAME_BANK_ALIASES: ReadonlyArray<[RegExp, string]> = [
  [/\bITA[ÚU]\b|\bITAU\b/, "Itaú"],
  [/\bNUBANK\b|\bNU PAGAMENTOS\b/, "Nubank"],
  [/\bBRADESCO\b/, "Bradesco"],
  [/\bSANTANDER\b/, "Santander"],
  [/\bBANCO DO BRASIL\b|\bBB\b/, "Banco do Brasil"],
  [/\bCAIXA\b/, "Caixa Econômica Federal"],
  [/\bINTER\b/, "Banco Inter"],
  [/\bC6\b/, "C6 Bank"],
  [/\bBTG\b/, "BTG Pactual"],
  [/\bXP\b/, "XP Investimentos"],
  [/\bSAFRA\b/, "Banco Safra"],
  [/\bSICREDI\b/, "Sicredi"],
  [/\bSICOOB\b/, "Sicoob"],
  [/\bPICPAY\b/, "PicPay"],
  [/\bMERCADO PAGO\b/, "Mercado Pago"],
  [/\bPAGBANK\b|\bPAGSEGURO\b/, "PagBank"],
  [/\bNEON\b/, "Neon"],
  [/\bWILL BANK\b/, "Will Bank"],
  [/\bORIGINAL\b/, "Banco Original"],
  [/\bAGIBANK\b/, "Agibank"],
  [/\bSTONE\b/, "Stone"],
  [/\bBANRISUL\b/, "Banrisul"],
  [/\bNEXT\b/, "Next"],
  [/\bVOTORANTIM\b/, "Banco Votorantim"],
];

/**
 * Nomes de banco que o mapper pode gravar em `accounts.institution_name`
 * (COMPE + alias de nome de cartão). É a lista canônica que a web usa para
 * conferir que todo banco conhecido tem logo ou está explicitamente sem logo.
 */
export const KNOWN_ACCOUNT_BANK_NAMES: readonly string[] = [
  ...new Set([
    ...Object.values(COMPE_BANK_NAMES),
    ...ACCOUNT_NAME_BANK_ALIASES.map(([, bankName]) => bankName),
  ]),
].sort((a, b) => a.localeCompare(b, "pt-BR"));

function normalizeBankText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

/** Extrai o nome do banco do código COMPE em `transferNumber`. */
export function bankNameFromCompe(transferNumber: string | null | undefined): string | null {
  if (!transferNumber) return null;
  const first = transferNumber.split("/")[0] ?? "";
  const digits = first.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return COMPE_BANK_NAMES[digits.padStart(3, "0")] ?? null;
}

/** Fallback: bancos citados no nome/marketingName do cartão ou da conta. */
export function bankNameFromAccountName(
  name: string | null | undefined,
  marketingName?: string | null,
): string | null {
  const text = normalizeBankText([name ?? "", marketingName ?? ""].join(" "));
  for (const [pattern, bank] of ACCOUNT_NAME_BANK_ALIASES) {
    if (pattern.test(text)) return bank;
  }
  return null;
}

/**
 * Instituição da conta em um item MeuPluggy: o conector é sempre "MeuPluggy",
 * então o banco real vem do COMPE da conta ou do nome do cartão.
 */
export function deriveMeuPluggyInstitutionName(account: PluggyAccount): string | null {
  return (
    bankNameFromCompe(account.bankData?.transferNumber) ??
    bankNameFromAccountName(account.name, account.marketingName)
  );
}

/**
 * Resolve a instituição de cada conta de um item Pluggy — de qualquer
 * conector, não só MeuPluggy: o item aponta para uma instituição só, e herdar
 * o banco das demais contas é correto também no sandbox/Pluggy Bank.
 *
 * O cartão do MeuPluggy normalmente chega sem COMPE (`bankData` nulo) e com
 * nome genérico (`GOLD`, `platinum`), então a derivação direta devolve `null` e
 * a UI cai para o nome do conector ("MeuPluggy"). Como o item é de um banco só,
 * a conta sem banco herda a única instituição distinta das outras contas do
 * item. Se o item misturar duas ou mais instituições, a herança seria ambígua:
 * a conta continua `null` e a UI cai para a instituição da conexão.
 */
export function resolveMeuPluggyInstitutionNames(
  accounts: readonly PluggyAccount[],
): Array<string | null> {
  const direct = accounts.map((account) => deriveMeuPluggyInstitutionName(account));
  const distinct = [...new Set(direct.filter((name): name is string => Boolean(name)))];
  const inherited = distinct.length === 1 ? distinct[0]! : null;

  return direct.map((name) => name ?? inherited);
}

function requiredCents(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new ProviderError("invalid_response", `Campo ${field} inválido no Pluggy.`);
  }
  return Math.round(value * 100);
}

function optionalCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function mapPluggyAccount(
  account: PluggyAccount,
  options: { institutionName?: string | null } = {},
): ProviderAccount {
  if (!account.id) {
    throw new ProviderError("invalid_response", "Conta do Pluggy sem identificador.");
  }
  const type = mapPluggyAccountType(account.type, account.subtype);
  const availableCents =
    type === "credit_card" ? optionalCents(account.creditData?.availableCreditLimit) : null;

  return {
    externalId: account.id,
    connectionExternalId: account.itemId,
    type,
    subtype: account.subtype ?? null,
    name: sanitizeProviderMessage(account.name, "Conta"),
    numberMasked: account.number?.trim() || null,
    institutionName: options.institutionName?.trim() || null,
    currency: account.currencyCode?.trim() || "BRL",
    balanceCents: requiredCents(account.balance, "balance"),
    availableCents,
    ...(account.updatedAt ? { updatedAt: account.updatedAt } : {}),
  };
}

function dayOfMonthFromDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^\d{4}-\d{2}-(\d{2})/.exec(value);
  if (!match?.[1]) return null;
  const day = Number(match[1]);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

export function mapPluggyCreditCard(account: PluggyAccount): ProviderCreditCard {
  const credit = account.creditData;
  const limitCents = optionalCents(credit?.creditLimit);
  const balanceCents = optionalCents(account.balance);
  const availableLimitCents =
    optionalCents(credit?.availableCreditLimit) ??
    (limitCents !== null && balanceCents !== null ? limitCents - balanceCents : null);

  return {
    accountExternalId: account.id,
    brand: credit?.brand?.trim().toUpperCase() || null,
    level: credit?.level?.trim().toUpperCase() || null,
    limitCents,
    availableLimitCents,
    closingDay: dayOfMonthFromDate(credit?.balanceCloseDate),
    dueDay: dayOfMonthFromDate(credit?.balanceDueDate),
    currency: account.currencyCode?.trim() || "BRL",
  };
}

// ---------------------------------------------------------------------------
// Transações
// ---------------------------------------------------------------------------

/** Converte um timestamp UTC para a data local de America/Sao_Paulo (UTC-3). */
export function toSaoPauloDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return value.slice(0, 10);
  return new Date(time - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface MapPluggyTransactionOptions {
  /** Fallback quando a transação não traz `accountId`. */
  accountExternalId?: string;
  /** Ajuda no sinal quando o fornecedor omite `type` (cartão é o caso crítico). */
  accountType?: "BANK" | "CREDIT";
  /** Convenção de sinal do cartão (persistida por conta). */
  amountSignConvention?: AmountSignConvention | null;
  /** Default `true`; classifica transferências internas por descrição. */
  detectTransfers?: boolean;
  /**
   * Nome(s) do titular da conta (ex.: `users.name`). Com ele, transferências
   * cuja contraparte é o próprio titular viram `transfer` — movimentação entre
   * contas da mesma pessoa não é receita nem despesa. Sem o nome, a regra não
   * se aplica.
   */
  holderNames?: readonly string[];
  /** Tokens do titular já normalizados; evita recomputar por transação. */
  holderTokenSets?: HolderTokenSet;
}

/** Amostra mínima para reavaliar a convenção de sinal de um cartão. */
export const CREDIT_CARD_SIGN_SAMPLE_SIZE = 5;

const CARD_PAYMENT_DESCRIPTION = /\b(PAGAMENTO|PAGTO|PAYMENT)\b/;
const CARD_REFUND_DESCRIPTION = /\b(ESTORNO|REFUND|CHARGEBACK|DEVOLUCAO|REVERSAL)\b/;
const CARD_PAYMENT_CATEGORY = /\b(CREDIT CARD PAYMENT|CARD PAYMENT|PAYMENT|PAGAMENTO)\b/;

function normalizedTransactionText(transaction: PluggyTransaction): {
  description: string;
  category: string;
} {
  return {
    description: normalizeText(transaction.description ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9 ]+/g, " "),
    category: normalizeText(transaction.category ?? "").toUpperCase(),
  };
}

/** Sinal forte de pagamento de fatura (não confundir com compra). */
export function isCreditCardPayment(transaction: PluggyTransaction): boolean {
  const { description, category } = normalizedTransactionText(transaction);
  return (
    CARD_PAYMENT_DESCRIPTION.test(description) ||
    CARD_PAYMENT_CATEGORY.test(category) ||
    category.startsWith("TRANSFER")
  );
}

/** Sinal forte de estorno/devolução (crédito no cartão). */
export function isCreditCardRefund(transaction: PluggyTransaction): boolean {
  const { description, category } = normalizedTransactionText(transaction);
  return CARD_REFUND_DESCRIPTION.test(description) || /\b(REFUND|ESTORNO)\b/.test(category);
}

export interface CreditCardSignDetection {
  convention: AmountSignConvention;
  sampleSize: number;
  /** `true` quando a convenção deve ser persistida na conta. */
  persist: boolean;
}

/**
 * Detecta a convenção de sinal de uma conta de cartão.
 *
 * A Pluggy não normaliza o sinal no cartão: o sandbox devolve compras com
 * `amount` negativo e `type: "CREDIT"`; a documentação/Open Finance devolve
 * compras positivas. A estratégia:
 * 1. sinais fortes de pagamento/estorno identificam o lado "crédito";
 * 2. sem sinal forte, o sinal dominante entre >= 5 lançamentos é "compra";
 * 3. com convenção já persistida, amostras pequenas (< 5) nunca a invertem.
 */
export function detectCreditCardSignConvention(
  transactions: readonly PluggyTransaction[],
  existing: AmountSignConvention | null = null,
): CreditCardSignDetection | null {
  const sampleSize = transactions.length;

  // Um sync incremental com um único pagamento não pode inverter a convenção.
  if (existing && sampleSize < CREDIT_CARD_SIGN_SAMPLE_SIZE) {
    return { convention: existing, sampleSize, persist: false };
  }

  const creditSigns: number[] = [];
  const purchaseSigns: number[] = [];
  for (const transaction of transactions) {
    if (!Number.isFinite(transaction.amount) || transaction.amount === 0) continue;
    const sign = transaction.amount > 0 ? 1 : -1;
    if (isCreditCardRefund(transaction) || isCreditCardPayment(transaction)) {
      creditSigns.push(sign);
    } else {
      purchaseSigns.push(sign);
    }
  }

  let candidate: AmountSignConvention | null = null;
  if (creditSigns.length > 0) {
    const positive = creditSigns.filter((sign) => sign > 0).length;
    const negative = creditSigns.length - positive;
    if (positive !== negative) {
      candidate = positive > negative ? "purchase_negative" : "purchase_positive";
    }
  }

  if (!candidate && purchaseSigns.length >= CREDIT_CARD_SIGN_SAMPLE_SIZE) {
    const positive = purchaseSigns.filter((sign) => sign > 0).length;
    const negative = purchaseSigns.length - positive;
    candidate = negative >= positive ? "purchase_negative" : "purchase_positive";
  }

  if (!candidate && !existing && purchaseSigns.length > 0) {
    // Amostra pequena: usa o sinal dominante para mapear esta fatia, mas não
    // persiste até haver evidência suficiente.
    const positive = purchaseSigns.filter((sign) => sign > 0).length;
    const negative = purchaseSigns.length - positive;
    return {
      convention: negative >= positive ? "purchase_negative" : "purchase_positive",
      sampleSize,
      persist: false,
    };
  }

  if (!candidate) {
    return existing ? { convention: existing, sampleSize, persist: false } : null;
  }
  if (existing === candidate) {
    return { convention: candidate, sampleSize, persist: false };
  }

  return {
    convention: candidate,
    sampleSize,
    // A convenção só é persistida com amostra suficiente (>= 5). Amostras
    // menores podem mapear a fatia atual, mas não alteram a conta.
    persist: sampleSize >= CREDIT_CARD_SIGN_SAMPLE_SIZE,
  };
}

export function mapPluggyTransaction(
  transaction: PluggyTransaction,
  options: MapPluggyTransactionOptions = {},
): ProviderTransaction {
  if (!transaction.id) {
    throw new ProviderError("invalid_response", "Transação do Pluggy sem identificador.");
  }
  const accountExternalId = transaction.accountId ?? options.accountExternalId;
  if (!accountExternalId) {
    throw new ProviderError("invalid_response", "Transação do Pluggy sem conta.");
  }
  if (!Number.isFinite(transaction.amount)) {
    throw new ProviderError("invalid_response", "Transação do Pluggy com valor inválido.");
  }

  const absoluteCents = Math.round(Math.abs(transaction.amount) * 100);
  let amountCents: number;
  let cardType: ProviderTransactionType | null = null;

  if (options.accountType === "CREDIT") {
    if (isCreditCardRefund(transaction)) {
      // Estorno/devolução: dinheiro volta para o cartão.
      amountCents = absoluteCents;
      cardType = "income";
    } else if (isCreditCardPayment(transaction)) {
      // Pagamento de fatura: reduz a dívida, sem ser receita.
      amountCents = absoluteCents;
      cardType = "transfer";
    } else {
      const convention = options.amountSignConvention ?? null;
      const purchaseSide =
        convention === "purchase_positive"
          ? transaction.amount >= 0
          : convention === "purchase_negative"
            ? transaction.amount < 0
            : true; // sem convenção: o default seguro é compra
      if (purchaseSide) {
        amountCents = -absoluteCents;
        cardType = "expense";
      } else {
        // Crédito sem descrição de pagamento/estorno: dinheiro entrando no cartão.
        amountCents = absoluteCents;
        cardType = "transfer";
      }
    }
  } else if (options.accountType === "BANK") {
    // Conta corrente: o sinal do amount é a fonte da verdade.
    amountCents = transaction.amount >= 0 ? absoluteCents : -absoluteCents;
  } else {
    // Sem tipo de conta: mantém a heurística antiga baseada em type.
    const pluggyType = (transaction.type ?? "").trim().toUpperCase();
    if (pluggyType === "CREDIT") {
      amountCents = absoluteCents;
    } else if (pluggyType === "DEBIT") {
      amountCents = -absoluteCents;
    } else {
      amountCents = transaction.amount >= 0 ? absoluteCents : -absoluteCents;
    }
  }

  const description = (
    transaction.description?.trim() ||
    transaction.descriptionRaw?.trim() ||
    "Transação"
  ).slice(0, 200);
  // Ordem única em `resolveCategoryHint`: transferência inequívoca > entrada >
  // marca (só em despesa) > categoria do Pluggy > demais regras.
  const categoryHint = resolveCategoryHint({
    description,
    mappedCategory: mapPluggyCategory(transaction.category, transaction.merchant?.category),
    amountCents,
  });
  const status: ProviderTransactionStatus =
    (transaction.status ?? "").trim().toUpperCase() === "PENDING" ? "pending" : "posted";
  const date = toSaoPauloDate(transaction.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ProviderError("invalid_response", "Transação do Pluggy com data inválida.");
  }

  let type: ProviderTransactionType = cardType ?? (amountCents >= 0 ? "income" : "expense");
  if (cardType === null && (options.detectTransfers ?? true)) {
    if (
      isTransferDescription(description) ||
      matchesInternalMovement(
        description,
        options.holderTokenSets ?? holderTokenSets(options.holderNames),
      )
    ) {
      type = "transfer";
    }
  }

  if (!isProviderCategoryHint(categoryHint)) {
    throw new ProviderError("invalid_response", "Categoria mapeada inválida.");
  }

  const metadata = transaction.creditCardMetadata;
  const result: ProviderTransaction = {
    externalId: transaction.id,
    accountExternalId,
    date,
    description,
    merchant:
      transaction.merchant?.name?.trim() || transaction.merchant?.businessName?.trim() || null,
    amountCents,
    currency: transaction.currencyCode?.trim() || "BRL",
    type,
    status,
    categoryHint,
    billExternalId: metadata?.billId ?? null,
    installmentNumber: positiveInteger(metadata?.installmentNumber),
    totalInstallments: positiveInteger(metadata?.totalInstallments),
    providerCode: transaction.providerCode?.trim() || null,
  };
  if (transaction.createdAt) result.createdAt = transaction.createdAt;
  if (transaction.updatedAt) result.updatedAt = transaction.updatedAt;
  return result;
}

function positiveInteger(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

function isTransferDescription(description: string): boolean {
  const normalized = description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return (
    /\bTRANSFERENCIA ENTRE CONTAS\b/.test(normalized) ||
    /\bAPLICACAO\b/.test(normalized) ||
    /\bRESGATE\b/.test(normalized) ||
    /\bPAGAMENTO (DE )?FATURA\b/.test(normalized) ||
    /\bTRANSFERENCIA (ENVIADA|RECEBIDA)\b.*\b(POUPANCA|CONTA|BANCO|NUVEM|AURORA|HORIZONTE)\b/.test(
      normalized,
    )
  );
}

// ---------------------------------------------------------------------------
// Faturas
// ---------------------------------------------------------------------------

function isoDatePart(value: string): string {
  return value.slice(0, 10);
}

export interface MapPluggyBillOptions {
  accountExternalId: string;
  /** `YYYY-MM-DD` em America/Sao_Paulo. */
  today: string;
}

export function mapPluggyBill(bill: PluggyBill, options: MapPluggyBillOptions): ProviderBill {
  if (!bill.id) {
    throw new ProviderError("invalid_response", "Fatura do Pluggy sem identificador.");
  }
  if (!bill.dueDate || !/^\d{4}-\d{2}-\d{2}/.test(bill.dueDate)) {
    throw new ProviderError("invalid_response", "Fatura do Pluggy sem vencimento válido.");
  }
  const paidCents = (bill.payments ?? []).reduce((total, payment) => {
    if (!Number.isFinite(payment.amount)) return total;
    return total + Math.max(0, Math.round((payment.amount ?? 0) * 100));
  }, 0);
  const totalCents = Math.max(0, requiredCents(bill.totalAmount, "totalAmount"));
  const closingDate =
    typeof bill.billClosingDate === "string" && bill.billClosingDate.length >= 10
      ? isoDatePart(bill.billClosingDate)
      : null;
  const dueDate = isoDatePart(bill.dueDate);

  return {
    externalId: bill.id,
    accountExternalId: options.accountExternalId,
    dueDate,
    closingDate,
    totalCents,
    minimumPaymentCents: optionalCents(bill.minimumPaymentAmount),
    currency: bill.totalAmountCurrencyCode?.trim() || "BRL",
    status: deriveBillStatus({
      dueDate,
      closingDate,
      totalCents,
      paidCents,
      today: options.today,
    }),
  };
}

// ---------------------------------------------------------------------------
// Investimentos
// ---------------------------------------------------------------------------

export function mapPluggyInvestmentType(type: string): ProviderInvestmentType {
  const normalized = (type ?? "").trim().toUpperCase();
  switch (normalized) {
    case "FIXED_INCOME":
      return "fixed_income";
    case "MUTUAL_FUND":
    case "FUND":
      return "fund";
    case "EQUITY":
      return "equity";
    case "ETF":
      return "etf";
    case "SECURITY":
      return "security";
    default:
      return "other";
  }
}

export interface MapPluggyInvestmentOptions {
  connectionExternalId: string;
  updatedAt: string;
}

export function mapPluggyInvestment(
  investment: PluggyInvestment,
  options: MapPluggyInvestmentOptions,
): ProviderInvestment {
  if (!investment.id) {
    throw new ProviderError("invalid_response", "Investimento do Pluggy sem identificador.");
  }
  return {
    externalId: investment.id,
    connectionExternalId: options.connectionExternalId,
    type: mapPluggyInvestmentType(investment.type),
    subtype: investment.subtype?.trim() || null,
    name: sanitizeProviderMessage(investment.name, "Investimento"),
    balanceCents: requiredCents(investment.balance, "balance"),
    amountProfitCents: optionalCents(investment.amountProfit),
    currency: investment.currencyCode?.trim() || "BRL",
    updatedAt: investment.updatedAt ?? options.updatedAt,
  };
}
