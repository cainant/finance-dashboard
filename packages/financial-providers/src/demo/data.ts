import type { ProviderCategoryHint } from "../categories";
import type { ProviderInstitutionType, ProviderInvestmentType } from "../types";

/**
 * Dados fixos do DemoProvider. Nenhum nome de banco real, nenhum logo remoto.
 * IDs são estáveis para que o seed/sync possam ser idempotentes.
 */

export type DemoInstitutionKey = "aurora" | "nuvem" | "horizonte";
export type DemoCardKey = "aurora-card" | "nuvem-card";

export const DEMO_SEED = 20261110;

export const DEMO_CONNECTION_EXTERNAL_IDS = {
  aurora: "demo-conn-banco-aurora",
  nuvem: "demo-conn-nuvem-bank",
  horizonte: "demo-conn-cooperativa-horizonte",
} as const;

export interface DemoInstitutionConfig {
  key: DemoInstitutionKey;
  externalId: string;
  name: string;
  primaryColor: string;
  type: ProviderInstitutionType;
}

export const DEMO_INSTITUTIONS: readonly DemoInstitutionConfig[] = [
  {
    key: "aurora",
    externalId: "demo-inst-banco-aurora",
    name: "Banco Aurora",
    primaryColor: "#2563eb",
    type: "bank",
  },
  {
    key: "nuvem",
    externalId: "demo-inst-nuvem-bank",
    name: "Nuvem Bank",
    primaryColor: "#7c3aed",
    type: "digital_bank",
  },
  {
    key: "horizonte",
    externalId: "demo-inst-cooperativa-horizonte",
    name: "Cooperativa Horizonte",
    primaryColor: "#0d9488",
    type: "credit_union",
  },
];

export type DemoAccountKind = "checking" | "savings" | "credit_card";

export interface DemoAccountConfig {
  key: string;
  externalId: string;
  connectionExternalId: string;
  institution: DemoInstitutionKey;
  kind: DemoAccountKind;
  subtype: string;
  name: string;
  numberMasked: string;
  openingBalanceCents: number;
}

export const DEMO_ACCOUNTS: readonly DemoAccountConfig[] = [
  {
    key: "aurora-checking",
    externalId: "demo-acc-aurora-checking",
    connectionExternalId: DEMO_CONNECTION_EXTERNAL_IDS.aurora,
    institution: "aurora",
    kind: "checking",
    subtype: "CHECKING_ACCOUNT",
    name: "Conta Corrente",
    numberMasked: "0001/12345-0",
    openingBalanceCents: 480_000,
  },
  {
    key: "aurora-savings",
    externalId: "demo-acc-aurora-savings",
    connectionExternalId: DEMO_CONNECTION_EXTERNAL_IDS.aurora,
    institution: "aurora",
    kind: "savings",
    subtype: "SAVINGS_ACCOUNT",
    name: "Poupança",
    numberMasked: "0001/98765-4",
    openingBalanceCents: 1_250_000,
  },
  {
    key: "nuvem-checking",
    externalId: "demo-acc-nuvem-checking",
    connectionExternalId: DEMO_CONNECTION_EXTERNAL_IDS.nuvem,
    institution: "nuvem",
    kind: "checking",
    subtype: "CHECKING_ACCOUNT",
    name: "Conta Digital",
    numberMasked: "0001/45678-9",
    openingBalanceCents: 320_000,
  },
  {
    key: "horizonte-checking",
    externalId: "demo-acc-horizonte-checking",
    connectionExternalId: DEMO_CONNECTION_EXTERNAL_IDS.horizonte,
    institution: "horizonte",
    kind: "checking",
    subtype: "CHECKING_ACCOUNT",
    name: "Conta Cooperada",
    numberMasked: "0001/11223-7",
    openingBalanceCents: 180_000,
  },
  {
    key: "horizonte-savings",
    externalId: "demo-acc-horizonte-savings",
    connectionExternalId: DEMO_CONNECTION_EXTERNAL_IDS.horizonte,
    institution: "horizonte",
    kind: "savings",
    subtype: "SAVINGS_ACCOUNT",
    name: "Poupança Cooperada",
    numberMasked: "0001/44556-1",
    openingBalanceCents: 750_000,
  },
];

/** Usado nos testes de coerência: saldo atual = abertura + Σ transações posted. */
export const DEMO_OPENING_BALANCES_CENTS: Readonly<Record<string, number>> = Object.fromEntries(
  DEMO_ACCOUNTS.map((account) => [account.externalId, account.openingBalanceCents]),
);

export interface DemoInstallmentPlan {
  description: string;
  category: ProviderCategoryHint;
  totalCents: number;
  installments: number;
  /** Índice da primeira fatura (0 = mais antiga das 7 geradas). */
  startBillOffset: number;
}

export interface DemoCardConfig {
  key: DemoCardKey;
  externalId: string;
  connectionExternalId: string;
  institution: DemoInstitutionKey;
  accountName: string;
  brand: string;
  level: string;
  numberMasked: string;
  limitCents: number;
  closingDay: number;
  dueDay: number;
  /** Conta corrente que paga a fatura. */
  payingAccountExternalId: string;
  /** Deixa a fatura fechada mais recente em aberto (demonstra closed/overdue). */
  leaveLatestClosedUnpaid: boolean;
  installmentPlans: readonly DemoInstallmentPlan[];
}

export const DEMO_CARDS: readonly DemoCardConfig[] = [
  {
    key: "aurora-card",
    externalId: "demo-acc-aurora-card",
    connectionExternalId: DEMO_CONNECTION_EXTERNAL_IDS.aurora,
    institution: "aurora",
    accountName: "Cartão Aurora Visa",
    brand: "VISA",
    level: "INFINITE",
    numberMasked: "4821",
    limitCents: 1_500_000,
    closingDay: 20,
    dueDay: 28,
    payingAccountExternalId: "demo-acc-aurora-checking",
    leaveLatestClosedUnpaid: false,
    installmentPlans: [
      {
        description: "NOTEBOOK PRO 14",
        category: "compras",
        totalCents: 549_900,
        installments: 10,
        startBillOffset: 0,
      },
    ],
  },
  {
    key: "nuvem-card",
    externalId: "demo-acc-nuvem-card",
    connectionExternalId: DEMO_CONNECTION_EXTERNAL_IDS.nuvem,
    institution: "nuvem",
    accountName: "Cartão Nuvem Mastercard",
    brand: "MASTERCARD",
    level: "PLATINUM",
    numberMasked: "7319",
    limitCents: 800_000,
    closingDay: 5,
    dueDay: 12,
    payingAccountExternalId: "demo-acc-nuvem-checking",
    leaveLatestClosedUnpaid: true,
    installmentPlans: [
      {
        description: "CELULAR NOVO 256GB",
        category: "compras",
        totalCents: 319_900,
        installments: 8,
        startBillOffset: 0,
      },
      {
        description: "CURSO DE IDIOMAS FLUENTE",
        category: "educacao",
        totalCents: 209_400,
        installments: 6,
        startBillOffset: 2,
      },
    ],
  },
];

export interface DemoMerchant {
  description: string;
  category: ProviderCategoryHint;
  minCents: number;
  maxCents: number;
}

export const DEMO_MERCHANTS: readonly DemoMerchant[] = [
  { description: "SUPERMERCADO BOM PRECO", category: "mercado", minCents: 8_500, maxCents: 34_000 },
  { description: "MERCADO VILA NOVA", category: "mercado", minCents: 7_000, maxCents: 28_000 },
  { description: "ATACADO VILA NOVA", category: "mercado", minCents: 12_000, maxCents: 45_000 },
  { description: "PADARIA PAO DOURADO", category: "mercado", minCents: 1_200, maxCents: 6_500 },
  { description: "ACOUGUE BOI FELIZ", category: "mercado", minCents: 4_500, maxCents: 18_000 },
  {
    description: "RESTAURANTE SABOR CASEIRO",
    category: "restaurantes",
    minCents: 3_200,
    maxCents: 9_800,
  },
  { description: "PIZZARIA DONA LIA", category: "restaurantes", minCents: 4_500, maxCents: 11_000 },
  {
    description: "LANCHONETE DA PRACA",
    category: "restaurantes",
    minCents: 2_200,
    maxCents: 6_400,
  },
  {
    description: "DELIVERY JA *RESTAURANTE",
    category: "restaurantes",
    minCents: 3_000,
    maxCents: 12_000,
  },
  { description: "CAFE DA ESQUINA", category: "restaurantes", minCents: 1_500, maxCents: 4_800 },
  { description: "UBER *TRIP", category: "transporte", minCents: 1_200, maxCents: 5_600 },
  { description: "99APP *CORRIDA", category: "transporte", minCents: 1_000, maxCents: 4_900 },
  { description: "POSTO ALVORADA", category: "transporte", minCents: 12_000, maxCents: 32_000 },
  { description: "AUTO POSTO CENTRAL", category: "transporte", minCents: 10_000, maxCents: 28_000 },
  {
    description: "ESTACIONAMENTO CENTRO",
    category: "transporte",
    minCents: 1_000,
    maxCents: 3_500,
  },
  { description: "FARMACIA SAUDE MAIS", category: "saude", minCents: 2_000, maxCents: 12_500 },
  { description: "DROGARIA BEM VIVER", category: "saude", minCents: 1_800, maxCents: 9_800 },
  { description: "CLINICA BEM ESTAR", category: "saude", minCents: 15_000, maxCents: 45_000 },
  { description: "CINEMA ESTRELA", category: "lazer", minCents: 3_000, maxCents: 8_000 },
  { description: "LIVRARIA CULTURA", category: "lazer", minCents: 3_500, maxCents: 14_000 },
  { description: "SHOW DA PRAIA", category: "lazer", minCents: 8_000, maxCents: 28_000 },
  { description: "LOJA VESTE BEM", category: "compras", minCents: 6_000, maxCents: 28_000 },
  { description: "MAGAZINE CENTRAL", category: "compras", minCents: 5_000, maxCents: 32_000 },
  { description: "CASA E DECOR", category: "compras", minCents: 7_000, maxCents: 35_000 },
  { description: "ELETRO NOVO", category: "compras", minCents: 15_000, maxCents: 65_000 },
  {
    description: "STREAMPLAY *ASSINATURA",
    category: "assinaturas",
    minCents: 3_990,
    maxCents: 3_990,
  },
  { description: "MUSICFLOW *PREMIUM", category: "assinaturas", minCents: 2_190, maxCents: 2_190 },
  {
    description: "CLOUDSTORE *ARMAZENAMENTO",
    category: "assinaturas",
    minCents: 999,
    maxCents: 999,
  },
  { description: "JORNAL DIGITAL", category: "assinaturas", minCents: 1_990, maxCents: 1_990 },
  { description: "HOTEL PRAIA AZUL", category: "viagem", minCents: 28_000, maxCents: 75_000 },
  { description: "AEROLINHA VOE", category: "viagem", minCents: 45_000, maxCents: 120_000 },
  { description: "PASSEIO BARCO AZUL", category: "viagem", minCents: 10_000, maxCents: 30_000 },
  { description: "PET SHOP AMIGO FIEL", category: "pets", minCents: 5_000, maxCents: 18_000 },
  {
    description: "VETERINARIA BICHO SAUDAVEL",
    category: "pets",
    minCents: 8_000,
    maxCents: 26_000,
  },
  { description: "RACAO E CIA", category: "pets", minCents: 4_000, maxCents: 14_000 },
  { description: "CURSO RAPIDO ONLINE", category: "educacao", minCents: 4_990, maxCents: 19_900 },
];

export interface DemoRecurringTransaction {
  day: number;
  description: string;
  category: ProviderCategoryHint;
  type: "income" | "expense";
  amountCents?: number;
  minCents?: number;
  maxCents?: number;
}

/** Lançamentos fixos mensais por conta corrente. */
export const DEMO_RECURRING_BY_ACCOUNT: Readonly<
  Record<string, readonly DemoRecurringTransaction[]>
> = {
  "demo-acc-aurora-checking": [
    {
      day: 3,
      description: "STREAMPLAY *ASSINATURA",
      category: "assinaturas",
      type: "expense",
      amountCents: 3_990,
    },
    {
      day: 5,
      description: "SALARIO - LUMEN TECNOLOGIA LTDA",
      category: "salario",
      type: "income",
      amountCents: 850_000,
    },
    {
      day: 6,
      description: "ACADEMIA CORPO ATIVO",
      category: "lazer",
      type: "expense",
      amountCents: 12_990,
    },
    {
      day: 7,
      description: "CURSO DE IDIOMAS FLUENTE",
      category: "educacao",
      type: "expense",
      amountCents: 34_900,
    },
    {
      day: 8,
      description: "PLANO DE SAUDE VIVER",
      category: "saude",
      type: "expense",
      amountCents: 58_900,
    },
    {
      day: 10,
      description: "ALUGUEL APTO 302 - IMOBILIARIA CENTRAL",
      category: "moradia",
      type: "expense",
      amountCents: 220_000,
    },
    {
      day: 10,
      description: "CONDOMINIO EDIFICIO ALVORADA",
      category: "moradia",
      type: "expense",
      amountCents: 68_000,
    },
    {
      day: 12,
      description: "INTERNET FIBRA CONECTA",
      category: "contas-servicos",
      type: "expense",
      amountCents: 11_990,
    },
    {
      day: 14,
      description: "MUSICFLOW *PREMIUM",
      category: "assinaturas",
      type: "expense",
      amountCents: 2_190,
    },
    {
      day: 15,
      description: "ENERGIA ELETRICA LUZ CLARA",
      category: "contas-servicos",
      type: "expense",
      minCents: 16_500,
      maxCents: 24_500,
    },
    {
      day: 18,
      description: "AGUA E ESGOTO SANEAR",
      category: "contas-servicos",
      type: "expense",
      minCents: 7_200,
      maxCents: 11_400,
    },
    {
      day: 20,
      description: "CELULAR MOVEL CONECTA",
      category: "contas-servicos",
      type: "expense",
      amountCents: 5_990,
    },
    {
      day: 22,
      description: "CLOUDSTORE *ARMAZENAMENTO",
      category: "assinaturas",
      type: "expense",
      amountCents: 999,
    },
  ],
  "demo-acc-nuvem-checking": [
    {
      day: 9,
      description: "MENSALIDADE NUVEM MAIS",
      category: "contas-servicos",
      type: "expense",
      amountCents: 1_990,
    },
  ],
  "demo-acc-horizonte-checking": [
    {
      day: 5,
      description: "PIX RECEBIDO - CLIENTE FREELA",
      category: "freelance",
      type: "income",
      minCents: 95_000,
      maxCents: 160_000,
    },
    {
      day: 6,
      description: "PLANO ODONTOLOGICO SORRISO",
      category: "saude",
      type: "expense",
      amountCents: 8_900,
    },
    {
      day: 9,
      description: "TARIFA COOPERATIVA",
      category: "impostos-taxas",
      type: "expense",
      amountCents: 2_500,
    },
    {
      day: 11,
      description: "CURSO ONLINE CRIATIVO",
      category: "educacao",
      type: "expense",
      amountCents: 4_990,
    },
  ],
};

export interface DemoTransferConfig {
  day: number;
  amountCents: number;
  fromAccountExternalId: string;
  toAccountExternalId: string;
  fromDescription: string;
  toDescription: string;
}

/** Transferências internas mensais, sempre com os dois lados. */
export const DEMO_MONTHLY_TRANSFERS: readonly DemoTransferConfig[] = [
  {
    day: 25,
    amountCents: 30_000,
    fromAccountExternalId: "demo-acc-aurora-checking",
    toAccountExternalId: "demo-acc-aurora-savings",
    fromDescription: "TRANSFERENCIA PARA POUPANCA",
    toDescription: "TRANSFERENCIA DA CONTA CORRENTE",
  },
  {
    day: 5,
    amountCents: 150_000,
    fromAccountExternalId: "demo-acc-aurora-checking",
    toAccountExternalId: "demo-acc-nuvem-checking",
    fromDescription: "TRANSFERENCIA ENVIADA - NUVEM BANK",
    toDescription: "TRANSFERENCIA RECEBIDA - BANCO AURORA",
  },
  {
    day: 22,
    amountCents: 20_000,
    fromAccountExternalId: "demo-acc-horizonte-checking",
    toAccountExternalId: "demo-acc-horizonte-savings",
    fromDescription: "TRANSFERENCIA PARA POUPANCA HORIZONTE",
    toDescription: "TRANSFERENCIA DA CONTA COOPERADA",
  },
];

export interface DemoInvestmentConfig {
  externalId: string;
  name: string;
  type: ProviderInvestmentType;
  subtype: string;
  balanceCents: number;
  amountProfitCents: number;
}

export const DEMO_INVESTMENTS: readonly DemoInvestmentConfig[] = [
  {
    externalId: "demo-inv-cdb-horizonte-2028",
    name: "CDB Cooperativa Horizonte 2028",
    type: "fixed_income",
    subtype: "CDB",
    balanceCents: 850_000,
    amountProfitCents: 64_500,
  },
  {
    externalId: "demo-inv-tesouro-selic-2029",
    name: "Tesouro Selic 2029",
    type: "fixed_income",
    subtype: "TREASURY",
    balanceCents: 520_000,
    amountProfitCents: 38_200,
  },
  {
    externalId: "demo-inv-fundo-horizonte",
    name: "Fundo Multimercado Horizonte",
    type: "fund",
    subtype: "INVESTMENT_FUND",
    balanceCents: 1_280_000,
    amountProfitCents: 96_000,
  },
];

export const DEMO_PIX_OUT_NAMES = [
  "MARIA SOUZA",
  "JOAO PEREIRA",
  "ANA LIMA",
  "CARLOS MELO",
  "FERNANDA ROCHA",
] as const;

export const DEMO_PIX_IN_NAMES = ["MARIA SOUZA", "ESTUDIO NOVO", "AGENCIA PONTE"] as const;

export const DEMO_FREELANCE_CLIENTS = ["ESTUDIO NOVO", "AGENCIA PONTE", "CLIENTE FREELA"] as const;
