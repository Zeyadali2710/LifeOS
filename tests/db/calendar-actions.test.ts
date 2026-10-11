import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/server/calendar/errors";
import type { providerFor } from "@/server/calendar/providers";
import type { CalendarProvider, NormalizedEvent } from "@/server/calendar/types";
import { auditLog, calendarEvents, calendars, connections, settings, tasks } from "@/server/db/schema";
import { fakeCalendarProvider, type FakeCalendarProvider } from "../helpers/fake-calendar";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => t.handle() }));
let denied = false;
vi.mock("@/server/session", () => ({
  requireOwner: async () => {
    if (denied) throw new Error("redirect");
  },
}));
let current: CalendarProvider;
vi.mock("@/server/calendar/providers", () => ({ providerFor: async () => current }));
const enqueue = vi.fn<(...a: unknown[]) => Promise<void>>(async () => undefined);
vi.mock("@/server/queue", () => ({ enqueue: (...a: unknown[]) => enqueue(...a), QUEUES: { calendarSync: "calendar.sync" } }));

import { createEvent, deleteEvent, updateEvent, type WriteCtx } from "@/server/calendar/events";
import { addPlanItemAction, createEventAction, deleteEventAction, reloadEventAction, syncCalendarsNowAction, updateEventAction } from "@/server/calendar-actions";

const NOW = new Date("2026-10-08T00:00:00Z");
const ctx = (o: Partial<WriteCtx> = {}): WriteCtx => ({ actor: "owner", providerFor: (async () => current) as unknown as typeof providerFor, now: () => NOW, ...o });
const input = {
  title: "SECRET-TITLE", start: "2026-10-20T10:30:00.000Z", end: "2026-10-20T11:30:00.000Z", allDay: false,
  timeZone: "Australia/Sydney", location: "", description: "SECRET-DESC", showAs: "busy" as const, repeat: "none" as const,
};
const ev = (remoteId: string, o: Partial<NormalizedEvent> = {}): NormalizedEvent => ({
  remoteId, url: null, etag: `"${remoteId}-1"`, title: "Made", description: null, location: null,
  startAt: new Date(input.start), endAt: new Date(input.end), allDay: false, startDate: null, endDate: null, tz: "Australia/Sydney",
  recurrence: null, recurringRemoteId: null, originalStart: null, status: "confirmed", transparency: "opaque", declined: false, raw: {}, ...o,
});

let gid = "";
let rid = "";
let cid = "";
let offId = "";
let fake: FakeCalendarProvider;

beforeEach(async () => {
  const h = t.handle();
  denied = false;
  enqueue.mockClear();
  await h.delete(auditLog);
  await h.delete(connections);
  await h.delete(settings);
  await h.insert(connections).values([
    { id: "google_calendar", ciphertext: "x", last4: "", login: "g@example.com" },
    { id: "icloud_calendar", ciphertext: "x", last4: "", login: "i@example.com" },
  ]);
  const [g, r, c, off] = await h
    .insert(calendars)
    .values([
      { connectionId: "google_calendar", remoteId: "g-main", name: "Main", access: "owner", enabled: true, category: "personal" },
      { connectionId: "google_calendar", remoteId: "g-ro", name: "Holidays", access: "reader", enabled: true, category: "events" },
      { connectionId: "icloud_calendar", remoteId: "https://p01-caldav.icloud.com/1/cal/", name: "Home", access: "owner", enabled: true, category: "personal" },
      { connectionId: "google_calendar", remoteId: "g-off", name: "Off", access: "owner", enabled: false, category: "work" },
    ])
    .returning();
  gid = g!.id;
  rid = r!.id;
  cid = c!.id;
  offId = off!.id;
  fake = fakeCalendarProvider("google", {
    calendars: [],
    results: {},
    create: async (_c, w, o) => ({ upserts: [ev(o?.remoteId ?? "new1", { title: w.title })], deletes: [] }),
    update: async (_c, s) => ({ upserts: [ev(s.remoteId, { etag: '"v2"', title: "Edited" })], deletes: [] }),
    remove: async (_c, s) => ({ upserts: [], deletes: [s.remoteId] }),
  });
  current = fake;
});

const audits = () => t.handle().select().from(auditLog);

describe("event write service", () => {
  it("create writes through the provider, stores rows, records last used, audits without content", async () => {
    const h = t.handle();
    const r = await createEvent(h, { calendarId: gid, input: { ...input, repeat: "custom" } }, ctx());
    expect(r).toMatchObject({ ok: true, calendarId: gid, calendarName: "Main", start: input.start, overlaps: null });
    expect(fake.calls.create[0]![1]).toMatchObject({ repeat: "none", title: "SECRET-TITLE", marker: null });
    if (!r.ok) throw new Error();
    const [row] = await h.select().from(calendarEvents).where(eq(calendarEvents.id, r.eventId));
    expect(row!.remoteId).toBe("new1");
    const [last] = await h.select().from(settings).where(eq(settings.key, "calendar.last_used"));
    expect(last!.value).toBe(gid);
    const a = (await audits()).filter((x) => x.action === "calendar.event.create");
    expect(a).toHaveLength(1);
    expect(a[0]!.metadata).toMatchObject({ calendarId: gid, eventId: r.eventId, actor: "owner" });
    expect(JSON.stringify(await audits())).not.toMatch(/SECRET/);
  });

  it("reports an overlap with a busy event but still writes", async () => {
    const h = t.handle();
    await h.insert(calendarEvents).values({ calendarId: gid, ...ev("other", { title: "Standup", startAt: new Date("2026-10-20T10:00:00Z"), endAt: new Date("2026-10-20T11:00:00Z") }) });
    const r = await createEvent(h, { calendarId: gid, input }, ctx());
    expect(r).toMatchObject({ ok: true, overlaps: { title: "Standup", start: "2026-10-20T10:00:00.000Z" } });
  });

  it("refuses disabled, uncategorised and read-only calendars without calling the provider", async () => {
    const h = t.handle();
    const [unc] = await h.insert(calendars).values({ connectionId: "google_calendar", remoteId: "g-unc", name: "U", access: "owner", enabled: true, category: null }).returning();
    for (const id of [rid, offId, unc!.id]) expect(await createEvent(h, { calendarId: id, input }, ctx())).toEqual({ ok: false, error: "read_only" });
    expect(fake.calls.create).toHaveLength(0);
  });

  it("agent create uses a deterministic remote id per approval and never repeats", async () => {
    const h = t.handle();
    const approvalId = "11111111-2222-3333-4444-555555555555";
    await createEvent(h, { calendarId: gid, input: { ...input, repeat: "weekly" } }, ctx({ actor: "agent", approvalId }));
    expect(fake.calls.create[0]![2]).toEqual({ remoteId: "lifeos11111111222233334444555555555555" });
    expect(fake.calls.create[0]![1]).toMatchObject({ repeat: "none", marker: approvalId });
    const ic = fakeCalendarProvider("icloud", { calendars: [], results: {}, create: async (_c, _w, o) => ({ upserts: [ev(o!.remoteId!)], deletes: [] }) });
    current = ic;
    await createEvent(h, { calendarId: cid, input }, ctx({ actor: "agent", approvalId }));
    expect(ic.calls.create[0]![2]).toEqual({ remoteId: `${approvalId}@lifeos` });
    const a = (await audits()).filter((x) => x.action === "calendar.event.create");
    expect(a.map((x) => x.actor)).toEqual(["agent", "agent"]);
    expect(a[0]!.metadata).toMatchObject({ approvalId, actor: "agent" });
  });

  async function seed(etag: string | null = '"e1"') {
    const [row] = await t.handle().insert(calendarEvents).values({ calendarId: gid, ...ev("ev1", { etag }) }).returning();
    return row!.id;
  }

  it("update refuses a stale etag with no provider call, applies a matching one", async () => {
    const h = t.handle();
    const eventId = await seed();
    const args = { eventId, scope: "all" as const, instanceStart: null, input: { ...input, repeat: "custom" as const } };
    expect(await updateEvent(h, { ...args, etag: '"old"' }, ctx())).toEqual({ ok: false, error: "changed" });
    expect(fake.calls.update).toHaveLength(0);
    const r = await updateEvent(h, { ...args, etag: '"e1"' }, ctx());
    expect(r).toMatchObject({ ok: true, eventId });
    expect(fake.calls.update[0]![3]).toBe("all");
    expect(fake.calls.update[0]![2].repeat).toBe("keep");
    const [row] = await h.select().from(calendarEvents).where(eq(calendarEvents.id, eventId));
    expect(row).toMatchObject({ etag: '"v2"', title: "Edited" });
    expect((await audits()).some((x) => x.action === "calendar.event.update")).toBe(true);
    expect(await updateEvent(h, { ...args, eventId: "00000000-0000-4000-8000-000000000000", etag: null }, ctx())).toEqual({ ok: false, error: "not_found" });
  });

  it("scope all from a clicked occurrence keeps the series start and applies only the change (CR-A01)", async () => {
    const h = t.handle();
    const masterStart = "2026-10-06T22:00:00.000Z";
    const [row] = await h
      .insert(calendarEvents)
      .values({ calendarId: gid, ...ev("series", { etag: '"s1"', startAt: new Date(masterStart), endAt: new Date("2026-10-06T23:00:00.000Z"), recurrence: ["RRULE:FREQ=WEEKLY"] }) })
      .returning();
    const third = "2026-10-20T22:00:00.000Z";
    const args = { eventId: row!.id, etag: '"s1"', scope: "all" as const, instanceStart: third };
    // title-only edit on the 3rd occurrence
    await updateEvent(h, { ...args, input: { ...input, start: third, end: "2026-10-20T23:00:00.000Z", repeat: "custom" } }, ctx());
    expect(fake.calls.update[0]![2]).toMatchObject({ start: masterStart, end: "2026-10-06T23:00:00.000Z" });
    // moving the occurrence an hour later moves the series an hour later, not to the 3rd week
    await h.update(calendarEvents).set({ etag: '"s1"', recurrence: ["RRULE:FREQ=WEEKLY"], startAt: new Date(masterStart) }).where(eq(calendarEvents.id, row!.id));
    await updateEvent(h, { ...args, input: { ...input, start: "2026-10-20T23:00:00.000Z", end: "2026-10-21T00:30:00.000Z", repeat: "custom" } }, ctx());
    expect(fake.calls.update[1]![2]).toMatchObject({ start: "2026-10-06T23:00:00.000Z", end: "2026-10-07T00:30:00.000Z" });
  });

  it("delete applies the scope and audits", async () => {
    const h = t.handle();
    const eventId = await seed();
    expect(await deleteEvent(h, { eventId, etag: '"x"', scope: "all", instanceStart: null }, ctx())).toEqual({ ok: false, error: "changed" });
    const r = await deleteEvent(h, { eventId, etag: '"e1"', scope: "following", instanceStart: "2026-10-20T10:30:00.000Z" }, ctx());
    expect(r.ok).toBe(true);
    expect(fake.calls.remove[0]!.slice(2)).toEqual(["following", "2026-10-20T10:30:00.000Z"]);
    expect(await h.select().from(calendarEvents).where(eq(calendarEvents.id, eventId))).toHaveLength(0);
    expect((await audits()).filter((x) => x.action === "calendar.event.delete")).toHaveLength(1);
  });

  it("auth errors pause the connection and rethrow; other provider errors rethrow unchanged", async () => {
    const h = t.handle();
    const auth = new ProviderError("google", "auth", 401, "Access was rejected.");
    current = fakeCalendarProvider("google", { calendars: [], results: {}, create: async () => { throw auth; } });
    await expect(createEvent(h, { calendarId: gid, input }, ctx())).rejects.toBe(auth);
    const [c] = await h.select().from(connections).where(eq(connections.id, "google_calendar"));
    expect(c).toMatchObject({ status: "error", lastError: "Access was rejected." });
    const rate = new ProviderError("google", "rate_limit", 429, "Rate limited.");
    current = fakeCalendarProvider("google", { calendars: [], results: {}, create: async () => { throw rate; } });
    await expect(createEvent(h, { calendarId: gid, input }, ctx())).rejects.toBe(rate);
    expect((await h.select().from(connections).where(eq(connections.id, "icloud_calendar")))[0]!.status).toBe("connected");
  });
});

describe("calendar server actions", () => {
  const form = () => ({ ...input, calendarId: gid });
  const rej = (p: Promise<unknown>) => p.then(() => "ok", (e: Error) => e.message);

  it("reject without owner and call no provider", async () => {
    denied = true;
    const id = "00000000-0000-4000-8000-000000000000";
    for (const p of [createEventAction(form()), updateEventAction({ eventId: id }), deleteEventAction({ eventId: id }), reloadEventAction(id), addPlanItemAction({}), syncCalendarsNowAction()]) expect(await rej(p)).toBe("redirect");
    expect(fake.calls.create.length + fake.calls.update.length + fake.calls.remove.length).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("validates input with the UI-SPEC messages", async () => {
    expect(await createEventAction({ ...form(), title: " " })).toEqual({ ok: false, errors: { title: "Add a title." } });
    expect(await createEventAction({ ...form(), end: input.start })).toEqual({ ok: false, errors: { end: "End must be after start." } });
    expect(await createEventAction({ ...form(), calendarId: "nope" })).toEqual({ ok: false, errors: { calendarId: "Pick a calendar." } });
    expect(fake.calls.create).toHaveLength(0);
  });

  it("create succeeds and maps provider errors to fixed codes", async () => {
    expect(await createEventAction(form())).toMatchObject({ ok: true, calendarName: "Main", start: input.start, overlaps: null });
    const err = (kind: ConstructorParameters<typeof ProviderError>[1]) => {
      current = fakeCalendarProvider("google", { calendars: [], results: {}, create: async () => { throw new ProviderError("google", kind, 400, "x"); } });
    };
    err("auth");
    expect(await createEventAction(form())).toEqual({ ok: false, error: "reconnect", provider: "google" });
    err("conflict");
    expect(await createEventAction(form())).toEqual({ ok: false, error: "changed", provider: "google" });
    err("unavailable");
    expect(await createEventAction(form())).toEqual({ ok: false, error: "provider", provider: "google" });
    expect(await createEventAction({ ...form(), calendarId: rid })).toEqual({ ok: false, error: "read_only", provider: "google" });
  });

  it("update and delete take the instance fields; reload returns the stored event", async () => {
    const [row] = await t.handle().insert(calendarEvents).values({ calendarId: gid, ...ev("ev9", { etag: '"e9"', title: "Stored", location: "Here" }) }).returning();
    const eventId = row!.id;
    const target = { eventId, etag: '"e9"', scope: "all", instanceStart: null };
    expect(await updateEventAction({ ...target, ...input })).toMatchObject({ ok: true, eventId });
    expect(await updateEventAction({ ...target, ...input, etag: '"old"' })).toEqual({ ok: false, error: "changed", provider: "google" });
    expect(await reloadEventAction(eventId)).toMatchObject({ ok: true, title: "Edited", etag: '"v2"', allDay: false, showAs: "busy", rrule: null });
    expect(await reloadEventAction("00000000-0000-4000-8000-000000000000")).toEqual({ ok: false, error: "not_found" });
    expect(await deleteEventAction({ ...target, etag: '"v2"' })).toMatchObject({ ok: true });
    expect(await deleteEventAction({ ...target, eventId: "bad" })).toMatchObject({ ok: false });
  });

  it("addPlanItemAction creates a titled event on the default calendar and leaves the task open", async () => {
    const h = t.handle();
    await h.update(calendars).set({ isDefault: true }).where(eq(calendars.id, gid));
    const [task] = await h.insert(tasks).values({ title: "Write report" }).returning();
    const r = await addPlanItemAction({ taskId: task!.id, start: input.start, end: input.end });
    expect(r).toMatchObject({ ok: true, calendarName: "Main", start: input.start });
    expect(fake.calls.create[0]![1]).toMatchObject({ title: "Write report", start: input.start });
    const [after] = await h.select().from(tasks).where(eq(tasks.id, task!.id));
    expect(after!.completedAt).toBeNull();
    expect(await addPlanItemAction({ taskId: "00000000-0000-4000-8000-000000000000", start: input.start, end: input.end })).toMatchObject({ ok: false, error: "not_found" });
  });

  it("syncCalendarsNowAction enqueues with a singleton key and reports failure", async () => {
    expect(await syncCalendarsNowAction()).toEqual({ ok: true });
    expect(enqueue).toHaveBeenCalledWith("calendar.sync", {}, { singletonKey: "calendar.sync" });
    enqueue.mockRejectedValueOnce(new Error("down"));
    expect(await syncCalendarsNowAction()).toEqual({ ok: false });
  });
});
