/**
 * Cron Trigger (a cada 6h): sincroniza até 2 conexões ativas, começando pelas
 * com `last_synced_at` mais antigo. O orçamento de 45 subrequests é
 * compartilhado entre elas; uma conexão Pluggy grande pode consumir quase
 * todo o orçamento, então a próxima fica para o cron seguinte. O Free permite
 * 50 subrequests **e** 50 queries D1 por invocação: as escritas do sync vão em
 * `db.batch()` (1 query cada) para caber com folga.
 */
import { createDb } from "@fd/database";

import { createProvidersFromEnv } from "../env";
import { runMaintenance } from "../maintenance";
import { SyncService } from "./service";

const CONNECTIONS_PER_RUN = 2;
const SUBREQUEST_BUDGET = 45;

export async function runScheduledSync(env: Env): Promise<void> {
  const startedAt = Date.now();
  try {
    const db = createDb(env.DB);
    const maintenance = await runMaintenance(db);
    const service = new SyncService({
      db,
      providers: createProvidersFromEnv(env),
    });
    const runs = await service.syncDueConnections(CONNECTIONS_PER_RUN, SUBREQUEST_BUDGET);

    console.log(
      JSON.stringify({
        event: "scheduled_sync",
        connections: runs.length,
        succeeded: runs.filter((run) => run.status === "success").length,
        failed: runs.filter((run) => run.status === "error").length,
        cleanedSessions: maintenance.sessions,
        cleanedLoginAttempts: maintenance.loginAttempts,
        cleanedSyncRuns: maintenance.syncRuns,
        durationMs: Date.now() - startedAt,
      }),
    );
  } catch (error) {
    // Nunca loga dados financeiros; apenas o tipo do erro.
    console.error(
      JSON.stringify({
        event: "scheduled_sync_failed",
        error: error instanceof Error ? error.name : typeof error,
        durationMs: Date.now() - startedAt,
      }),
    );
  }
}
