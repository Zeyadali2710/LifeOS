import { PgBoss } from "pg-boss";
import { env } from "./env";
import { log } from "./log";

export const QUEUES = { githubSync: "github.sync", resume: "agent.resume", expire: "approval.expire", sweep: "run.sweep" } as const;

export type Enqueue = (name: string, data: object, opts?: { singletonKey?: string }) => Promise<void>;

declare global {
  var __lifeosBoss: Promise<PgBoss> | undefined;
}

// Send-only: the worker owns maintenance, migrations, scheduling and createQueue.
function boss(): Promise<PgBoss> {
  return (globalThis.__lifeosBoss ??= (async () => {
    const b = new PgBoss({ connectionString: env().DATABASE_URL, supervise: false, schedule: false, migrate: false });
    b.on("error", (err) => log.error({ err }, "pg-boss (web) error"));
    await b.start();
    return b;
  })());
}

export const enqueue: Enqueue = async (name, data, opts) => {
  try {
    // Never let a missing/unready queue hang the caller: callers treat a throw as "queued: false" and the sweeper retries.
    const send = (async () => (await boss()).send(name, data, opts?.singletonKey ? { singletonKey: opts.singletonKey } : {}))();
    send.catch(() => undefined);
    await Promise.race([send, new Promise((_, rej) => setTimeout(() => rej(new Error("enqueue timed out")), 5000).unref())]);
  } catch (err) {
    log.error({ err, name }, "enqueue failed");
    globalThis.__lifeosBoss = undefined; // allow a retry with a fresh connection
    throw err;
  }
};
