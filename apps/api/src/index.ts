import { createApp } from "./app";
import { runScheduledSync } from "./sync/cron";

const app = createApp();

/**
 * Cron Trigger (a cada 6h): sincronização das conexões ativas.
 * O lote é limitado em `runScheduledSync` para caber no Free.
 */
async function scheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  console.log(JSON.stringify({ event: "scheduled", cron: controller.cron, env: env.APP_ENV }));
  ctx.waitUntil(runScheduledSync(env));
}

export { app };
export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<Env>;
