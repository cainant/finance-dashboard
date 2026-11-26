import type { Connection } from "@fd/contracts";

import type { StatusTone } from "@/components/domain/status-dot";
import { formatRelativeTimeShort } from "@/lib/connections";

export interface SyncStatusView {
  tone: StatusTone;
  pulse: boolean;
  text: string;
}

/** Texto/estado do rodapé derivado do pior estado entre as conexões. */
export function deriveSyncStatus(connections: readonly Connection[]): SyncStatusView {
  if (connections.length === 0) {
    return { tone: "neutral", pulse: false, text: "Nenhuma conexão" };
  }

  const errors = connections.filter((connection) => connection.status === "error").length;
  if (errors > 0) {
    return {
      tone: "danger",
      pulse: false,
      text: errors === 1 ? "1 conexão com erro" : `${errors} conexões com erro`,
    };
  }

  const attention = connections.filter(
    (connection) => connection.status === "login_required" || connection.status === "outdated",
  ).length;
  if (attention > 0) {
    return {
      tone: "warning",
      pulse: false,
      text:
        attention === 1
          ? "1 conexão precisa de atenção"
          : `${attention} conexões precisam de atenção`,
    };
  }

  if (connections.some((connection) => connection.status === "syncing")) {
    return { tone: "info", pulse: true, text: "Sincronizando…" };
  }

  const active = connections.filter((connection) => connection.status === "active");
  if (active.length === 0) {
    return { tone: "neutral", pulse: false, text: "Nenhuma conexão ativa" };
  }

  const lastSyncedAt =
    active
      .map((connection) => connection.lastSyncedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  return {
    tone: "success",
    pulse: false,
    text: lastSyncedAt ? `Sincronizado ${formatRelativeTimeShort(lastSyncedAt)}` : "Sincronizado",
  };
}

/** Conexão que o botão de sincronizar deve acionar (pior estado primeiro). */
export function pickSyncTarget(connections: readonly Connection[]): Connection | null {
  const priority: Connection["status"][] = [
    "error",
    "login_required",
    "outdated",
    "syncing",
    "active",
  ];

  for (const status of priority) {
    const found = connections.find((connection) => connection.status === status);
    if (found) {
      return found;
    }
  }

  return connections.find((connection) => connection.status !== "disconnected") ?? null;
}
