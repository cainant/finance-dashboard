import type { Account, AccountType, Connection, ProviderId } from "@fd/contracts";

/** Rótulos pt-BR dos tipos de conta do contrato. */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  credit_card: "Cartão de crédito",
  investment: "Investimentos",
  other: "Outra",
};

/**
 * Subtipos brutos do provider que refinam o tipo. O banco pode expor duas
 * contas com o mesmo nome e número (ex.: corrente + poupança no Inter), e só o
 * subtipo separa uma da outra na lista.
 */
const ACCOUNT_SUBTYPE_LABELS: Readonly<Record<string, string>> = {
  CHECKING_ACCOUNT: ACCOUNT_TYPE_LABELS.checking,
  SAVINGS_ACCOUNT: ACCOUNT_TYPE_LABELS.savings,
  CREDIT_CARD: ACCOUNT_TYPE_LABELS.credit_card,
};

/**
 * Rótulo curto do tipo da conta (`"Conta corrente"`, `"Poupança"`…). O subtipo
 * do provider tem prioridade quando conhecido; subtipo ausente ou fora do mapa
 * cai no rótulo do tipo.
 */
export function accountTypeLabel(type: AccountType, subtype?: string | null): string {
  const normalizedSubtype = subtype?.trim().toUpperCase();
  const subtypeLabel = normalizedSubtype ? ACCOUNT_SUBTYPE_LABELS[normalizedSubtype] : undefined;
  return subtypeLabel ?? ACCOUNT_TYPE_LABELS[type];
}

/** Texto sem acentos — o cmdk não normaliza e a comparação de nomes também não. */
export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function folded(value: string): string {
  return stripDiacritics(value).toLowerCase();
}

/** `true` quando o nome da conta já diz o tipo ("Poupança", "Cartão Aurora"). */
function nameDescribesType(account: Pick<Account, "name" | "type">, label: string): boolean {
  const name = folded(account.name);
  if (name.includes(folded(label))) {
    return true;
  }
  // "Cartão Aurora Visa" já anuncia que é cartão, mesmo sem dizer "de crédito".
  return account.type === "credit_card" && /(^|[^a-z])(cartao|card)([^a-z]|$)/.test(name);
}

/**
 * Rótulo do tipo para exibir ao lado do nome, ou `null` quando o próprio nome já
 * o contém (evita "Poupança · Poupança" e "Conta Corrente · Conta corrente").
 */
export function accountTypeCaption(
  account: Pick<Account, "name" | "type" | "subtype">,
): string | null {
  const label = accountTypeLabel(account.type, account.subtype);
  return nameDescribesType(account, label) ? null : label;
}

/**
 * Texto de busca da paleta: nome, instituição e tipo, cada um também sem
 * acentos (`"poupanca"` acha "Poupança").
 */
export function accountSearchText(
  account: Pick<Account, "name" | "institutionName" | "type" | "subtype">,
): string {
  const parts = [
    account.name,
    account.institutionName ?? "",
    accountTypeLabel(account.type, account.subtype),
  ];

  return parts
    .filter(Boolean)
    .map((part) => `${part} ${stripDiacritics(part)}`)
    .join(" ");
}

export interface AccountGroup {
  /** connectionId (ou `unknown` quando a conta não tem conexão resolvida). */
  key: string;
  institutionName: string;
  institutionColor: string | null;
  provider: ProviderId | null;
  accounts: Account[];
  /** Soma dos saldos de contas que não são cartão. */
  totalCents: number;
  /** Soma das faturas abertas dos cartões (dívida, positivo). */
  creditCardCents: number;
  /** Saldo das contas menos as faturas abertas dos cartões. */
  netCents: number;
}

/** Search params de `/accounts` que abrem um grupo da sidebar. */
export interface AccountGroupSearch {
  connection: string;
  institution?: string;
}

/**
 * Chave estável de um grupo da sidebar. MeuPluggy pode trazer bancos diferentes
 * no mesmo item, então a instituição da conta entra na chave; sem ela, o grupo
 * é a própria conexão.
 */
export function accountGroupKey(
  connectionId: string | null | undefined,
  institutionName: string | null | undefined,
): string {
  const connection = connectionId ?? "unknown";
  const institution = institutionName?.trim();

  return institution ? `${connection}:${institution}` : connection;
}

/**
 * Converte a chave do grupo em search params de `/accounts`. O primeiro
 * dois-pontos separa a conexão do nome do banco (o nome pode conter `:`).
 */
export function accountGroupSearch(key: string): AccountGroupSearch {
  const separator = key.indexOf(":");
  if (separator <= 0) {
    return { connection: key };
  }

  return {
    connection: key.slice(0, separator),
    institution: key.slice(separator + 1),
  };
}

/** Chave do grupo apontada pelos search params; `null` quando não há filtro. */
export function accountGroupKeyFromSearch(search: {
  connection?: string;
  institution?: string;
}): string | null {
  if (!search.connection) {
    return null;
  }

  return accountGroupKey(search.connection, search.institution);
}

export interface AccountGroupSearchParams {
  connection?: string;
  institution?: string;
}

/**
 * Updater de search dos sub-itens de Contas. Zera o recorte anterior antes de
 * aplicar o novo: um grupo só da conexão (`{ connection }`) não pode herdar o
 * `institution` de uma URL multi-banco, senão o filtro não corresponde a
 * nenhum grupo e a página limpa tudo.
 */
export function accountGroupLinkSearch(
  previous: AccountGroupSearchParams,
  search: AccountGroupSearchParams,
): AccountGroupSearchParams {
  return { ...previous, connection: undefined, institution: undefined, ...search };
}

function sumByType(accounts: readonly Account[], type: AccountType): number {
  return accounts
    .filter((account) => account.type === type)
    .reduce((total, account) => total + account.balanceCents, 0);
}

/**
 * Agrupa contas por instituição (via conexão) e calcula os totais do grupo.
 * Cartões entram como dívida separada para não inflar o saldo consolidado.
 */
export function groupAccountsByInstitution(
  accounts: readonly Account[],
  connections: readonly Connection[],
): AccountGroup[] {
  const connectionsById = new Map(connections.map((connection) => [connection.id, connection]));
  const groups = new Map<string, AccountGroup>();

  for (const account of accounts) {
    const connection = connectionsById.get(account.connectionId);
    const accountInstitution = account.institutionName?.trim() || null;
    // MeuPluggy pode trazer bancos diferentes no mesmo item: a chave inclui a
    // instituição da conta para não misturar saldos de bancos distintos.
    const key = accountGroupKey(connection?.id, accountInstitution);
    const provider = account.provider ?? connection?.provider ?? null;

    const group = groups.get(key) ?? {
      key,
      institutionName:
        accountInstitution ??
        connection?.institution?.name ??
        (provider === "demo" ? "Demonstração" : "Sem instituição"),
      institutionColor: connection?.institution?.primaryColor ?? null,
      provider,
      accounts: [],
      totalCents: 0,
      creditCardCents: 0,
      netCents: 0,
    };

    group.accounts.push(account);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const bankAccounts = group.accounts.filter((account) => account.type !== "credit_card");
    group.totalCents = bankAccounts.reduce((total, account) => total + account.balanceCents, 0);
    group.creditCardCents = sumByType(group.accounts, "credit_card");
    group.netCents = group.totalCents - group.creditCardCents;
  }

  return [...groups.values()].sort((a, b) => {
    const diff = b.totalCents - a.totalCents;
    return diff !== 0 ? diff : a.institutionName.localeCompare(b.institutionName, "pt-BR");
  });
}

/**
 * Conta + instituição para os rótulos de transação. A instituição da conta
 * (banco real no item MeuPluggy) tem prioridade sobre a da conexão (o conector,
 * ex.: "MeuPluggy"); a conexão é só fallback quando a conta não tem banco.
 * A precedência espelha `accountSummaryDto` (`apps/api/src/domain/dto.ts`).
 */
export interface AccountMeta {
  name: string;
  numberMasked: string | null;
  institutionName: string | null;
}

/** Indexa contas por id para a tabela/lista de transações. */
export function buildAccountMetaIndex(
  accounts: readonly Account[],
  connections: readonly Connection[],
): Map<string, AccountMeta> {
  const institutionByConnection = new Map<string, string>();
  for (const connection of connections) {
    const institutionName = connection.institution?.name?.trim();
    if (institutionName) institutionByConnection.set(connection.id, institutionName);
  }

  const meta = new Map<string, AccountMeta>();
  for (const account of accounts) {
    meta.set(account.id, {
      name: account.name,
      numberMasked: account.numberMasked,
      institutionName:
        account.institutionName?.trim() ||
        institutionByConnection.get(account.connectionId) ||
        null,
    });
  }
  return meta;
}

/** Partes do rótulo de conta: uma linha por informação, sem repetição. */
export interface TransactionAccountParts {
  /** Banco da conta (ou o conector, no fallback). */
  institutionName: string | null;
  /** Nome da conta; `null` quando apenas repete a instituição. */
  accountName: string | null;
  /** Número mascarado, usado na segunda linha quando o nome foi omitido. */
  numberMasked: string | null;
  /** Rótulo de uma linha ("Banco Inter" ou "MeuPluggy · GOLD"). */
  label: string | null;
}

/** Comparação de instituição/conta sem caixa, acento nem espaços extras. */
function comparableAccountName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

/**
 * Monta as partes do rótulo de conta usadas nas transações (tabela, cartões,
 * painel e recentes). O banco da própria conta (`accounts.institution_name`)
 * vem primeiro; o nome da conexão é o fallback quando a conta não tem banco.
 * O nome da conta é omitido quando só repete a instituição ("Banco Inter" /
 * "BANCO INTER"), para não trocar um ruído por outro; nesse caso a tabela usa
 * o número mascarado na segunda linha.
 */
export function transactionAccountParts(input: {
  institutionName?: string | null;
  name?: string | null;
  numberMasked?: string | null;
}): TransactionAccountParts {
  const institutionName = input.institutionName?.trim() || null;
  const rawName = input.name?.trim() || null;
  const numberMasked = input.numberMasked?.trim() || null;
  const repeatsInstitution =
    rawName !== null &&
    institutionName !== null &&
    comparableAccountName(rawName) === comparableAccountName(institutionName);
  const accountName = rawName && !repeatsInstitution ? rawName : null;

  return {
    institutionName,
    accountName,
    numberMasked,
    label: [institutionName, accountName].filter(Boolean).join(" · ") || null,
  };
}

/** `true` quando o grupo tem fatura aberta de cartão (dívida em positivo). */
export function groupHasCardDebt(group: AccountGroup): boolean {
  return group.creditCardCents > 0;
}

/**
 * Valor que representa um grupo na UI: com fatura aberta, o líquido (saldos -
 * faturas), o mesmo "Total líquido" da página Contas; sem cartão, o saldo das
 * contas. Num grupo só de cartão o resultado é a dívida, negativa.
 */
export function groupDisplayCents(group: AccountGroup): number {
  return groupHasCardDebt(group) ? group.netCents : group.totalCents;
}

/**
 * "Em contas" de um conjunto de grupos: saldos sem cartões e sem investimentos,
 * a mesma definição de `summarizeAccounts().accountsCents`.
 */
export function groupsAccountsBalanceCents(groups: readonly AccountGroup[]): number {
  return summarizeAccounts(groups.flatMap((group) => group.accounts)).accountsCents;
}

/** Ordena grupos pelo valor exibido (líquido ou saldo), do maior para o menor. */
export function sortGroupsByDisplayCents(groups: readonly AccountGroup[]): AccountGroup[] {
  return [...groups].sort((a, b) => {
    const diff = groupDisplayCents(b) - groupDisplayCents(a);
    return diff !== 0 ? diff : a.institutionName.localeCompare(b.institutionName, "pt-BR");
  });
}

/** Saldo consolidado (contas sem cartão) de uma lista de contas. */
export function totalBalanceCents(accounts: readonly Account[]): number {
  return accounts
    .filter((account) => account.type !== "credit_card")
    .reduce((total, account) => total + account.balanceCents, 0);
}

/** Dívida total das faturas abertas. */
export function totalCreditCardCents(accounts: readonly Account[]): number {
  return accounts
    .filter((account) => account.type === "credit_card")
    .reduce((total, account) => total + account.balanceCents, 0);
}

/**
 * Valor exibido de uma conta: cartão guarda a dívida em positivo (`balanceCents`
 * é a fatura aberta), então aparece negativo — o mesmo sinal do card "Contas"
 * da Visão geral e da página Contas. Demais contas usam o saldo como está.
 */
export function accountDisplayCents(account: Pick<Account, "type" | "balanceCents">): number {
  return account.type === "credit_card" ? -account.balanceCents : account.balanceCents;
}

/** Resumo de patrimônio da lista de contas (centavos). */
export interface AccountsSummary {
  /** Saldos de contas bancárias (exclui cartões e investimentos). */
  accountsCents: number;
  /** Contas do tipo investimento + posições da tabela `investments`. */
  investmentsCents: number;
  /** Faturas abertas dos cartões (dívida em positivo). */
  creditCardCents: number;
  /** Contas + investimentos - faturas abertas. */
  netWorthCents: number;
  /** Quantidade de contas por categoria do resumo. */
  accounts: number;
  investments: number;
}

/** Posição de investimento (tabela `investments`), com o valor líquido. */
export interface InvestmentPosition {
  balanceCents: number;
}

/**
 * Agrega a lista de contas no resumo de patrimônio da coluna lateral.
 * Cartões entram como dívida (subtraem), nunca como saldo disponível.
 *
 * O patrimônio inclui as posições de `investments` (o mesmo total somado pela
 * API no overview e na série patrimonial); sem elas a página Contas divergiria
 * do gráfico.
 */
export function summarizeAccounts(
  accounts: readonly Account[],
  positions: readonly InvestmentPosition[] = [],
): AccountsSummary {
  let accountsCents = 0;
  let accountsCount = 0;
  let investmentsCents = 0;
  let investmentsCount = 0;

  for (const account of accounts) {
    if (account.type === "credit_card") {
      continue;
    }

    if (account.type === "investment") {
      investmentsCents += account.balanceCents;
      investmentsCount += 1;
      continue;
    }

    accountsCents += account.balanceCents;
    accountsCount += 1;
  }

  for (const position of positions) {
    investmentsCents += position.balanceCents;
    investmentsCount += 1;
  }

  const creditCardCents = totalCreditCardCents(accounts);

  return {
    accountsCents,
    investmentsCents,
    creditCardCents,
    netWorthCents: accountsCents + investmentsCents - creditCardCents,
    accounts: accountsCount,
    investments: investmentsCount,
  };
}

/** `true` quando a conta pertence a uma conexão demo. */
export function isDemoAccount(account: Account, connections: readonly Connection[]): boolean {
  if (account.provider) {
    return account.provider === "demo";
  }

  return (
    connections.find((connection) => connection.id === account.connectionId)?.provider === "demo"
  );
}

export interface BalancePoint {
  date: string;
  balanceCents: number;
}

/**
 * Reconstrói a evolução do saldo a partir do saldo atual e das transações.
 * A API não expõe snapshots por conta; o saldo de cada dia é o saldo atual
 * menos a soma das transações posteriores àquele dia.
 */
export function deriveBalanceSeries(
  transactions: ReadonlyArray<{ date: string; amountCents: number }>,
  currentBalanceCents: number,
): BalancePoint[] {
  if (transactions.length === 0) {
    return [];
  }

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const total = sorted.reduce((sum, transaction) => sum + transaction.amountCents, 0);
  let running = currentBalanceCents - total;

  const byDate = new Map<string, number>();
  for (const transaction of sorted) {
    running += transaction.amountCents;
    byDate.set(transaction.date, running);
  }

  return [...byDate.entries()]
    .map(([date, balanceCents]) => ({ date, balanceCents }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
