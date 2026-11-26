import { env } from "cloudflare:test";
import {
  accountsResponse,
  addDays,
  categoriesResponse,
  connectionsResponse,
  idSchema,
  syncRunResponse,
  syncRunsResponse,
  todayIsoDate,
  transactionSchema,
  transactionsResponse,
  type Transaction,
} from "@fd/contracts";
import {
  accounts,
  balanceSnapshots,
  bills,
  categories,
  connections,
  investments,
  syncRuns,
  transactions,
} from "@fd/database/schema";
import { and, count, desc, eq, isNotNull, lte, ne, sum } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runScheduledSync } from "../src/sync/cron";
import { authedRequest, createSessionCookie, createTestUser, db, resetDatabase } from "./helpers";

const SYSTEM_CATEGORIES = [
  ["mercado", "Mercado", "expense", "ShoppingCart", "#22c55e"],
  ["restaurantes", "Restaurantes", "expense", "UtensilsCrossed", "#f97316"],
  ["transporte", "Transporte", "expense", "Car", "#3b82f6"],
  ["moradia", "Moradia", "expense", "House", "#8b5cf6"],
  ["contas-e-servicos", "Contas & Serviços", "expense", "ReceiptText", "#06b6d4"],
  ["saude", "Saúde", "expense", "HeartPulse", "#ef4444"],
  ["educacao", "Educação", "expense", "GraduationCap", "#6366f1"],
  ["lazer", "Lazer", "expense", "Gamepad2", "#ec4899"],
  ["compras", "Compras", "expense", "ShoppingBag", "#f59e0b"],
  ["assinaturas", "Assinaturas", "expense", "Repeat", "#a855f7"],
  ["viagem", "Viagem", "expense", "Plane", "#14b8a6"],
  ["pets", "Pets", "expense", "PawPrint", "#84cc16"],
  ["impostos-e-taxas", "Impostos & Taxas", "expense", "Landmark", "#64748b"],
  ["transferencias", "Transferências", "transfer", "ArrowLeftRight", "#94a3b8"],
  ["salario", "Salário", "income", "Wallet", "#10b981"],
  ["freelance", "Freelance", "income", "Briefcase", "#0ea5e9"],
  ["rendimentos", "Rendimentos", "income", "TrendingUp", "#eab308"],
  ["pix-recebido", "Pix recebido", "income", "QrCode", "#2dd4bf"],
  ["outros", "Outros", "expense", "CircleEllipsis", "#71717a"],
] as const;

async function seedCategories(): Promise<void> {
  const values = SYSTEM_CATEGORIES.map(([slug, name, kind, icon, color]) => ({
    id: `cat_${slug}`,
    userId: null,
    name,
    slug,
    icon,
    color,
    kind,
    parentId: null,
  }));
  // D1 limita 100 variáveis por statement (8 colunas por linha).
  for (let index = 0; index < values.length; index += 8) {
    await db.insert(categories).values(values.slice(index, index + 8));
  }
}

async function demoConnectionId(cookie: string): Promise<string> {
  const response = await authedRequest("/api/connections", cookie, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "demo" }),
  });
  expect(response.status).toBe(201);
  const json = (await response.json()) as { data: { id: string } };
  return idSchema.parse(json.data.id);
}

async function syncOnce(cookie: string, id: string) {
  const response = await authedRequest(`/api/connections/${id}/sync`, cookie, { method: "POST" });
  expect(response.status).toBe(200);
  return syncRunResponse.parse(await response.json());
}

/**
 * O demo pagina o histórico em fatias de 60 transações por conta (CPU do
 * Free). Repete o POST até **todas** as conexões demo do usuário não terem
 * mais `_pending` (o POST sincroniza as três).
 */
async function syncToCompletion(cookie: string, id: string, maxRuns = 12) {
  const [target] = await db
    .select({ userId: connections.userId })
    .from(connections)
    .where(eq(connections.id, id))
    .limit(1);
  if (!target) throw new Error("conexão não encontrada no teste");

  for (let run = 0; run < maxRuns; run += 1) {
    const last = await syncOnce(cookie, id);
    const latest = await db
      .select({ connectionId: syncRuns.connectionId, statsJson: syncRuns.statsJson })
      .from(syncRuns)
      .innerJoin(connections, eq(connections.id, syncRuns.connectionId))
      .where(and(eq(connections.userId, target.userId), eq(connections.provider, "demo")))
      .orderBy(desc(syncRuns.startedAt));
    const seen = new Set<string>();
    let pending = false;
    for (const row of latest) {
      if (seen.has(row.connectionId)) continue;
      seen.add(row.connectionId);
      const stats = JSON.parse(row.statsJson ?? "{}") as { _pending?: Record<string, unknown> };
      if (stats._pending && Object.keys(stats._pending).length > 0) pending = true;
    }
    if (!pending) return last;
  }
  throw new Error(`sync não completou em ${maxRuns} execuções`);
}

beforeEach(async () => {
  await resetDatabase();
  await seedCategories();
});

describe("sync demo ponta a ponta", () => {
  it("cria as 3 conexões e popula contas, faturas, transações, investimentos e snapshots", async () => {
    const user = await createTestUser();
    const { cookie } = await createSessionCookie(user.id);
    const primaryId = await demoConnectionId(cookie);

    const run = await syncOnce(cookie, primaryId);
    expect(run.data.status).toBe("success");
    // O run devolvido é o da conexão pedida (Banco Aurora: 3 contas); as outras
    // duas conexões demo também são sincronizadas no mesmo POST.
    expect(run.data.stats?.accounts).toBe(3);
    const accountCount = (await db.select({ total: count() }).from(accounts))[0]?.total ?? 0;
    expect(accountCount).toBe(7);
    expect(run.data.stats?.transactions).toBeGreaterThan(100);
    // O run é da conexão Aurora (1 cartão × 7 faturas); o total no D1 é 14.
    expect(run.data.stats?.bills).toBe(7);
    // Investimentos pertencem à conexão Horizonte (sincronizada no mesmo POST).
    expect(run.data.stats?.investments).toBe(0);
    expect(run.data.stats?.balanceSnapshots).toBeGreaterThan(0);

    // O primeiro run fatia o histórico; completa antes de conferir o dataset.
    await syncToCompletion(cookie, primaryId);

    const connectionsResponseBody = connectionsResponse.parse(
      await (await authedRequest("/api/connections", cookie)).json(),
    );
    expect(connectionsResponseBody.data).toHaveLength(3);
    for (const connection of connectionsResponseBody.data) {
      expect(connection.status).toBe("active");
      expect(connection.provider).toBe("demo");
      expect(connection.institution?.name).toBeTruthy();
      expect(connection.lastSyncedAt).not.toBeNull();
    }

    const accountsBody = accountsResponse.parse(
      await (await authedRequest("/api/accounts", cookie)).json(),
    );
    expect(accountsBody.data).toHaveLength(7);
    expect(accountsBody.data.every((account) => account.provider === "demo")).toBe(true);

    const transactionsBody = transactionsResponse.parse(
      await (await authedRequest("/api/transactions?limit=200", cookie)).json(),
    );
    expect(transactionsBody.data.length).toBeGreaterThan(50);
    const withCategory = transactionsBody.data.filter((transaction) => transaction.categoryId);
    expect(withCategory.length).toBeGreaterThan(0);
    // Hint do provider `contas-servicos` cai na categoria de sistema com slug
    // diferente do seed (`contas-e-servicos`).
    expect(
      transactionsBody.data.some(
        (transaction) => transaction.category?.slug === "contas-e-servicos",
      ),
    ).toBe(true);

    const billRows = await db.select({ total: count() }).from(bills);
    expect(billRows[0]?.total).toBeGreaterThanOrEqual(14);

    const investmentRows = await db.select({ total: count() }).from(investments);
    expect(investmentRows[0]?.total).toBe(3);

    // Histórico retroativo (evolução patrimonial), não só o snapshot de hoje.
    const snapshotDates = await env.DB.prepare(
      "SELECT MIN(date) AS minDate, MAX(date) AS maxDate FROM balance_snapshots",
    ).first<{ minDate: string | null; maxDate: string | null }>();
    expect(snapshotDates?.minDate).toBeTruthy();
    expect(snapshotDates!.minDate! < snapshotDates!.maxDate!).toBe(true);
  }, 60_000);

  it("aceita ?refresh=true no sync manual (no-op no demo)", async () => {
    const user = await createTestUser();
    const { cookie } = await createSessionCookie(user.id);
    const primaryId = await demoConnectionId(cookie);

    const response = await authedRequest(
      `/api/connections/${primaryId}/sync?refresh=true`,
      cookie,
      { method: "POST" },
    );

    expect(response.status).toBe(200);
    const body = syncRunResponse.parse(await response.json());
    expect(body.data.status).toBe("success");
  }, 60_000);

  it("snapshots históricos usam o sinal certo em contas e cartões", async () => {
    const user = await createTestUser();
    const { cookie } = await createSessionCookie(user.id);
    const primaryId = await demoConnectionId(cookie);
    await syncToCompletion(cookie, primaryId);

    const today = todayIsoDate();
    const accountRows = await db.select().from(accounts);
    const allTransactions = await db
      .select({
        accountId: transactions.accountId,
        date: transactions.date,
        amountCents: transactions.amountCents,
        status: transactions.status,
      })
      .from(transactions);

    for (const account of accountRows) {
      const own = allTransactions.filter(
        (transaction) => transaction.accountId === account.id && transaction.status === "posted",
      );
      const total = own.reduce((sumCents, transaction) => sumCents + transaction.amountCents, 0);
      const [snapshot] = await db
        .select()
        .from(balanceSnapshots)
        .where(
          and(
            eq(balanceSnapshots.accountId, account.id),
            lte(balanceSnapshots.date, addDays(today, -30)),
          ),
        )
        .orderBy(desc(balanceSnapshots.date))
        .limit(1);
      expect(snapshot).toBeDefined();

      const cumulative = own
        .filter((transaction) => transaction.date <= snapshot!.date)
        .reduce((sumCents, transaction) => sumCents + transaction.amountCents, 0);
      // Conta: saldo = abertura + Σ. Cartão: dívida = abertura − Σ (compra negativa aumenta a dívida).
      const direction = account.type === "credit_card" ? -1 : 1;
      const expected = Math.round(
        account.balanceCents - direction * total + direction * cumulative,
      );
      expect(snapshot!.balanceCents).toBe(expected);
    }
  }, 60_000);

  it("dívida dos cartões = soma das faturas não pagas e do snapshot de hoje", async () => {
    const user = await createTestUser();
    const { cookie } = await createSessionCookie(user.id);
    const primaryId = await demoConnectionId(cookie);
    await syncToCompletion(cookie, primaryId);

    const today = todayIsoDate();
    const cards = await db.select().from(accounts).where(eq(accounts.type, "credit_card"));
    expect(cards.length).toBeGreaterThan(0);

    for (const card of cards) {
      const [unpaid] = await db
        .select({ total: sum(bills.totalCents) })
        .from(bills)
        .where(and(eq(bills.accountId, card.id), ne(bills.status, "paid")));
      expect(Number(unpaid?.total ?? 0)).toBe(card.balanceCents);

      const [snapshot] = await db
        .select()
        .from(balanceSnapshots)
        .where(and(eq(balanceSnapshots.accountId, card.id), eq(balanceSnapshots.date, today)))
        .limit(1);
      expect(snapshot?.balanceCents).toBe(card.balanceCents);
    }
  }, 60_000);

  it("é idempotente: dois syncs não duplicam dados", async () => {
    const user = await createTestUser();
    const { cookie } = await createSessionCookie(user.id);
    const primaryId = await demoConnectionId(cookie);

    await syncToCompletion(cookie, primaryId);
    const countTransactions = async () =>
      (await db.select({ total: count() }).from(transactions))[0]?.total ?? 0;
    const countAccounts = async () =>
      (await db.select({ total: count() }).from(accounts))[0]?.total ?? 0;
    const countBills = async () => (await db.select({ total: count() }).from(bills))[0]?.total ?? 0;

    const first = {
      transactions: await countTransactions(),
      accounts: await countAccounts(),
      bills: await countBills(),
    };

    const secondRun = await syncToCompletion(cookie, primaryId);
    expect(secondRun.data.status).toBe("success");

    expect(await countTransactions()).toBe(first.transactions);
    expect(await countAccounts()).toBe(first.accounts);
    expect(await countBills()).toBe(first.bills);
  }, 60_000);

  it("preserva categoria editada manualmente em um novo sync", async () => {
    const user = await createTestUser();
    const { cookie } = await createSessionCookie(user.id);
    const primaryId = await demoConnectionId(cookie);
    await syncToCompletion(cookie, primaryId);

    const list = transactionsResponse.parse(
      await (await authedRequest("/api/transactions?limit=50", cookie)).json(),
    );
    const target = list.data.find((transaction) => transaction.categoryId !== null);
    expect(target).toBeDefined();

    const categoryResponse = await authedRequest("/api/categories", cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Categoria do usuário",
        icon: "Tag",
        color: "#112233",
        kind: "expense",
      }),
    });
    expect(categoryResponse.status).toBe(201);
    const createdCategory = (await categoryResponse.json()) as { id: string };

    const patch = await authedRequest(`/api/transactions/${target!.id}`, cookie, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryId: createdCategory.id }),
    });
    expect(patch.status).toBe(200);
    const patched = transactionSchema.parse(((await patch.json()) as { data: Transaction }).data);
    expect(patched.categoryId).toBe(createdCategory.id);

    const [rowAfterPatch] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, target!.id));
    expect(rowAfterPatch?.categorySource).toBe("user");

    await syncToCompletion(cookie, primaryId);

    const [rowAfterSync] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, target!.id));
    expect(rowAfterSync?.categoryId).toBe(createdCategory.id);
    expect(rowAfterSync?.categorySource).toBe("user");

    // Categorias de sistema continuam vindo do hint para as demais.
    const categoriesBody = categoriesResponse.parse(
      await (await authedRequest("/api/categories", cookie)).json(),
    );
    expect(categoriesBody.data.some((category) => category.userId === user.id)).toBe(true);
  }, 60_000);

  it("grava as parcelas e preserva a exceção de grupo de metas em um novo sync", async () => {
    const user = await createTestUser();
    const { cookie } = await createSessionCookie(user.id);
    const primaryId = await demoConnectionId(cookie);
    await syncToCompletion(cookie, primaryId);

    const parcelled = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, user.id), isNotNull(transactions.totalInstallments)));
    expect(parcelled.length).toBeGreaterThan(0);
    for (const row of parcelled) {
      // O demo descreve a parcela como "<compra> - Parcela n/N".
      expect(row.description).toContain(
        `Parcela ${row.installmentNumber}/${row.totalInstallments}`,
      );
    }

    const target = parcelled[0]!;
    const budget = (await (await authedRequest("/api/budget", cookie)).json()) as {
      data: { groups: { id: string }[] };
    };
    const groupId = budget.data.groups[0]!.id;
    const patch = await authedRequest(`/api/transactions/${target.id}`, cookie, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ budgetGroupId: groupId }),
    });
    expect(patch.status).toBe(200);

    await syncToCompletion(cookie, primaryId);

    const [after] = await db.select().from(transactions).where(eq(transactions.id, target.id));
    expect(after?.budgetGroupId).toBe(groupId);
    expect(after?.installmentNumber).toBe(target.installmentNumber);
  }, 60_000);

  it("falha do provider marca a conexão como error e mantém os dados", async () => {
    const user = await createTestUser();
    const { cookie } = await createSessionCookie(user.id);
    const primaryId = await demoConnectionId(cookie);
    await syncToCompletion(cookie, primaryId);

    const before = await db.select({ total: count() }).from(transactions);

    // Conexão Pluggy inserida direto: o provider não está configurado no teste,
    // então `registry.require` lança ProviderError antes de qualquer download.
    const [pluggyConnection] = await db
      .insert(connections)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        provider: "pluggy",
        externalId: "item-inexistente",
        institutionId: null,
        status: "active",
        statusDetail: null,
        lastSyncedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .returning();

    const response = await authedRequest(`/api/connections/${pluggyConnection!.id}/sync`, cookie, {
      method: "POST",
    });
    expect(response.status).toBe(502);

    const [updated] = await db
      .select()
      .from(connections)
      .where(eq(connections.id, pluggyConnection!.id));
    expect(updated?.status).toBe("error");

    const runs = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.connectionId, pluggyConnection!.id));
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("error");
    expect(runs[0]?.errorCode).toBe("not_found");

    const after = await db.select({ total: count() }).from(transactions);
    expect(after[0]?.total).toBe(before[0]?.total);
  }, 60_000);

  it("lista sync-runs da conexão (mais recente primeiro)", async () => {
    const user = await createTestUser();
    const { cookie } = await createSessionCookie(user.id);
    const primaryId = await demoConnectionId(cookie);
    await syncToCompletion(cookie, primaryId);
    await syncToCompletion(cookie, primaryId);

    const response = await authedRequest(
      `/api/connections/${primaryId}/sync-runs?limit=10`,
      cookie,
    );
    expect(response.status).toBe(200);
    const body = syncRunsResponse.parse(await response.json());
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.data[0]!.startedAt >= body.data[1]!.startedAt).toBe(true);
    expect(body.data.every((run) => run.status === "success")).toBe(true);
  }, 60_000);

  it("cron sincroniza conexões ativas e não apaga dados em falha", async () => {
    const user = await createTestUser();
    const { cookie } = await createSessionCookie(user.id);
    const primaryId = await demoConnectionId(cookie);
    await syncToCompletion(cookie, primaryId);

    // Deixa uma conexão demo antiga e uma pluggy quebrada.
    await db
      .update(connections)
      .set({ lastSyncedAt: "2026-01-01T00:00:00.000Z", status: "active" })
      .where(eq(connections.userId, user.id));

    await db.insert(connections).values({
      id: crypto.randomUUID(),
      userId: user.id,
      provider: "pluggy",
      externalId: "item-quebrado",
      institutionId: null,
      status: "active",
      statusDetail: null,
      lastSyncedAt: "2025-01-01T00:00:00.000Z",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const before = (await db.select({ total: count() }).from(transactions))[0]?.total ?? 0;
    await runScheduledSync(env);

    const after = (await db.select({ total: count() }).from(transactions))[0]?.total ?? 0;
    expect(after).toBe(before);

    const runs = await db.select({ total: count() }).from(syncRuns);
    expect(runs[0]?.total).toBeGreaterThanOrEqual(4);
  }, 90_000);

  it("DELETE /connections remove em cascade", async () => {
    const user = await createTestUser();
    const { cookie } = await createSessionCookie(user.id);
    const primaryId = await demoConnectionId(cookie);
    await syncToCompletion(cookie, primaryId);

    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.connectionId, primaryId), eq(accounts.type, "checking")));

    const response = await authedRequest(`/api/connections/${primaryId}`, cookie, {
      method: "DELETE",
    });
    expect(response.status).toBe(200);
    expect((await response.json()) as { ok: boolean }).toEqual({ ok: true });

    expect(await db.select().from(connections).where(eq(connections.id, primaryId))).toHaveLength(
      0,
    );
    expect(await db.select().from(accounts).where(eq(accounts.id, account!.id))).toHaveLength(0);
  }, 60_000);
});
