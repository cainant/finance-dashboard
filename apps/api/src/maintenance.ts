/**
 * Manutenção periódica do D1 (executada pelo cron).
 *
 * O Workers Free limita 50 queries por invocação, mas `db.batch()` conta como
 * **uma** query. As três limpezas vão num único batch:
 * - sessões expiradas há mais de 7 dias (as recém-expiradas são removidas no
 *   próprio `findSession`);
 * - tentativas de login fora da janela de rate limit;
 * - execuções de sync antigas (o histórico não precisa ser eterno).
 *
 * Nada aqui toca dados financeiros. Os horários de corte são calculados em JS
 * e passados como parâmetros (sem interpolação de string).
 */
import type { Database } from "@fd/database";
import { loginAttempts, sessions, syncRuns } from "@fd/database/schema";
import { and, lt, ne } from "drizzle-orm";

const EXPIRED_SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000;
const SYNC_RUN_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export interface MaintenanceResult {
  sessions: number;
  loginAttempts: number;
  syncRuns: number;
}

export async function runMaintenance(
  db: Database,
  now: Date = new Date(),
): Promise<MaintenanceResult> {
  const sessionCutoff = new Date(now.getTime() - EXPIRED_SESSION_RETENTION_MS).toISOString();
  const attemptCutoff = new Date(now.getTime() - LOGIN_ATTEMPT_RETENTION_MS).toISOString();
  const syncRunCutoff = new Date(now.getTime() - SYNC_RUN_RETENTION_MS).toISOString();

  const [sessionResult, attemptResult, syncRunResult] = await db.batch([
    db.delete(sessions).where(lt(sessions.expiresAt, sessionCutoff)),
    db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, attemptCutoff)),
    db
      .delete(syncRuns)
      .where(and(lt(syncRuns.startedAt, syncRunCutoff), ne(syncRuns.status, "running"))),
  ]);

  return {
    sessions: sessionResult.meta.changes ?? 0,
    loginAttempts: attemptResult.meta.changes ?? 0,
    syncRuns: syncRunResult.meta.changes ?? 0,
  };
}
