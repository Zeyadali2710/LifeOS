import { PgBoss } from "pg-boss";
import { db } from "@/server/db/client";
import { emitActivity } from "@/server/events";
import { settings } from "@/server/db/schema";
import { env } from "@/server/env";
import { HEARTBEAT_KEY } from "@/server/health";
import { log } from "@/server/log";

const HEARTBEAT = "system.heartbeat";

async function beat() {
  const value = new Date().toISOString();
  await db().insert(settings).values({ key: HEARTBEAT_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

async function main() {
  const boss = new PgBoss(env().DATABASE_URL);
  boss.on("error", (err) => log.error({ err }, "pg-boss error"));
  await boss.start();

  // Heartbeat goes through the queue so a fresh beat proves pg-boss is processing jobs.
  await boss.createQueue(HEARTBEAT);
  await boss.schedule(HEARTBEAT, "* * * * *");
  await boss.work(HEARTBEAT, async () => beat());
  await beat();
  await emitActivity({ type: "system.worker_started", source: "system", title: "Worker started", detail: `v${process.env.LIFEOS_VERSION ?? "dev"}` });
  log.info("worker started");

  const shutdown = async (signal: string) => {
    log.info({ signal }, "worker stopping");
    try {
      await boss.stop({ graceful: true, timeout: 20_000 });
    } catch (err) {
      log.error({ err }, "pg-boss stop failed");
    }
    // App pool closes with the process; nothing else holds state worth flushing.
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  log.fatal({ err }, "worker failed to start");
  process.exit(1);
});
