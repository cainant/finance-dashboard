import { connections, loginAttempts, sessions, syncRuns } from "@fd/database/schema";
import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runMaintenance } from "../src/maintenance";
import { createTestUser, db, resetDatabase } from "./helpers";

async function countSessions(): Promise<number> {
  const [row] = await db.select({ total: count() }).from(sessions);
  return row?.total ?? 0;
}

async function countAttempts(): Promise<number> {
  const [row] = await db.select({ total: count() }).from(loginAttempts);
  return row?.total ?? 0;
}

async function countSyncRuns(): Promise<number> {
  const [row] = await db.select({ total: count() }).from(syncRuns);
  return row?.total ?? 0;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("runMaintenance", () => {
  it("remove sessões expiradas antigas, tentativas velhas e sync-runs antigos", async () => {
    const user = await createTestUser();
    const now = new Date("2026-11-10T12:00:00.000Z");
    const old = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(now.getTime() - 60 * 1000).toISOString();

    await db.insert(sessions).values([
      { id: "old-session", userId: user.id, expiresAt: old, createdAt: old, userAgent: null },
      {
        id: "recent-session",
        userId: user.id,
        expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
        createdAt: recent,
        userAgent: null,
      },
    ]);
    await db.insert(loginAttempts).values([
      { key: "ip:1.2.3.4", attemptedAt: old },
      { key: "ip:1.2.3.5", attemptedAt: recent },
    ]);

    const connectionId = crypto.randomUUID();
    await db.insert(connections).values({
      id: connectionId,
      userId: user.id,
      provider: "demo",
      externalId: "conn-1",
      status: "active",
    });
    await db.insert(syncRuns).values([
      {
        id: "old-run",
        connectionId,
        startedAt: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString(),
        finishedAt: old,
        status: "success",
        errorCode: null,
        errorMessage: null,
        statsJson: null,
      },
      {
        id: "recent-run",
        connectionId,
        startedAt: recent,
        finishedAt: recent,
        status: "running",
        errorCode: null,
        errorMessage: null,
        statsJson: null,
      },
    ]);

    const result = await runMaintenance(db, now);

    expect(result).toEqual({ sessions: 1, loginAttempts: 1, syncRuns: 1 });
    expect(await countSessions()).toBe(1);
    expect(await countAttempts()).toBe(1);
    expect(await countSyncRuns()).toBe(1);
    expect(await db.select().from(syncRuns).where(eq(syncRuns.id, "recent-run"))).toHaveLength(1);
  });
});
