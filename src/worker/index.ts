import { PgBoss } from "pg-boss";
import { db } from "@/server/db/client";
import { emitActivity } from "@/server/events";
import { settings } from "@/server/db/schema";
import { env } from "@/server/env";
import { HEARTBEAT_KEY } from "@/server/health";
import { log } from "@/server/log";
import { QUEUES } from "@/server/queue";
import { handleExpire, handleResume } from "./jobs/agents";
import { handleGithubSync } from "./jobs/github-sync";
import { handleSweep } from "./jobs/sweep";
import { handleTaskReminders } from "./jobs/task-reminders";

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

  await boss.createQueue(QUEUES.githubSync);
  await boss.createQueue(QUEUES.resume, { retryLimit: 3, retryBackoff: true });
  await boss.createQueue(QUEUES.expire);
  await boss.createQueue(QUEUES.sweep);
  await boss.createQueue(QUEUES.taskReminders);
  await boss.schedule(QUEUES.githubSync, "*/15 * * * *", {}, { singletonKey: "github.sync" });
  await boss.schedule(QUEUES.expire, "*/5 * * * *");
  await boss.schedule(QUEUES.sweep, "*/5 * * * *");
  await boss.schedule(QUEUES.taskReminders, "* * * * *", {}, { singletonKey: "task.reminders" });
  await boss.work(QUEUES.taskReminders, async () => handleTaskReminders());
  await boss.work(QUEUES.githubSync, async () => handleGithubSync());
  await boss.work(QUEUES.expire, async () => handleExpire());
  await boss.work(QUEUES.sweep, async () => handleSweep());
  await boss.work(QUEUES.resume, async (jobs) => {
    for (const j of jobs) await handleResume(j.data);
  });
  // Fresh deploys should not wait 15 minutes for the first sync.
  await boss.send(QUEUES.githubSync, {}, { singletonKey: "github.sync", startAfter: 10 }).catch(() => undefined);

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
