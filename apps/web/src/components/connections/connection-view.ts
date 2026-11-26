import type { Account, Connection, ProviderId } from "@fd/contracts";

import { formatRelativeTime } from "../../lib/connections";
import { formatDate } from "../../lib/format";
import type { ConnectDemoProgress, ConnectDemoStep } from "../../lib/mutations";

/** Rótulo do provider na UI (o selo de demonstração é sempre separado). */
export const PROVIDER_LABELS: Record<ProviderId, string> = {
  demo: "Provider demo",
  pluggy: "Pluggy · Open Finance",
};

export function providerLabel(provider: ProviderId): string {
  return PROVIDER_LABELS[provider];
}

/** Nome exibido da conexão: instituição quando houver, senão o provider. */
export function connectionDisplayName(
  connection: Pick<Connection, "provider" | "institution">,
): string {
  if (connection.institution?.name) {
    return connection.institution.name;
  }

  return connection.provider === "demo" ? "Demonstração" : "Pluggy";
}

/**
 * `true` para itens do conector MeuPluggy (id 200 confirmado no catálogo).
 * O id é a checagem principal; o nome normalizado cobre mudanças de catálogo.
 */
export function isMeuPluggyConnection(connection: Pick<Connection, "institution">): boolean {
  const institution = connection.institution;
  if (!institution) return false;
  if (institution.externalId === "200") return true;
  return institution.name.trim().toLowerCase().replace(/\s+/g, "") === "meupluggy";
}

/**
 * Instituições autorizadas nas contas de um item, sem repetição.
 *
 * Em itens MeuPluggy o conector é sempre o mesmo ("MeuPluggy"), então é a conta
 * (`institutionName`, derivado do COMPE ou do nome do cartão) que diz qual banco
 * foi autorizado. Contas sem instituição ficam de fora quando outra conta do
 * item já identifica o banco: o cartão pertence ao mesmo item.
 */
export function authorizedInstitutionNames(
  accounts: readonly Pick<Account, "institutionName">[],
): string[] {
  return uniqueNames(accounts.map((account) => account.institutionName));
}

/** Máximo de nomes no título; o restante vira "+N". */
export const MAX_TITLE_NAMES = 3;

/**
 * Reserva quando nenhuma conta do item tem instituição (conta e cartão sem COMPE
 * e sem banco no nome): usa o nome das contas, nunca o do conector — repetir
 * "MeuPluggy" nos dois cards era o bug original.
 */
export function accountLabelFallbacks(
  accounts: readonly Pick<Account, "institutionName" | "name">[],
): string[] {
  return uniqueNames(accounts.map((account) => account.institutionName ?? account.name));
}

/** Nomes sem repetição (caixa/espaços não contam), mantendo a ordem das contas. */
function uniqueNames(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const value of values) {
    const name = value?.trim();
    if (!name) continue;

    const key = name.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;

    seen.add(key);
    names.push(name);
  }

  return names;
}

/** Junta os nomes no título, cortando em `MAX_TITLE_NAMES` com "+N". */
function joinTitleNames(names: readonly string[]): string {
  const shown = names.slice(0, MAX_TITLE_NAMES);
  const hidden = names.length - shown.length;
  const title = shown.join(" · ");
  return hidden > 0 ? `${title} +${hidden}` : title;
}

/**
 * Título do card: a(s) instituição(ões) autorizada(s) — é o que diferencia duas
 * conexões do mesmo conector. Só itens MeuPluggy têm mais de um banco possível;
 * nos demais o título é o nome da conexão, como sempre foi. Sem nenhuma
 * instituição conhecida, cai no nome das contas e, por último, no da conexão.
 */
export function connectionTitle(
  connection: Pick<Connection, "provider" | "institution">,
  accounts: readonly Pick<Account, "institutionName" | "name">[] = [],
): string {
  if (!isMeuPluggyConnection(connection)) {
    return connectionDisplayName(connection);
  }

  const institutions = authorizedInstitutionNames(accounts);
  if (institutions.length > 0) {
    return joinTitleNames(institutions);
  }

  const fallbacks = accountLabelFallbacks(accounts);
  return fallbacks.length > 0 ? joinTitleNames(fallbacks) : connectionDisplayName(connection);
}

/**
 * Nome que representa a conexão no avatar: a primeira instituição (o #47 busca
 * logo por nome e "Banco Inter · Nubank" não casaria com nada).
 */
export function connectionPrimaryName(
  connection: Pick<Connection, "provider" | "institution">,
  accounts: readonly Pick<Account, "institutionName" | "name">[] = [],
): string {
  const institutions = authorizedInstitutionNames(accounts);
  return institutions[0] ?? connectionDisplayName(connection);
}

/** Conta mínima para montar títulos de conexão. */
export type ConnectionAccountLike = Pick<Account, "institutionName" | "name"> & {
  connectionId: string;
};

/**
 * Títulos de todas as conexões da lista, com desempate.
 *
 * Reconectar o MeuPluggy pode criar um item novo para o mesmo banco: dois cards
 * ficariam com o mesmo título (e os mesmos aria-labels, inclusive no diálogo
 * destrutivo). Quando dois títulos coincidem, a data de criação entra no título
 * de todos os empatados.
 */
export function connectionTitles(
  connections: readonly Pick<Connection, "id" | "provider" | "institution" | "createdAt">[],
  accounts: readonly ConnectionAccountLike[],
): Map<string, string> {
  const accountsByConnection = new Map<string, ConnectionAccountLike[]>();
  for (const account of accounts) {
    const list = accountsByConnection.get(account.connectionId) ?? [];
    list.push(account);
    accountsByConnection.set(account.connectionId, list);
  }

  const base = new Map<string, string>();
  const occurrences = new Map<string, number>();
  for (const connection of connections) {
    const title = connectionTitle(connection, accountsByConnection.get(connection.id) ?? []);
    base.set(connection.id, title);

    const key = title.toLocaleLowerCase("pt-BR");
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
  }

  const titles = new Map<string, string>();
  for (const connection of connections) {
    const title = base.get(connection.id) ?? "";
    const duplicated = (occurrences.get(title.toLocaleLowerCase("pt-BR")) ?? 0) > 1;
    titles.set(
      connection.id,
      duplicated ? `${title} · criada em ${formatDate(connection.createdAt)}` : title,
    );
  }

  return titles;
}

/** Meta do provider no card; no MeuPluggy o conector aparece como "via …". */
export function connectionProviderMeta(
  connection: Pick<Connection, "provider" | "institution">,
): string {
  if (!isMeuPluggyConnection(connection)) {
    return providerLabel(connection.provider);
  }

  return `via ${connection.institution?.name.trim() || "MeuPluggy"}`;
}

/** Rótulo de validade do consentimento (MeuPluggy: 1 ano). */
export function consentExpiryLabel(
  consentExpiresAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!consentExpiresAt) return null;
  const expires = new Date(consentExpiresAt);
  if (Number.isNaN(expires.getTime())) return null;

  const days = Math.ceil((expires.getTime() - now.getTime()) / 86_400_000);
  const formatted = formatDate(consentExpiresAt.slice(0, 10));
  if (days < 0) return `Autorização expirada em ${formatted}`;
  if (days <= 30) return `Autorização expira em ${formatted} (${days} dias)`;
  return `Autorização válida até ${formatted}`;
}

/** Texto da última sincronização, com o relativo pt-BR já formatado. */
export function connectionLastSyncLabel(
  lastSyncedAt: string | null | undefined,
  now?: Date,
): string {
  if (!lastSyncedAt) {
    return "Nunca sincronizada";
  }

  return `Última sincronização ${formatRelativeTime(lastSyncedAt, now)}`;
}

/**
 * Frescor do dado no provider (`Item.lastUpdatedAt`), separado da hora da
 * leitura local. No MeuPluggy o banco só atualiza no ciclo de 24h do proxy;
 * a leitura pode ser recente com o dado ainda de ontem.
 */
export function connectionProviderFreshnessLabel(
  providerUpdatedAt: string | null | undefined,
  now?: Date,
): string | null {
  if (!providerUpdatedAt) return null;
  if (Number.isNaN(new Date(providerUpdatedAt).getTime())) return null;

  return `Dados do banco atualizados ${formatRelativeTime(providerUpdatedAt, now)}`;
}

/**
 * Aviso do MeuPluggy (uma vez por página; antes se repetia em cada card e no
 * bloco "Adicionar conexão"). Onde ele aparece é decidido por
 * `meuPluggyNoticePlacement`.
 */
export const MEU_PLUGGY_REFRESH_NOTICE =
  "O MeuPluggy atualiza os dados a cada 24h; “Atualizar” apenas relê o que já foi autorizado.";

export interface MeuPluggyNoticePlacement {
  /** Topo da lista: já existe conexão MeuPluggy para explicar. */
  list: boolean;
  /** Bloco de adicionar: quem conecta pela primeira vez precisa saber. */
  add: boolean;
}

/**
 * Onde o aviso das 24h aparece. Com conexão MeuPluggy, a lista explica o botão
 * Atualizar; sem nenhuma, o bloco de adicionar é o único lugar onde ele faz
 * sentido. Nunca nos dois.
 */
export function meuPluggyNoticePlacement(
  connections: readonly Pick<Connection, "institution">[],
): MeuPluggyNoticePlacement {
  const hasMeuPluggy = connections.some((connection) => isMeuPluggyConnection(connection));
  return { list: hasMeuPluggy, add: !hasMeuPluggy };
}

/** Duração legível de um sync-run; `null` quando ainda está em execução. */
export function syncRunDurationLabel(
  startedAt: string,
  finishedAt: string | null | undefined,
): string | null {
  if (!finishedAt) {
    return null;
  }

  const started = new Date(startedAt).getTime();
  const finished = new Date(finishedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) {
    return null;
  }

  const seconds = Math.round((finished - started) / 1000);
  if (seconds < 60) {
    return `${seconds} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes} min` : `${minutes} min ${remainder} s`;
}

/** Texto curto do progresso fatiado, quando a API pagina o histórico. */
export function syncSliceLabel(slice: number | null | undefined): string | null {
  return typeof slice === "number" && slice > 0 ? `Importando histórico… fatia ${slice}` : null;
}

/** Texto do botão no passo atual do fluxo de demonstração. */
export function demoConnectProgressLabel(
  step: ConnectDemoStep,
  progress?: ConnectDemoProgress | null,
): string {
  switch (step) {
    case "creating":
      return "Criando conexão…";
    case "syncing": {
      const slice = progress?.slice;
      if (typeof slice === "number" && slice > 0) {
        return `Importando… fatia ${slice}`;
      }

      if (progress && progress.total > 0) {
        if (progress.completed >= progress.total) {
          return "Finalizando…";
        }

        return `Sincronizando ${Math.min(progress.completed + 1, progress.total)}/${progress.total}…`;
      }

      return "Sincronizando dados…";
    }
    case "done":
      return "Demonstração conectada";
    case "idle":
    default:
      return "Conectar demonstração";
  }
}

/** Linha de status detalhada exibida enquanto a demonstração é preparada. */
export function demoConnectStatusLabel(
  step: ConnectDemoStep,
  progress?: ConnectDemoProgress | null,
): string {
  if (step !== "syncing" || !progress || progress.total === 0) {
    return step === "creating"
      ? "Criando conexão de demonstração…"
      : "Sincronizando contas, transações e faturas…";
  }

  const sliceLabel = syncSliceLabel(progress.slice);
  if (sliceLabel) {
    return sliceLabel;
  }

  if (progress.completed >= progress.total) {
    return "Finalizando sincronização…";
  }

  return `Sincronizando ${Math.min(progress.completed + 1, progress.total)}/${progress.total} conexões demo…`;
}
