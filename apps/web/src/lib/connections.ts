import type { ConnectionStatus, SyncRunStatus } from "@fd/contracts";

import type { StatusTone } from "@/components/domain/status-dot";
import type { BadgeProps } from "@/components/ui/badge";

export interface ConnectionStatusMeta {
  label: string;
  tone: StatusTone;
  pulse: boolean;
  description: string;
}

/** Tradução do status técnico da conexão para a UI. */
export const CONNECTION_STATUS_META: Record<ConnectionStatus, ConnectionStatusMeta> = {
  active: {
    label: "Ativa",
    tone: "success",
    pulse: false,
    description: "Sincronizando normalmente.",
  },
  syncing: {
    label: "Sincronizando",
    tone: "info",
    pulse: true,
    description: "Buscando dados novos no provider.",
  },
  error: {
    label: "Erro",
    tone: "danger",
    pulse: false,
    description: "A última sincronização falhou. Tente novamente.",
  },
  login_required: {
    label: "Reconectar",
    tone: "warning",
    pulse: false,
    description: "O provider pediu uma nova autorização.",
  },
  outdated: {
    label: "Desatualizada",
    tone: "warning",
    pulse: false,
    description:
      "A última atualização no banco falhou, mas os dados anteriores seguem disponíveis. Tente atualizar ou reconectar.",
  },
  disconnected: {
    label: "Desconectada",
    tone: "neutral",
    pulse: false,
    description: "A conexão foi desligada.",
  },
};

export function connectionStatusMeta(status: ConnectionStatus): ConnectionStatusMeta {
  return CONNECTION_STATUS_META[status];
}

/**
 * Existe alguma instituição ainda viva? Tudo que não é `disconnected` conta,
 * inclusive `login_required`, `error` e `outdated`: nessas conexões há
 * instituição para reconectar/atualizar, não para adicionar outra. Só quando
 * todas foram desconectadas o convite a conectar volta a ser a ação primária.
 */
export function hasLiveConnections(
  connections: ReadonlyArray<{ status: ConnectionStatus }>,
): boolean {
  return connections.some((connection) => connection.status !== "disconnected");
}

/** Variante da pill que acompanha cada tom de status (cor é sinal, não fundo). */
export const STATUS_TONE_BADGE_VARIANT: Record<StatusTone, NonNullable<BadgeProps["variant"]>> = {
  success: "positive",
  warning: "warning",
  danger: "negative",
  info: "info",
  neutral: "secondary",
};

export const SYNC_RUN_STATUS_META: Record<SyncRunStatus, { label: string; tone: StatusTone }> = {
  running: { label: "Em execução", tone: "info" },
  success: { label: "Concluída", tone: "success" },
  error: { label: "Falhou", tone: "danger" },
};

/** Texto relativo em pt-BR ("há 5 min", "em 2 dias"). */
export function formatRelativeTime(
  value: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) {
    return "Nunca sincronizada";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Data inválida";
  }

  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  const thresholds: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];

  for (const [unit, seconds] of thresholds) {
    if (Math.abs(diffSeconds) >= seconds) {
      return formatter.format(Math.round(diffSeconds / seconds), unit);
    }
  }

  return "agora mesmo";
}

/**
 * Versão curta para espaços estreitos (rodapé da sidebar): "agora", "há 3 min",
 * "há 2 h", "há 5 d", "há 2 meses", "há 1 ano".
 */
export function formatRelativeTimeShort(
  value: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) {
    return "Nunca";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Data inválida";
  }

  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);

  if (abs < 60) {
    return "agora";
  }

  const prefix = diffSeconds < 0 ? "há" : "em";

  if (abs < 60 * 60) {
    return `${prefix} ${Math.round(abs / 60)} min`;
  }

  if (abs < 60 * 60 * 24) {
    return `${prefix} ${Math.round(abs / (60 * 60))} h`;
  }

  if (abs < 60 * 60 * 24 * 30) {
    return `${prefix} ${Math.round(abs / (60 * 60 * 24))} d`;
  }

  if (abs < 60 * 60 * 24 * 365) {
    const months = Math.round(abs / (60 * 60 * 24 * 30));

    return `${prefix} ${months} ${months === 1 ? "mês" : "meses"}`;
  }

  const years = Math.round(abs / (60 * 60 * 24 * 365));

  return `${prefix} ${years} ${years === 1 ? "ano" : "anos"}`;
}

/** Resumo curto dos contadores de um sync-run. */
export function syncRunSummary(
  stats: {
    accounts?: number;
    transactions?: number;
    bills?: number;
    investments?: number;
  } | null,
): string {
  if (!stats) {
    return "Sem estatísticas";
  }

  const parts: string[] = [];
  if (typeof stats.transactions === "number") {
    parts.push(`${stats.transactions} transações`);
  }
  if (typeof stats.accounts === "number") {
    parts.push(`${stats.accounts} contas`);
  }
  if (typeof stats.bills === "number") {
    parts.push(`${stats.bills} faturas`);
  }
  if (typeof stats.investments === "number") {
    parts.push(`${stats.investments} investimentos`);
  }

  return parts.length > 0 ? parts.join(" · ") : "Sem estatísticas";
}
