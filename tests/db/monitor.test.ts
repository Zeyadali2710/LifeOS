import { count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activityEvents, notifications, settings } from "@/server/db/schema";
import type { Health } from "@/server/health";
import { createMonitor } from "@/server/monitor";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const H = (o: Partial<Health> = {}): Health => ({ status: "ok", db: "ok", worker: "ok", version: "dev", ...o });
const stale = H({ status: "degraded", worker: "stale" });
const mk = (seq: Health[]) => {
  let i = 0;
  return createMonitor({ handle: t.handle(), check: async () => seq[Math.min(i++, seq.length - 1)]! });
};
const acts = (type: string) => t.handle().select().from(activityEvents).where(eq(activityEvents.type, type));
const nCount = async () => (await t.handle().select({ c: count() }).from(notifications))[0]!.c;
const reset = async () => {
  await t.handle().delete(notifications);
  await t.handle().delete(activityEvents);
  await t.handle().delete(settings);
};

describe("monitor health", () => {
  it("first ok observation is silent; degraded is debounced, emitted once, then restored", async () => {
    await reset();
    const m = mk([H(), H(), stale, stale, stale, H(), H()]);
    await m.tick();
    await m.tick();
    expect(await t.handle().select().from(settings)).toHaveLength(1);
    expect(await acts("system.health_degraded")).toHaveLength(0);
    await m.tick(); // stale x1: debounced
    expect(await acts("system.health_degraded")).toHaveLength(0);
    await m.tick(); // stale x2
    await m.tick(); // stale x3: no re-emit
    const d = await acts("system.health_degraded");
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ title: "Health is degraded" });
    expect(d[0]!.payload).toMatchObject({ detail: "Worker not responding", tone: "amber", health: stale });
    const ns = await t.handle().select().from(notifications);
    expect(ns).toHaveLength(1);
    expect(ns[0]).toMatchObject({ category: "IMPORTANT", title: "Worker isn't responding" });
    await m.tick();
    await m.tick();
    const r = await acts("system.health_restored");
    expect(r).toHaveLength(1);
    expect(r[0]!.payload).toMatchObject({ detail: "All checks passing", tone: "green" });
    expect(await nCount()).toBe(1);
  });

  it("db down uses the database notification copy", async () => {
    await reset();
    const m = mk([H({ status: "down", db: "down", worker: "unknown" })]);
    await m.tick();
    await m.tick();
    const [n] = await t.handle().select().from(notifications);
    expect(n).toMatchObject({ title: "System health is degraded", body: "Database is failing. LifeOS will keep retrying." });
  });

  it("two monitors emit each transition once", async () => {
    await reset();
    const a = mk([H(), H(), stale, stale]);
    const b = mk([H(), H(), stale, stale]);
    for (let i = 0; i < 4; i++) await Promise.all([a.tick(), b.tick()]);
    expect(await acts("system.health_degraded")).toHaveLength(1);
    expect(await nCount()).toBe(1);
  });

  it("tick never throws when check rejects", async () => {
    const m = createMonitor({ handle: t.handle(), check: () => Promise.reject(new Error("x")) });
    await expect(m.tick()).resolves.toBeUndefined();
  });
});

describe("monitor version", () => {
  it("stores silently on first boot, emits once on change", async () => {
    await reset();
    await createMonitor({ handle: t.handle(), version: "1.0.0" }).checkVersion();
    expect(await acts("system.version_changed")).toHaveLength(0);
    const m = createMonitor({ handle: t.handle(), version: "2.0.0" });
    await m.checkVersion();
    await m.checkVersion();
    const v = await acts("system.version_changed");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ title: "LifeOS updated to v2.0.0" });
    expect(v[0]!.payload).toMatchObject({ detail: "Previous v1.0.0" });
    const [n] = await t.handle().select().from(notifications);
    expect(n).toMatchObject({ category: "FYI" });
  });
});
