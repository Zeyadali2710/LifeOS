import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { createDb } from "@/server/db/client";
import { CHANNEL, emitActivity, loadEventRow, recentActivity } from "@/server/events";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const base = { type: "system.test", source: "system", title: "T", detail: "d", tone: "green" as const };

describe("events", () => {
  it("inserts activity row with detail/tone", async () => {
    const r = await emitActivity(base, undefined, t.handle());
    expect(r?.activityId).toBeTruthy();
    expect(r?.notificationId).toBeUndefined();
    const rows = await recentActivity(t.handle(), 1);
    expect(rows[0]).toMatchObject({ id: r!.activityId, detail: "d", tone: "green", source: "system" });
  });

  it("inserts linked notification and NOTIFYs ids only", async () => {
    const c = new Client({ connectionString: t.url() });
    await c.connect();
    const got: string[] = [];
    c.on("notification", (m) => got.push(m.payload ?? ""));
    await c.query(`LISTEN ${CHANNEL}`);
    const r = await emitActivity(base, { category: "FYI", title: "N" }, t.handle());
    await new Promise((res) => setTimeout(res, 300));
    await c.end();
    expect(r?.notificationId).toBeTruthy();
    expect(got.map((g) => JSON.parse(g))).toEqual([
      { k: "activity", id: r!.activityId },
      { k: "notification", id: r!.notificationId },
    ]);
    const n = await loadEventRow(t.handle(), { k: "notification", id: r!.notificationId! });
    expect(n).toMatchObject({ category: "FYI", source: "system" });
  });

  it("returns null and does not throw when the pool is closed", async () => {
    const dead = createDb(t.url(), 1);
    await dead.pool.end();
    await expect(emitActivity(base, undefined, dead.db)).resolves.toBeNull();
  });

  it("loadEventRow hides dismissed and future-snoozed notifications", async () => {
    const mk = async () => (await emitActivity(base, { category: "FYI", title: "N" }, t.handle()))!.notificationId!;
    const a = await mk();
    const b = await mk();
    const c = await mk();
    const pool = t.pool();
    await pool.query("update notifications set dismissed_at = now() where id = $1", [a]);
    await pool.query("update notifications set snoozed_until = now() + interval '1 hour' where id = $1", [b]);
    expect(await loadEventRow(t.handle(), { k: "notification", id: a })).toBeNull();
    expect(await loadEventRow(t.handle(), { k: "notification", id: b })).toBeNull();
    expect(await loadEventRow(t.handle(), { k: "notification", id: c })).not.toBeNull();
    expect(await loadEventRow(t.handle(), { k: "notification", id: "nope" })).toBeNull();
    expect(await loadEventRow(t.handle(), { k: "bogus", id: c })).toBeNull();
  });

  it("recentActivity returns newest first, limited", async () => {
    await emitActivity({ ...base, title: "older" }, undefined, t.handle());
    await emitActivity({ ...base, title: "newest" }, undefined, t.handle());
    const rows = await recentActivity(t.handle(), 2);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.title).toBe("newest");
  });
});
