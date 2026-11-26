import { expect, type APIRequestContext } from "@playwright/test";

/** Cabeçalho exigido pela API para mutações (proteção CSRF). */
export const API_HEADERS = { "X-Requested-With": "fetch" } as const;

/** Teto de segurança: o demo completa em ~4 fatias; nunca deixe o teste em loop. */
export const MAX_DEMO_SYNC_SLICES = 12;

export interface DemoConnectionState {
  id: string;
  provider: string;
  lastSyncedAt: string | null;
  statusDetail: string | null;
}

/** `true` enquanto a API ainda tem fatias do histórico demo para importar. */
export function isPartialDemoConnection(connection: DemoConnectionState): boolean {
  return connection.lastSyncedAt === null || connection.statusDetail === "PARTIAL_SYNC";
}

/** Lista as conexões da sessão e filtra apenas as do provider demo. */
export async function listDemoConnections(
  request: APIRequestContext,
): Promise<DemoConnectionState[]> {
  const response = await request.get("/api/connections");
  expect(response.ok(), `GET /api/connections falhou (HTTP ${response.status()})`).toBeTruthy();

  const body = (await response.json()) as { data: DemoConnectionState[] };
  return body.data.filter((connection) => connection.provider === "demo");
}

/**
 * Completa o histórico demo fatiado chamando `POST /api/connections/:id/sync`
 * enquanto alguma conexão estiver com `PARTIAL_SYNC` (ou nunca sincronizada).
 * O endpoint demo sincroniza as três instituições no mesmo POST.
 */
export async function syncPendingDemoConnections(
  request: APIRequestContext,
): Promise<{ pending: number; synced: number; slices: number }> {
  const initial = (await listDemoConnections(request)).filter(isPartialDemoConnection);
  if (initial.length === 0) {
    return { pending: 0, synced: 0, slices: 0 };
  }

  let pending = initial;
  let slices = 0;

  while (pending.length > 0 && slices < MAX_DEMO_SYNC_SLICES) {
    const target = pending[0]!;
    const response = await request.post(`/api/connections/${target.id}/sync`, {
      headers: API_HEADERS,
    });
    expect(response.ok(), `sync demo ${target.id} falhou (HTTP ${response.status()})`).toBeTruthy();

    slices += 1;
    pending = (await listDemoConnections(request)).filter(isPartialDemoConnection);
  }

  expect(
    pending.map((connection) => connection.id),
    `histórico demo incompleto após ${slices} fatias`,
  ).toEqual([]);

  return { pending: initial.length, synced: initial.length, slices };
}

/**
 * Conta as transações do período percorrendo todas as páginas do cursor.
 * Usado para provar que o histórico de 12 meses foi importado por inteiro.
 */
export async function countTransactionsInPeriod(
  request: APIRequestContext,
  from: string,
  to: string,
): Promise<number> {
  let cursor: string | null = null;
  let total = 0;

  do {
    const search = new URLSearchParams({ from, to, limit: "200" });
    if (cursor) search.set("cursor", cursor);

    const response = await request.get(`/api/transactions?${search.toString()}`);
    expect(response.ok(), `GET /api/transactions falhou (HTTP ${response.status()})`).toBeTruthy();

    const body = (await response.json()) as {
      data: unknown[];
      page: { nextCursor: string | null };
    };
    total += body.data.length;
    cursor = body.page.nextCursor;
  } while (cursor !== null && total < 5_000);

  return total;
}

/**
 * Garante o dataset demo completo antes de capturar telas ou medir layout:
 * cria as três conexões quando o banco está vazio e sincroniza até o fim.
 */
export async function ensureDemoData(request: APIRequestContext): Promise<void> {
  const demo = await listDemoConnections(request);

  if (demo.length === 0) {
    const created = await request.post("/api/connections", {
      data: { provider: "demo" },
      headers: API_HEADERS,
    });
    expect(created.ok(), `POST demo falhou (HTTP ${created.status()})`).toBeTruthy();
  }

  await syncPendingDemoConnections(request);
}
