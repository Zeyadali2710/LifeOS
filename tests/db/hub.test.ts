import { Client } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import { agentRuns } from "@/server/db/schema";
import { emitActivity, loadEventRow, notifyLive } from "@/server/events";
import { createHub, type HubEvent } from "@/server/hub";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const hubs: { stop(): Promise<void> }[] = [];
afterAll(() => Promise.all(hubs.map((h) => h.stop())));

function collect(hub: ReturnType<typeof createHub>) {
  const events: HubEvent[] = [];
  const unsub = hub.subscribe((e) => events.push(e));
  const wait = (pred: (e: HubEvent) => boolean, n = 1, ms = 10_000) =>
    vi.waitFor(
      () => {
        if (events.filter(pred).length < n) throw new Error("not yet");
      },
      { timeout: ms, interval: 50 },
    );
  return { events, unsub, wait };
}
const base = { type: "system.test", source: "system", title: "hello" };

describe("hub", () => {
  it("resyncs on connect, delivers activity, fans out once per NOTIFY, unsubscribe works", async () => {
    const load = vi.fn((p: { k: string; id: string }) => loadEventRow(t.handle(), p));
    const hub = createHub(t.url(), load);
    hubs.push(hub);
    const a = collect(hub);
    const b = collect(hub);
    await a.wait((e) => e.k === "resync");
    const r = await emitActivity(base, undefined, t.handle());
    await a.wait((e) => e.k === "activity");
    await b.wait((e) => e.k === "activity");
    expect(JSON.parse(a.events.find((e) => e.k === "activity")!.json).title).toBe("hello");
    expect(load).toHaveBeenCalledTimes(1);
    expect(r).not.toBeNull();

    b.unsub();
    await emitActivity({ ...base, title: "two" }, undefined, t.handle());
    await a.wait((e) => e.k === "activity", 2);
    expect(b.events.filter((e) => e.k === "activity")).toHaveLength(1);
  });

  it("forwards run notifications as RunDTO and loads null for unknown run", async () => {
    const [run] = await t.handle().insert(agentRuns).values({ agentId: "chief", prompt: "hi", model: "m" }).returning();
    expect(await loadEventRow(t.handle(), { k: "run", id: "00000000-0000-0000-0000-000000000000" })).toBeNull();
    expect(await loadEventRow(t.handle(), { k: "run", id: "nope" })).toBeNull();
    const hub = createHub(t.url(), (p) => loadEventRow(t.handle(), p));
    hubs.push(hub);
    const a = collect(hub);
    await a.wait((e) => e.k === "resync");
    await notifyLive(t.handle(), "run", run!.id);
    await a.wait((e) => e.k === "run");
    const dto = JSON.parse(a.events.find((e) => e.k === "run")!.json);
    expect(dto).toMatchObject({ id: run!.id, agentId: "chief", status: "queued" });
    expect(dto.messages).toBeUndefined();
  });

  it("ignores null loads and malformed payloads", async () => {
    const hub = createHub(t.url(), async () => null);
    hubs.push(hub);
    const a = collect(hub);
    await a.wait((e) => e.k === "resync");
    const c = new Client({ connectionString: t.url() });
    await c.connect();
    await c.query("select pg_notify('lifeos_events', 'not json')");
    await c.query(`select pg_notify('lifeos_events', '{"k":"evil","id":"x"}')`);
    await c.query(`select pg_notify('lifeos_events', '{"k":"activity","id":"00000000-0000-0000-0000-000000000000"}')`);
    await c.end();
    await new Promise((r) => setTimeout(r, 400));
    expect(a.events.map((e) => e.k)).toEqual(["resync"]);
  });

  it("reconnects after backend termination and resyncs", async () => {
    const hub = createHub(t.url(), (p) => loadEventRow(t.handle(), p));
    hubs.push(hub);
    const a = collect(hub);
    await a.wait((e) => e.k === "resync");
    await t.pool().query("select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'lifeos-hub' and datname = current_database()");
    await a.wait((e) => e.k === "resync", 2);
    await emitActivity({ ...base, title: "after" }, undefined, t.handle());
    await a.wait((e) => e.k === "activity");
  });

  it("stop() ends the connection with no reconnect", async () => {
    const count = async () =>
      (await t.pool().query("select 1 from pg_stat_activity where application_name = 'lifeos-hub' and datname = current_database()")).rowCount;
    const hub = createHub(t.url(), async () => null);
    const a = collect(hub);
    await a.wait((e) => e.k === "resync");
    const before = await count();
    await hub.stop();
    await new Promise((r) => setTimeout(r, 1500));
    expect(await count()).toBe(before! - 1);
  });
});

describe("hub signal frames", () => {
  it("forwards calendar/task as id-only frames without a row load and drops overlong ids", async () => {
    const load = vi.fn(async () => null);
    const hub = createHub(t.url(), load);
    hubs.push(hub);
    const a = collect(hub);
    await a.wait((e) => e.k === "resync");
    const id = "00000000-0000-0000-0000-000000000001";
    await notifyLive(t.handle(), "task", id);
    await notifyLive(t.handle(), "calendar", "google_calendar");
    await notifyLive(t.handle(), "task", "x".repeat(65));
    await notifyLive(t.handle(), "calendar", "icloud_calendar"); // sentinel: arrives after the dropped frame
    await a.wait((e) => e.k === "calendar", 2);
    const sig = a.events.filter((e) => e.k === "task" || e.k === "calendar");
    expect(sig).toEqual([
      { k: "task", json: JSON.stringify({ id }) },
      { k: "calendar", json: JSON.stringify({ id: "google_calendar" }) },
      { k: "calendar", json: JSON.stringify({ id: "icloud_calendar" }) },
    ]);
    expect(load).not.toHaveBeenCalled();
  });
});
