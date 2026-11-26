import { describe, expect, it, vi } from "vitest";

import {
  MAX_SYNC_SLICES,
  pendingDemoConnections,
  syncConnectionsUntilComplete,
  syncDemoConnections,
  type ConnectDemoProgress,
  type DemoConnectionRef,
} from "./mutations";

function demoConnection(
  id: string,
  lastSyncedAt: string | null = null,
  statusDetail: string | null = null,
): DemoConnectionRef {
  return { id, provider: "demo", lastSyncedAt, statusDetail };
}

/** Simula a API: cada `sync` conclui uma conexão e a listagem reflete isso. */
function demoBackend(initial: DemoConnectionRef[]) {
  let current = initial.map((connection) => ({ ...connection }));
  const sync = vi.fn(async (id: string) => {
    current = current.map((connection) =>
      connection.id === id
        ? { ...connection, lastSyncedAt: "2026-11-10T12:00:00.000Z", statusDetail: null }
        : connection,
    );
  });

  return {
    sync,
    listConnections: async () => current.map((connection) => ({ ...connection })),
  };
}

describe("pendingDemoConnections", () => {
  it("seleciona conexões demo nunca sincronizadas ou com histórico fatiado", () => {
    const connections: DemoConnectionRef[] = [
      demoConnection("aurora"),
      demoConnection("nuvem", "2026-11-10T12:00:00.000Z", "PARTIAL_SYNC"),
      demoConnection("horizonte", "2026-11-10T12:00:00.000Z"),
      { id: "pluggy-1", provider: "pluggy", lastSyncedAt: null },
    ];

    expect(pendingDemoConnections(connections).map((connection) => connection.id)).toEqual([
      "aurora",
      "nuvem",
    ]);
  });

  it("não repete conexões já sincronizadas por completo", () => {
    expect(pendingDemoConnections([demoConnection("aurora", "2026-11-10T12:00:00.000Z")])).toEqual(
      [],
    );
  });
});

describe("syncDemoConnections", () => {
  it("sincroniza todas as conexões pendentes e reporta o progresso", async () => {
    const connections = [
      demoConnection("aurora"),
      demoConnection("nuvem"),
      demoConnection("horizonte"),
    ];
    const backend = demoBackend(connections);
    const progress: ConnectDemoProgress[] = [];

    const result = await syncDemoConnections(connections, backend, (value) => progress.push(value));

    expect(backend.sync.mock.calls.map(([id]) => id)).toEqual(["aurora", "nuvem", "horizonte"]);
    expect(result).toEqual({ total: 3, synced: 3, failed: [] });
    expect(progress.at(-1)).toMatchObject({ completed: 3, total: 3, slice: 3 });
    expect(progress.every((value) => value.slice !== undefined)).toBe(true);
  });

  it("continua uma conexão já sincronizada que ficou em PARTIAL_SYNC", async () => {
    const connections = [demoConnection("aurora", "2026-11-10T11:00:00.000Z", "PARTIAL_SYNC")];
    const backend = demoBackend(connections);

    const result = await syncDemoConnections(connections, backend);

    expect(backend.sync).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ total: 1, synced: 1, failed: [] });
  });

  it("tolera falha e devolve o que ficou pendente", async () => {
    const connections = [
      demoConnection("aurora"),
      demoConnection("nuvem"),
      demoConnection("horizonte"),
    ];
    const inner = demoBackend(connections);
    const sync = vi.fn(async (id: string) => {
      if (id === "nuvem") {
        throw new Error("provider indisponível");
      }
      await inner.sync(id);
    });

    const result = await syncDemoConnections(connections, {
      sync,
      listConnections: inner.listConnections,
    });

    expect(sync.mock.calls.map(([id]) => id)).toEqual(["aurora", "nuvem"]);
    expect(result.total).toBe(3);
    expect(result.synced).toBe(1);
    expect(result.failed.map((failure) => failure.id)).toEqual(["nuvem", "horizonte"]);
  });

  it("limita o número de fatias e informa que o histórico ficou incompleto", async () => {
    const connections = [demoConnection("aurora")];
    const backend = demoBackend(connections);
    backend.sync.mockImplementation(async () => {
      // Status nunca muda: simula uma API que continua devolvendo PARTIAL_SYNC.
    });

    const result = await syncDemoConnections(connections, { ...backend, maxSlices: 2 });

    expect(backend.sync).toHaveBeenCalledTimes(2);
    expect(result.failed).toHaveLength(1);
    expect(MAX_SYNC_SLICES).toBeGreaterThan(2);
  });

  it("não chama a API quando não há conexão pendente", async () => {
    const backend = demoBackend([]);

    const result = await syncDemoConnections([], backend);

    expect(backend.sync).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 0, synced: 0, failed: [] });
  });
});

describe("syncConnectionsUntilComplete", () => {
  it("para assim que o status deixa de ser PARTIAL_SYNC", async () => {
    const connections = [demoConnection("pluggy-1", "2026-11-10T11:00:00.000Z", "PARTIAL_SYNC")];
    const backend = demoBackend(connections);

    const result = await syncConnectionsUntilComplete(connections, backend);

    expect(backend.sync).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ slices: 1, complete: true });
  });

  it("força um sync incremental quando não há fatia pendente", async () => {
    const connections = [demoConnection("pluggy-1", "2026-11-10T11:00:00.000Z")];
    const backend = demoBackend(connections);
    const progress: ConnectDemoProgress[] = [];

    const result = await syncConnectionsUntilComplete(
      connections,
      { ...backend, forceFirstSync: true },
      (value) => progress.push(value),
    );

    expect(backend.sync).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ slices: 1, complete: true });
    expect(progress.every((value) => value.slice === undefined)).toBe(true);
    // Sync manual fora de fatia: pede dados novos ao provider na 1ª chamada.
    expect(backend.sync).toHaveBeenCalledWith("pluggy-1", { refresh: true });
  });

  it("não pede refresh durante uma fatia de histórico", async () => {
    const connections = [demoConnection("pluggy-1", "2026-11-10T11:00:00.000Z", "PARTIAL_SYNC")];
    const backend = demoBackend(connections);

    await syncConnectionsUntilComplete(connections, backend);

    expect(backend.sync).toHaveBeenCalledWith("pluggy-1", { refresh: false });
  });

  it("expõe o erro da chamada de sync", async () => {
    const connections = [demoConnection("pluggy-1", "2026-11-10T11:00:00.000Z", "PARTIAL_SYNC")];
    const error = new Error("provider indisponível");

    const result = await syncConnectionsUntilComplete(connections, {
      sync: async () => {
        throw error;
      },
      listConnections: async () => connections,
    });

    expect(result.failure).toEqual({ id: "pluggy-1", error });
    expect(result.complete).toBe(false);
  });
});
