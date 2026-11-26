import type { Connection, ReserveStatus, UpcomingBill } from "@fd/contracts";
import { describe, expect, it } from "vitest";

import { ATTENTION_MAX_ITEMS, buildAttentionItems } from "./attention-items";

function connection(overrides: Partial<Connection> & Pick<Connection, "id">): Connection {
  return {
    provider: "demo",
    externalId: `ext-${overrides.id}`,
    institutionId: null,
    status: "active",
    statusDetail: null,
    lastSyncedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-10T12:00:00.000Z",
    ...overrides,
  };
}

function bill(overrides: Partial<UpcomingBill> & Pick<UpcomingBill, "id">): UpcomingBill {
  return {
    accountId: "account-1",
    externalId: `ext-${overrides.id}`,
    dueDate: "2026-11-15",
    closingDate: null,
    totalCents: 120_000,
    minimumPaymentCents: null,
    status: "open",
    accountName: "Cartão Aurora",
    creditCardBrand: "Visa",
    daysUntilDue: 4,
    estimated: false,
    ...overrides,
  };
}

function reserve(id: string, gapCents: number): ReserveStatus {
  return {
    source: { kind: "account", id, name: `Poupança ${id}`, institutionName: null },
    cards: [{ accountId: "card", name: "Cartão", neededCents: 45_000 }],
    neededCents: 45_000,
    reservedCents: 45_000 - gapCents,
    gapCents,
    lastDepositDate: "2026-11-12",
    spentSinceDepositCents: 15_000,
  };
}

describe("buildAttentionItems", () => {
  it("ordena por gravidade: erro, reconexão e fatura próxima do vencimento", () => {
    const items = buildAttentionItems({
      connections: [
        connection({ id: "active" }),
        connection({ id: "login", status: "login_required" }),
        connection({ id: "error", status: "error" }),
        connection({ id: "off", status: "disconnected" }),
      ],
      bills: [
        bill({ id: "far", daysUntilDue: 20 }),
        bill({ id: "soon", daysUntilDue: 3 }),
        bill({ id: "overdue", daysUntilDue: -1, status: "overdue" }),
      ],
    });

    expect(items.map((item) => item.key)).toEqual([
      "connection:error",
      "connection:login",
      "bill:overdue",
    ]);
    expect(items).toHaveLength(ATTENTION_MAX_ITEMS);
  });

  it("não mostra itens quando nada exige ação", () => {
    const items = buildAttentionItems({
      connections: [
        connection({ id: "active" }),
        connection({ id: "sync", status: "syncing" }),
        connection({ id: "off", status: "disconnected" }),
      ],
      bills: [bill({ id: "later", daysUntilDue: 8 })],
    });

    expect(items).toEqual([]);
  });

  it("coloca faturas vencidas antes das que ainda vão vencer", () => {
    const items = buildAttentionItems({
      connections: [],
      bills: [
        bill({ id: "ten", daysUntilDue: 10 }),
        bill({ id: "six", daysUntilDue: 6 }),
        bill({ id: "overdue", daysUntilDue: -2, status: "overdue" }),
      ],
    });

    expect(items.map((item) => item.key)).toEqual(["bill:overdue", "bill:six"]);
  });

  it("não alerta a partir de fatura derivada (valor estimado)", () => {
    const items = buildAttentionItems({
      connections: [],
      bills: [
        bill({ id: "estimated", daysUntilDue: 2, estimated: true }),
        bill({ id: "real", daysUntilDue: 4 }),
      ],
    });

    expect(items.map((item) => item.key)).toEqual(["bill:real"]);
  });

  it("respeita o limite pedido", () => {
    const items = buildAttentionItems({
      connections: [connection({ id: "error", status: "error" })],
      bills: [bill({ id: "soon" })],
      max: 1,
    });

    expect(items.map((item) => item.key)).toEqual(["connection:error"]);
  });

  it("inclui transações sem categoria como tarefa, depois do que exige ação", () => {
    const items = buildAttentionItems({
      connections: [connection({ id: "login", status: "login_required" })],
      bills: [bill({ id: "soon", daysUntilDue: 2 })],
      uncategorizedCount: 12,
    });

    expect(items.map((item) => item.key)).toEqual([
      "connection:login",
      "bill:soon",
      "uncategorized",
    ]);
    expect(items[2]).toMatchObject({ kind: "uncategorized", count: 12 });
  });

  it("ignora contagem nula ou zerada de transações sem categoria", () => {
    expect(buildAttentionItems({ connections: [], bills: [], uncategorizedCount: 0 })).toEqual([]);
    expect(buildAttentionItems({ connections: [], bills: [], uncategorizedCount: null })).toEqual(
      [],
    );
  });
});

describe("reserva para faturas", () => {
  it("entra depois das faturas e antes de classificar, maior falta primeiro", () => {
    const items = buildAttentionItems({
      connections: [],
      bills: [bill({ id: "soon", daysUntilDue: 2 })],
      uncategorizedCount: 3,
      reserves: [reserve("a", 5_000), reserve("b", 15_000), reserve("c", 0)],
      max: 10,
    });

    expect(items.map((item) => item.key)).toEqual([
      "bill:soon",
      "reserve:account:b",
      "reserve:account:a",
      "uncategorized",
    ]);
  });

  it("reserva completa não vira alerta", () => {
    expect(
      buildAttentionItems({ connections: [], bills: [], reserves: [reserve("a", 0)] }),
    ).toEqual([]);
  });
});
