import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { decide, executeApproved } from "@/server/agents/approvals";
import { callTool } from "@/server/agents/gateway";
import { calendarTools } from "@/server/agents/tools/calendar";
import type { ToolContext } from "@/server/agents/types";
import { agentRuns, approvals, calendarEvents, calendars, connections, permissions, tasks } from "@/server/db/schema";
import { fakeCalendarProvider } from "../helpers/fake-calendar";
import { setupTestDb } from "./helpers";

const prov = vi.hoisted(() => ({ cur: null as unknown }));
vi.mock("@/server/calendar/providers", () => ({ providerFor: async () => prov.cur }));
vi.mock("@/server/agents/registry", async (orig) => ({
  ...(await orig<typeof import("@/server/agents/registry")>()),
  getAgent: () => ({ id: "organization", name: "Organization", live: true, tools: Object.keys(calendarTools) }),
}));

const t = setupTestDb();
const h = () => t.handle();
const NOW = new Date("2026-10-08T00:00:00Z"); // Thu 11:00 Sydney
const at = (hh: number, mm = 0) => new Date(Date.UTC(2026, 9, 8, hh - 11, mm));
const ISO = (hh: number) => at(hh).toISOString();
let runId = "";
let writeCal = "";
let readCal = "";
let gymId = "";

const call = (name: string, input: unknown) =>
  callTool({ handle: h(), runId, agentId: "organization", tools: calendarTools, now: () => NOW }, name, input, `tu_${Math.random()}`);
const out = (r: Awaited<ReturnType<typeof call>>) => (r as { output: { connected: boolean; message?: string; items: Record<string, unknown>[] } }).output;
const approvalOf = async (r: Awaited<ReturnType<typeof call>>) => {
  expect(r.status).toBe("waiting_approval");
  const [ap] = await h().select().from(approvals).where(eq(approvals.id, (r as { approvalId: string }).approvalId));
  return ap!;
};
const approve = async (id: string) => expect(await decide(h(), id, "approve", { enqueue: async () => {} })).toMatchObject({ ok: true });
const NOT_CONNECTED = "No calendar is connected yet, so I can't see your schedule. Connect Google Calendar or iCloud in Settings → Connections.";

beforeAll(async () => {
  const [r] = await h().insert(agentRuns).values({ agentId: "organization", prompt: "p", model: "m" }).returning();
  runId = r!.id;
});

describe("calendar tools", () => {
  it("every tool is private; tiers are right; no repeat field; handlers need an approval", async () => {
    const all = Object.values(calendarTools);
    expect(all).toHaveLength(7);
    expect(all.every((x) => x.private === true)).toBe(true);
    expect(all.filter((x) => x.tier === "HIGH_RISK").map((x) => x.name)).toEqual(["calendar.delete_event"]);
    expect(all.filter((x) => x.tier === "APPROVE")).toHaveLength(2);
    expect(all.filter((x) => x.tier === "READ")).toHaveLength(4);
    for (const x of all) expect(Object.keys((x.input as unknown as { shape: object }).shape)).not.toContain("repeat");
    const ctx = { handle: h(), runId, agentId: "organization", toolUseId: "x", now: () => NOW } as ToolContext;
    for (const n of ["calendar.create_event", "calendar.update_event", "calendar.delete_event"]) {
      await expect(calendarTools[n]!.handler({}, ctx)).rejects.toMatchObject({ code: "not_allowed" });
    }
  });

  it("with no calendar connected the calendar reads say so; tasks still work", async () => {
    for (const [n, i] of [["calendar.list_events", { from: "2026-10-08" }], ["calendar.find_free_slots", { date: "2026-10-08" }], ["calendar.detect_conflicts", { from: "2026-10-08" }]] as const) {
      expect(out(await call(n, i))).toEqual({ connected: false, message: NOT_CONNECTED, items: [] });
    }
    await h().insert(tasks).values({ title: "Buy milk", dueAt: at(17), dueDate: "2026-10-08", dueTime: "17:00", priority: 2 });
    const r = out(await call("tasks.list", { which: "open" }));
    expect(r.connected).toBe(true);
    expect(r.items).toMatchObject([{ title: "Buy milk", priority: 2, completed: false }]);
    expect(await call("calendar.create_event", { title: "x", start: ISO(10), end: ISO(11) })).toMatchObject({ status: "error", error: "That calendar can't be written." });
  });

  it("seeds a connection, calendars and events", async () => {
    await h().insert(connections).values({ id: "google_calendar", ciphertext: "x", last4: "", lastSyncAt: NOW });
    const mk = (remoteId: string, v: Partial<typeof calendars.$inferInsert>) =>
      h().insert(calendars).values({ connectionId: "google_calendar", remoteId, name: remoteId, ...v }).returning();
    writeCal = (await mk("main", { enabled: true, category: "work", access: "owner", isDefault: true }))[0]!.id;
    readCal = (await mk("reader", { enabled: true, category: "social", access: "reader" }))[0]!.id;
    const ev = (calendarId: string, remoteId: string, title: string, s: Date, e: Date) =>
      ({ calendarId, remoteId, title, startAt: s, endAt: e, tz: "Australia/Sydney", etag: "e1", raw: {} }) as typeof calendarEvents.$inferInsert;
    const rows = await h()
      .insert(calendarEvents)
      .values([ev(writeCal, "gym", "Gym", at(14), at(15)), ev(writeCal, "gym2", "Gym class", at(14, 30), at(15, 30)), ev(readCal, "ro", "Holiday", at(18), at(19))])
      .returning();
    gymId = rows.find((r) => r.remoteId === "gym")!.id;
  });

  it("READ tools return bounded Sydney-labelled items", async () => {
    const ev = out(await call("calendar.list_events", { from: "2026-10-08", query: "gym" }));
    expect(ev.connected).toBe(true);
    expect(ev.items.map((i) => i.title)).toEqual(["Gym", "Gym class"]);
    expect(ev.items[0]).toMatchObject({ id: gymId, when: "Thu 8 Oct 14:00-15:00", readOnly: false, recurring: false });
    const free = out(await call("calendar.find_free_slots", { date: "2026-10-08", minMinutes: 60 })).items;
    expect(free.length).toBeGreaterThan(0);
    expect(free.every((s) => (s.minutes as number) >= 60)).toBe(true);
    expect(free.some((s) => String(s.when).startsWith("Thu 8 Oct 15:30"))).toBe(true);
    const c = out(await call("calendar.detect_conflicts", { from: "2026-10-08" })).items;
    expect(c).toMatchObject([{ a: "Gym", b: "Gym class" }]);
    expect((await call("calendar.list_events", { from: "08/10/2026" })).status).toBe("error");
  });

  it("create waits for approval with locked fields filled from the DB and makes no provider call", async () => {
    const p = fakeCalendarProvider("google", { calendars: [], results: {} });
    prov.cur = p;
    const r = await call("calendar.create_event", { title: "Dentist", start: ISO(16), end: ISO(17), calendarLabel: "Evil", provider: "icloud" });
    const ap = await approvalOf(r);
    expect(ap.originalPayload).toMatchObject({ title: "Dentist", calendarId: writeCal, calendarLabel: "Google · main", provider: "google" });
    expect(p.calls.create).toHaveLength(0);
    expect(await call("calendar.create_event", { title: "x", start: ISO(16), end: ISO(17), calendarId: readCal })).toMatchObject({ error: "That calendar can't be written." });
  });

  it("an approved create sends the deterministic google id and returns the event", async () => {
    const p = fakeCalendarProvider("google", {
      calendars: [],
      results: {},
      create: async (_ref, w, o) => ({
        upserts: [{ remoteId: o!.remoteId!, url: null, etag: "n1", title: w.title, description: "", location: "", startAt: new Date(w.start), endAt: new Date(w.end), allDay: false, startDate: null, endDate: null, tz: "Australia/Sydney", recurrence: null, recurringRemoteId: null, originalStart: null, status: "confirmed", transparency: "opaque", declined: false, raw: {} }],
        deletes: [],
      }),
    });
    prov.cur = p;
    const ap = await approvalOf(await call("calendar.create_event", { title: "Lunch", start: ISO(12), end: ISO(13) }));
    await approve(ap.id);
    const o = await executeApproved(h(), ap.id, { tools: calendarTools, now: () => NOW });
    expect(o).toMatchObject({ status: "executed", result: { calendarId: writeCal, start: ISO(12) } });
    expect(p.calls.create[0]![2]).toEqual({ remoteId: `lifeos${ap.id.replaceAll("-", "")}` });
  });

  it("update stamps etag and before, defaults scope to all, and refuses a stale etag", async () => {
    const p = fakeCalendarProvider("google", { calendars: [], results: {} });
    prov.cur = p;
    const ap = await approvalOf(await call("calendar.update_event", { eventId: gymId, title: "Gym PM" }));
    expect(ap.originalPayload).toMatchObject({ eventId: gymId, etag: "e1", scope: "all", instanceStart: null, title: "Gym PM", before: { title: "Gym", start: ISO(14) } });
    await approve(ap.id);
    await h().update(calendarEvents).set({ etag: "e2" }).where(eq(calendarEvents.id, gymId));
    const o = await executeApproved(h(), ap.id, { tools: calendarTools, now: () => NOW });
    expect(o).toMatchObject({ status: "failed", error: "This event changed after the request was prepared, so it can't be applied. Reject it and ask again." });
    expect(p.calls.update).toHaveLength(0);
  });

  it("instanceStart is matched in canonical form; an unparseable one is a clear input error (IN-A05)", async () => {
    prov.cur = fakeCalendarProvider("google", { calendars: [], results: {} });
    const [row] = await h()
      .insert(calendarEvents)
      .values({ calendarId: writeCal, remoteId: "standup", title: "Standup", startAt: at(9), endAt: at(10), tz: "Australia/Sydney", etag: "s1", recurrence: ["RRULE:FREQ=DAILY"], raw: {} })
      .returning();
    const noMs = at(9).toISOString().replace(".000Z", "Z");
    const ap = await approvalOf(await call("calendar.update_event", { eventId: row!.id, instanceStart: noMs, scope: "this", title: "Standup (moved)" }));
    expect(ap.originalPayload).toMatchObject({ instanceStart: at(9).toISOString(), scope: "this" });
    expect(await call("calendar.update_event", { eventId: row!.id, instanceStart: "next tuesday", scope: "this", title: "x" })).toMatchObject({
      error: "Give the instanceStart of the occurrence from list_events.",
    });
    await h().delete(calendarEvents).where(eq(calendarEvents.id, row!.id));
  });

  it("delete is HIGH_RISK even with a READ permission override; read-only targets are rejected", async () => {
    await h().insert(permissions).values({ agentId: "organization", tool: "calendar.delete_event", tier: "READ" });
    const ap = await approvalOf(await call("calendar.delete_event", { eventId: gymId }));
    expect(ap.originalPayload).toMatchObject({ eventId: gymId, title: "Gym", scope: "all" });
    const [ro] = await h().select().from(calendarEvents).where(eq(calendarEvents.remoteId, "ro"));
    expect(await call("calendar.delete_event", { eventId: ro!.id })).toMatchObject({ error: "That calendar can't be written." });
    expect(await call("calendar.update_event", { eventId: ro!.id, title: "x" })).toMatchObject({ error: "That calendar can't be written." });
  });
});
