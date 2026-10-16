import { PgBoss } from "pg-boss";
import { db } from "@/server/db/client";
import { emitActivity } from "@/server/events";
import { settings } from "@/server/db/schema";
import { env } from "@/server/env";
import { HEARTBEAT_KEY } from "@/server/health";
import { log } from "@/server/log";
import { QUEUES } from "@/server/queue";
import { handleExpire, handleResume } from "./jobs/agents";
import { handleCalendarSync } from "./jobs/calendar-sync";
import { handleGithubSync } from "./jobs/github-sync";
import { handleMailSync } from "./jobs/mail-sync";
import { handleMailTriage } from "./jobs/mail-triage";
import { handleOutreachSync } from "./jobs/outreach-sync";
import { handleSweep } from "./jobs/sweep";
import { handleTaskReminders } from "./jobs/task-reminders";
import { publishVariant, runScheduled } from "@/server/socials/publish";
import { syncSocials } from "@/server/socials/sync";
import { embedPending } from "@/server/knowledge";

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
  await boss.createQueue(QUEUES.calendarSync);
  await boss.createQueue(QUEUES.eventsSync);
  await boss.createQueue(QUEUES.mailSync);
  await boss.createQueue(QUEUES.mailTriage);
  await boss.createQueue(QUEUES.socialsPublish, { retryLimit: 3, retryBackoff: true });
  await boss.createQueue(QUEUES.socialsSync);
  await boss.createQueue(QUEUES.knowledgeEmbed);
  await boss.work(QUEUES.socialsPublish, async (jobs) => {
    for (const job of jobs) {
      const data = job.data as { variantId?: string; approvalId?: string; sweep?: boolean };
      if (data.sweep) await runScheduled();
      else if (data.variantId && data.approvalId) await publishVariant(data.variantId, data.approvalId);
    }
  });
  await boss.schedule(QUEUES.socialsSync, "0 */6 * * *", {}, { singletonKey: "socials.sync" });
  await boss.schedule(QUEUES.socialsPublish, "* * * * *", { sweep: true }, { singletonKey: "socials.publish.sweep" });
  await boss.work(QUEUES.socialsSync, async () => syncSocials());
  await boss.schedule(QUEUES.knowledgeEmbed, "*/10 * * * *", {}, { singletonKey: "knowledge.embed" });
  await boss.work(QUEUES.knowledgeEmbed, async () => { await embedPending(db()); });
  await boss.schedule(QUEUES.mailSync, "*/5 * * * *", {}, { singletonKey: "mail.sync" });
  await boss.work(QUEUES.mailSync, async () => handleMailSync());
  await boss.work(QUEUES.mailTriage, async (jobs) => {
    for (const j of jobs) await handleMailTriage(j.data);
  });
  await boss.schedule(QUEUES.eventsSync, "0 */6 * * *", {}, { singletonKey: "outreach.events.sync" });
  await boss.work(QUEUES.eventsSync, async () => handleOutreachSync());
  await boss.schedule(QUEUES.calendarSync, "*/5 * * * *", {}, { singletonKey: "calendar.sync" });
  await boss.work(QUEUES.calendarSync, async () => handleCalendarSync());
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
  await boss.send(QUEUES.calendarSync, {}, { singletonKey: "calendar.sync", startAfter: 10 }).catch(() => undefined);
  await boss.send(QUEUES.mailSync, {}, { singletonKey: "mail.sync", startAfter: 20 }).catch(() => undefined);
  await boss.send(QUEUES.eventsSync, {}, { singletonKey: "outreach.events.sync", startAfter: 30 }).catch(() => undefined);
  await boss.send(QUEUES.socialsSync, {}, { singletonKey: "socials.sync", startAfter: 40 }).catch(() => undefined);
  await runScheduled();

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
