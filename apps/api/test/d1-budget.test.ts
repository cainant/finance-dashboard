/**
 * Prova o orçamento de queries D1 (Workers Free: 50 por invocação).
 *
 * Envolve o binding D1 num proxy que conta execuções: uma query avulsa conta 1
 * e um `db.batch()` também conta 1 (regra do D1 Free), independentemente do
 * número de statements. O teste dispara o sync demo (3 conexões, histórico
 * fatiado) e exige que cada request fique dentro do limite.
 */
import { env } from "cloudflare:test";
import { connections, syncRuns } from "@fd/database/schema";
import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { BASE_URL, createSessionCookie, createTestUser, db, resetDatabase } from "./helpers";

function countingD1(real: D1Database): {
  db: D1Database;
  queries: () => number;
  reset: () => void;
} {
  let count = 0;
  const realByProxy = new WeakMap<object, D1PreparedStatement>();

  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const proxy = new Proxy(statement, {
      get(target, property) {
        if (property === "bind") {
          return (...args: unknown[]) =>
            wrap(target.bind(...(args as Parameters<D1PreparedStatement["bind"]>)));
        }
        if (
          property === "run" ||
          property === "all" ||
          property === "first" ||
          property === "raw"
        ) {
          return (...args: unknown[]) => {
            count += 1;
            const method = target[property] as (...methodArgs: unknown[]) => unknown;
            return method.apply(target, args);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    realByProxy.set(proxy, statement);
    return proxy;
  };

  const proxyDb = {
    prepare: (query: string) => wrap(real.prepare(query)),
    batch: (statements: D1PreparedStatement[]) => {
      count += 1;
      return real.batch(statements.map((statement) => realByProxy.get(statement) ?? statement));
    },
    exec: (query: string) => {
      count += 1;
      return real.exec(query);
    },
    dump: () => real.dump(),
    withSession: (constraint: string) => real.withSession(constraint),
  } as unknown as D1Database;

  return { db: proxyDb, queries: () => count, reset: () => (count = 0) };
}

async function hasPendingSync(userId: string): Promise<boolean> {
  const rows = await db
    .select({ connectionId: connections.id, statsJson: syncRuns.statsJson })
    .from(connections)
    .innerJoin(syncRuns, eq(syncRuns.connectionId, connections.id))
    .where(eq(connections.userId, userId))
    .orderBy(desc(syncRuns.startedAt));

  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.connectionId)) continue;
    seen.add(row.connectionId);
    const stats = JSON.parse(row.statsJson ?? "{}") as { _pending?: Record<string, unknown> };
    if (stats._pending && Object.keys(stats._pending).length > 0) return true;
  }
  return false;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("orçamento de queries D1 por request", () => {
  it("mantém cada slice do sync demo em ≤ 50 queries", async () => {
    const user = await createTestUser();
    const { cookie } = await createSessionCookie(user.id);
    const counter = countingD1(env.DB);
    const app = createApp();
    const appEnv = { ...env, DB: counter.db } as unknown as Env;

    const created = await app.request(
      `${BASE_URL}/api/connections`,
      {
        method: "POST",
        headers: { cookie, "content-type": "application/json", "x-requested-with": "fetch" },
        body: JSON.stringify({ provider: "demo" }),
      },
      appEnv,
    );
    expect(created.status).toBe(201);
    const primary = (await created.json()) as { data: { id: string } };

    let maxQueries = 0;
    let maxRequestMs = 0;
    let attempts = 0;
    let completed = false;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      counter.reset();
      const requestStarted = performance.now();
      const response = await app.request(
        `${BASE_URL}/api/connections/${primary.data.id}/sync`,
        {
          method: "POST",
          headers: { cookie, "x-requested-with": "fetch" },
        },
        appEnv,
      );
      const requestMs = performance.now() - requestStarted;
      expect(response.status).toBe(200);
      attempts += 1;
      maxQueries = Math.max(maxQueries, counter.queries());
      maxRequestMs = Math.max(maxRequestMs, requestMs);

      if (!(await hasPendingSync(user.id))) {
        completed = true;
        break;
      }
    }

    expect(completed).toBe(true);
    // O primeiro sync não pode processar todo o histórico de uma vez.
    expect(attempts).toBeGreaterThan(1);
    expect(maxQueries).toBeLessThanOrEqual(45);
    // Medição local (workerd): máx. ~99 ms por slice e 7 slices para o
    // histórico completo, contra 2,4 s em um único POST antes do batching.
    expect(maxRequestMs).toBeLessThan(1_000);
  }, 60_000);
});
