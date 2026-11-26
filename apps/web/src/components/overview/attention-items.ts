import type { Connection, ConnectionStatus, ReserveStatus, UpcomingBill } from "@fd/contracts";

/** Faturas a até 7 dias do vencimento (inclui as vencidas) entram na faixa. */
export const ATTENTION_BILL_DAYS = 7;

/** A faixa mostra no máximo três itens, do mais grave para o menos grave. */
export const ATTENTION_MAX_ITEMS = 3;

/** 0 = erro, 1 = precisa de ação (reconectar/desatualizada), 2 = tarefa. */
const CONNECTION_SEVERITY: Partial<Record<ConnectionStatus, 0 | 1>> = {
  error: 0,
  login_required: 1,
  outdated: 1,
};

export type AttentionItem =
  | {
      kind: "connection";
      key: string;
      severity: 0 | 1;
      connection: Connection;
    }
  | {
      kind: "bill";
      key: string;
      severity: 2;
      bill: UpcomingBill;
    }
  | {
      kind: "reserve";
      key: string;
      severity: 2;
      reserve: ReserveStatus;
    }
  | {
      kind: "uncategorized";
      key: "uncategorized";
      severity: 2;
      count: number;
    };

export interface AttentionInput {
  connections: readonly Connection[];
  bills: readonly UpcomingBill[];
  /**
   * Transações sem categoria. O endpoint que conta isso é opcional: quando a
   * contagem não estiver disponível, basta omitir (ou passar `null`).
   */
  uncategorizedCount?: number | null;
  /** Reservas para faturas; entram as que ainda têm valor a guardar. */
  reserves?: readonly ReserveStatus[];
  max?: number;
}

/**
 * Monta a faixa "Requer atenção" ordenada por gravidade — conexões com erro,
 * conexões que precisam de nova autorização, faturas vencendo em até 7 dias
 * (as vencidas vêm antes entre as faturas), reservas para faturas com valor a
 * guardar e transações sem categoria. Só
 * entram conexões que exigem uma ação; `active`, `syncing` e `disconnected`
 * ficam de fora. Faturas `estimated` (derivadas do ciclo em andamento) também
 * ficam de fora: o valor ainda está incompleto.
 */
export function buildAttentionItems({
  connections,
  bills,
  uncategorizedCount,
  reserves = [],
  max = ATTENTION_MAX_ITEMS,
}: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const connection of connections) {
    const severity = CONNECTION_SEVERITY[connection.status];
    if (severity === undefined) {
      continue;
    }

    items.push({
      kind: "connection",
      key: `connection:${connection.id}`,
      severity,
      connection,
    });
  }

  const dueBills = bills
    .filter((bill) => bill.daysUntilDue <= ATTENTION_BILL_DAYS)
    // Fatura derivada (`estimated`) é parcial: alertar com o valor do ciclo
    // em andamento subestimaria a conta. Ela aparece em "Próximas faturas"
    // com o rótulo "estimada", mas não vira alerta.
    .filter((bill) => !bill.estimated)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  for (const bill of dueBills) {
    items.push({ kind: "bill", key: `bill:${bill.id}`, severity: 2, bill });
  }

  // Reserva com falta: depois das faturas (vencimento é prazo), antes de
  // classificar transações; a maior falta primeiro.
  const shortReserves = reserves
    .filter((reserve) => reserve.gapCents > 0)
    .toSorted((a, b) => b.gapCents - a.gapCents);
  for (const reserve of shortReserves) {
    items.push({
      kind: "reserve",
      key: `reserve:${reserve.source.kind}:${reserve.source.id}`,
      severity: 2,
      reserve,
    });
  }

  if (typeof uncategorizedCount === "number" && uncategorizedCount > 0) {
    items.push({
      kind: "uncategorized",
      key: "uncategorized",
      severity: 2,
      count: uncategorizedCount,
    });
  }

  return items.sort((a, b) => a.severity - b.severity).slice(0, Math.max(0, max));
}
