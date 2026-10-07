import { eq, sql } from "drizzle-orm";
import { db, type DB } from "./db/client";
import { settings } from "./db/schema";
import { emitActivity } from "./events";
import { checkHealth, HEARTBEAT_KEY, type Health } from "./health";
import { log } from "./log";
import { formatHM } from "./time";

const HEALTH_KEY = "health.last";
const VERSION_KEY = "app.version";
const INTERVAL_MS = 30_000;

type Opts = {
  check?: () => Promise<Health>;
  handle?: DB;
  emit?: typeof emitActivity;
  version?: string;
  now?: () => Date;
};

const keyOf = (h: Health) => `${h.status}|${h.db}|${h.worker}`;

async function read(h: DB, key: string): Promise<unknown> {
  const [row] = await h.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
  return row?.value;
}

// Compare-and-set so that, across processes, only one caller "wins" a transition and emits.
async function cas(h: DB, key: string, prev: unknown, next: unknown): Promise<boolean> {
  if (prev === undefined) {
    const r = await h.insert(settings).values({ key, value: next }).onConflictDoNothing().returning({ key: settings.key });
    return r.length > 0;
  }
  const r = await h.execute(
    sql`update settings set value = ${JSON.stringify(next)}::jsonb, updated_at = now()
        where key = ${key} and value = ${JSON.stringify(prev)}::jsonb returning key`,
  );
  return r.rows.length > 0;
}

export function createMonitor(opts: Opts = {}) {
  let lastKey = "";
  let streak = 0;

  async function tick(): Promise<void> {
    try {
      const health = await (opts.check ?? checkHealth)();
      const k = keyOf(health);
      streak = k === lastKey ? streak + 1 : 1;
      lastKey = k;
      if (streak < 2) return; // 2-sample debounce

      const h = opts.handle ?? db();
      const emit = opts.emit ?? emitActivity;
      const prev = await read(h, HEALTH_KEY);
      const prevH = prev as Health | undefined;
      if (prevH && keyOf(prevH) === k) return;
      const prevOk = !prevH || prevH.status === "ok";
      if (!prevH && health.status === "ok") {
        await cas(h, HEALTH_KEY, undefined, health); // first observation: silent
        return;
      }
      if (!(await cas(h, HEALTH_KEY, prev, health))) return;

      if (health.status === "ok") {
        await emit(
          { type: "system.health_restored", source: "system", title: "Health restored", detail: "All checks passing", tone: "green", payload: { health } },
          undefined,
          h,
        );
        return;
      }
      const workerDown = health.db === "ok" && health.worker !== "ok";
      const check = workerDown ? "Worker" : "Database";
      let n: { category: "IMPORTANT"; title: string; body: string } | undefined;
      if (prevOk) {
        if (workerDown) {
          const beat = await read(h, HEARTBEAT_KEY);
          const seen = typeof beat === "string" && !Number.isNaN(Date.parse(beat)) ? ` Last seen ${formatHM(new Date(beat))}.` : "";
          n = {
            category: "IMPORTANT",
            title: "Worker isn't responding",
            body: `Background jobs are paused until the worker sends a heartbeat.${seen}`,
          };
        } else {
          n = { category: "IMPORTANT", title: "System health is degraded", body: `${check} is failing. LifeOS will keep retrying.` };
        }
      }
      await emit(
        {
          type: "system.health_degraded",
          source: "system",
          title: "Health is degraded",
          detail: `${check} not responding`,
          tone: health.status === "down" ? "red" : "amber",
          payload: { health },
        },
        n,
        h,
      );
    } catch (err) {
      log.error({ err }, "monitor tick failed");
    }
  }

  async function checkVersion(): Promise<void> {
    try {
      const h = opts.handle ?? db();
      const emit = opts.emit ?? emitActivity;
      const version = opts.version ?? process.env.LIFEOS_VERSION ?? "dev";
      const prev = await read(h, VERSION_KEY);
      if (prev === version) return;
      if (!(await cas(h, VERSION_KEY, prev, version)) || prev === undefined) return; // first boot: silent
      const at = formatHM((opts.now ?? (() => new Date()))());
      await emit(
        { type: "system.version_changed", source: "system", title: `LifeOS updated to v${version}`, detail: `Previous v${String(prev)}` },
        { category: "FYI", title: `LifeOS updated to v${version}`, body: `Deployed at ${at}. Previous version v${String(prev)}.` },
        h,
      );
    } catch (err) {
      log.error({ err }, "monitor version check failed");
    }
  }

  return { tick, checkVersion };
}

declare global {
  var __lifeosMonitor: ReturnType<typeof setInterval> | undefined;
}

// Schedules timers only; register() must not block on DB work.
export function start(): void {
  if (globalThis.__lifeosMonitor) return;
  const m = createMonitor();
  const run = () => void m.checkVersion().then(() => m.tick());
  globalThis.__lifeosMonitor = setInterval(run, INTERVAL_MS).unref();
  setTimeout(run, 1_000).unref();
}
