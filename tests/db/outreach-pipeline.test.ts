import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/server/calendar/errors";
import type { WriteCtx } from "@/server/calendar/events";
import type { providerFor } from "@/server/calendar/providers";
import type { CalendarProvider, NormalizedEvent } from "@/server/calendar/types";
import { activityEvents, auditLog, calendarEvents, calendars, connections, outreachEvents, settings, tasks } from "@/server/db/schema";
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

import { addToCalendar, createFollowUps, dismissEvent, moveStage, restoreEvent } from "@/server/outreach/pipeline";
import { addToCalendarAction, createFollowUpsAction, moveStageAction } from "@/server/outreach-pipeline-actions";

const NOW = new Date("2026-10-08T00:00:00Z");
const ctx = (): WriteCtx => ({ actor: "agent", providerFor: (async () => current) as unknown as typeof providerFor, now: () => NOW });
const ev = (remoteId: string, o: Partial<NormalizedEvent> = {}): NormalizedEvent => ({
  remoteId, url: null, etag: `"${remoteId}-1"`, title: "Made", description: null, location: null,
  startAt: new Date("2026-10-20T10:00:00Z"), endAt: new Date("2026-10-20T11:00:00Z"), allDay: false, startDate: null, endDate: null, tz: "Australia/Sydney",
  recurrence: null, recurringRemoteId: null, originalStart: null, status: "confirmed", transparency: "opaque", declined: false, raw: {}, ...o,
});

let gid = "";
let fake: FakeCalendarProvider;

async function seed(o: Partial<typeof outreachEvents.$inferInsert> = {}) {
  const [r] = await t
    .handle()
    .insert(outreachEvents)
    .values({ title: "SECRET Demo Night", titleKey: "demo night", startAt: new Date("2026-10-20T10:00:00Z"), endAt: new Date("2026-10-20T12:00:00Z"), isMock: false, url: "https://ex.com/e", description: "About", ...o })
    .returning();
  return r!;
}
const get = async (id: string) => (await t.handle().select().from(outreachEvents).where(eq(outreachEvents.id, id)))[0]!;

beforeEach(async () => {
  const h = t.handle();
  denied = false;
  await h.delete(auditLog);
  await h.delete(activityEvents);
  await h.delete(tasks);
  await h.delete(outreachEvents);
  await h.delete(connections);
  await h.delete(settings);
  await h.insert(connections).values({ id: "google_calendar", ciphertext: "x", last4: "", login: "g@example.com" });
  const [g] = await h.insert(calendars).values({ connectionId: "google_calendar", remoteId: "g-main", name: "Main", access: "owner", enabled: true, category: "personal" }).returning();
  gid = g!.id;
  fake = fakeCalendarProvider("google", {
    calendars: [],
    results: {},
    create: async (_c, w) => ({ upserts: [ev("new1", { title: w.title })], deletes: [] }),
    remove: async (_c, s) => ({ upserts: [], deletes: [s.remoteId] }),
  });
  current = fake;
});

describe("stage moves", () => {
  it("moves forward writing one audit row (no title) and one activity", async () => {
    const e = await seed();
    expect(await moveStage(t.handle(), e.id, null, "SAVED", NOW)).toEqual({ ok: true });
    const r = await get(e.id);
    expect(r.stage).toBe("SAVED");
    expect(r.stageChangedAt).toEqual(NOW);
    expect(await moveStage(t.handle(), e.id, "SAVED", "INTERESTED", NOW)).toEqual({ ok: true });
    const a = (await t.handle().select().from(auditLog)).filter((x) => x.action === "outreach.stage");
    expect(a).toHaveLength(2);
    expect(a[0]!.metadata).toEqual({ id: e.id, from: null, to: "SAVED" });
    expect(JSON.stringify(a.map((x) => x.metadata))).not.toContain("title");
    expect(JSON.stringify(a)).not.toContain("SECRET");
    const act = await t.handle().select().from(activityEvents);
    expect(act.map((x) => x.title).sort()).toEqual(["Discovered → Saved", "Saved → Interested"]);
    expect(act[0]).toMatchObject({ type: "outreach.stage", source: "outreach" });
    expect(act[0]!.payload).toMatchObject({ detail: "SECRET Demo Night" });
  });

  it("refuses a stale from, writing nothing", async () => {
    const e = await seed({ stage: "INTERESTED" });
    expect(await moveStage(t.handle(), e.id, "SAVED", "INTERESTED", NOW)).toEqual({ ok: false, error: "changed" });
    expect(await t.handle().select().from(auditLog)).toHaveLength(0);
    expect(await t.handle().select().from(activityEvents)).toHaveLength(0);
    expect(await moveStage(t.handle(), "00000000-0000-4000-8000-000000000000", null, "SAVED", NOW)).toEqual({ ok: false, error: "not_found" });
  });

  it("allows one step only and never enters FOLLOW_UP by move", async () => {
    const e = await seed({ stage: "SAVED" });
    expect(await moveStage(t.handle(), e.id, "SAVED", "ATTENDING", NOW)).toEqual({ ok: false, error: "invalid" });
    const a = await seed({ stage: "ATTENDED" });
    expect(await moveStage(t.handle(), a.id, "ATTENDED", "FOLLOW_UP", NOW)).toEqual({ ok: false, error: "invalid" });
    expect(await moveStage(t.handle(), a.id, "ATTENDED", "ATTENDING", NOW)).toEqual({ ok: true });
  });

  it("dismiss and restore only work on unsaved events", async () => {
    const saved = await seed({ stage: "SAVED" });
    expect(await dismissEvent(t.handle(), saved.id, NOW)).toEqual({ ok: false, error: "invalid" });
    const e = await seed();
    expect(await dismissEvent(t.handle(), e.id, NOW)).toEqual({ ok: true });
    expect((await get(e.id)).dismissedAt).toEqual(NOW);
    expect(await moveStage(t.handle(), e.id, null, "SAVED", NOW)).toEqual({ ok: false, error: "changed" });
    expect(await restoreEvent(t.handle(), e.id, NOW)).toEqual({ ok: true });
    expect((await get(e.id)).dismissedAt).toBeNull();
    expect(await restoreEvent(t.handle(), saved.id, NOW)).toEqual({ ok: false, error: "invalid" });
  });
});

describe("add to calendar", () => {
  it("refuses mock events and early stages", async () => {
    const m = await seed({ isMock: true, stage: "ATTENDING" });
    expect(await addToCalendar(t.handle(), m.id, gid, ctx())).toEqual({ ok: false, error: "mock" });
    const i = await seed({ stage: "INTERESTED" });
    expect(await addToCalendar(t.handle(), i.id, gid, ctx())).toEqual({ ok: false, error: "invalid" });
    expect(fake.calls.create).toHaveLength(0);
  });

  it("creates the event as owner, links it, and refuses a second call", async () => {
    const e = await seed({ stage: "ATTENDING" });
    const r = await addToCalendar(t.handle(), e.id, gid, ctx());
    expect(r).toMatchObject({ ok: true, calendarName: "Main" });
    expect(fake.calls.create[0]![1].description).toContain("https://ex.com/e");
    const cur = await get(e.id);
    expect(cur.calendarEventId).not.toBeNull();
    const [ce] = await t.handle().select().from(calendarEvents).where(eq(calendarEvents.id, cur.calendarEventId!));
    expect(ce).toBeTruthy();
    const a = (await t.handle().select().from(auditLog)).filter((x) => x.action === "calendar.event.create");
    expect(a[0]!.actor).toBe("owner");
    expect(await addToCalendar(t.handle(), e.id, gid, ctx())).toEqual({ ok: false, error: "linked" });
    expect(fake.calls.create).toHaveLength(1);
  });

  it("maps a provider auth error to reconnect and leaves the link empty", async () => {
    fake = fakeCalendarProvider("google", { calendars: [], results: {}, create: async () => { throw new ProviderError("google", "auth", 401, "no"); } });
    current = fake;
    const e = await seed({ stage: "ATTENDED" });
    expect(await addToCalendar(t.handle(), e.id, null, ctx())).toEqual({ ok: false, error: "reconnect" });
    expect((await get(e.id)).calendarEventId).toBeNull();
  });

  it("race: a concurrent link wins, the loser deletes its remote event", async () => {
    const e = await seed({ stage: "ATTENDING" });
    fake = fakeCalendarProvider("google", {
      calendars: [],
      results: {},
      create: async () => {
        const [other] = await t.handle().insert(calendarEvents).values({ calendarId: gid, ...ev("winner") }).returning();
        await t.handle().update(outreachEvents).set({ calendarEventId: other!.id }).where(eq(outreachEvents.id, e.id));
        return { upserts: [ev("loser")], deletes: [] };
      },
      remove: async (_c, s) => ({ upserts: [], deletes: [s.remoteId] }),
    });
    current = fake;
    expect(await addToCalendar(t.handle(), e.id, gid, ctx())).toEqual({ ok: false, error: "linked" });
    expect(fake.calls.remove).toHaveLength(1);
    expect(fake.calls.remove[0]![1].remoteId).toBe("loser");
    const rows = await t.handle().select().from(calendarEvents).where(eq(calendarEvents.calendarId, gid));
    expect(rows.map((x) => x.remoteId)).toEqual(["winner"]);
  });
});

describe("follow-ups", () => {
  it("creates tasks (priority 2, linked) and moves ATTENDED to FOLLOW_UP", async () => {
    const e = await seed({ stage: "ATTENDED" });
    const r = await createFollowUps(t.handle(), e.id, [{ title: "Email Hannah", dueDate: "2026-10-22" }, { title: "Connect on LinkedIn", dueDate: null }], NOW);
    expect(r).toEqual({ ok: true, count: 2 });
    const ts = await t.handle().select().from(tasks);
    expect(ts).toHaveLength(2);
    expect(ts.every((x) => x.priority === 2 && x.outreachEventId === e.id)).toBe(true);
    expect((await get(e.id)).stage).toBe("FOLLOW_UP");
    const a = (await t.handle().select().from(auditLog)).filter((x) => x.action === "outreach.follow_up");
    expect(a).toHaveLength(1);
    expect(JSON.stringify(a)).not.toContain("SECRET");
  });

  it("rolls everything back when a line is invalid", async () => {
    const e = await seed({ stage: "ATTENDED" });
    const r = await createFollowUps(t.handle(), e.id, [{ title: "Good", dueDate: null }, { title: "  ", dueDate: null }], NOW);
    expect(r).toMatchObject({ ok: false, errors: { "lines.1.title": "Add a title." } });
    expect(await t.handle().select().from(tasks)).toHaveLength(0);
    expect((await get(e.id)).stage).toBe("ATTENDED");
  });

  it("rejects 0 or 11 lines, mock events and wrong stages", async () => {
    const e = await seed({ stage: "ATTENDED" });
    const eleven = Array.from({ length: 11 }, (_, i) => ({ title: `t${i}`, dueDate: null }));
    expect(await createFollowUps(t.handle(), e.id, eleven, NOW)).toEqual({ ok: false, error: "invalid" });
    expect(await createFollowUps(t.handle(), e.id, [], NOW)).toEqual({ ok: false, error: "invalid" });
    const m = await seed({ stage: "ATTENDED", isMock: true });
    expect(await createFollowUps(t.handle(), m.id, [{ title: "x", dueDate: null }], NOW)).toEqual({ ok: false, error: "mock" });
    const s = await seed({ stage: "SAVED" });
    expect(await createFollowUps(t.handle(), s.id, [{ title: "x", dueDate: null }], NOW)).toEqual({ ok: false, error: "changed" });
  });

  it("deleting the outreach event keeps the tasks with a null link", async () => {
    const e = await seed({ stage: "ATTENDED" });
    await createFollowUps(t.handle(), e.id, [{ title: "Keep me", dueDate: null }], NOW);
    await t.handle().delete(outreachEvents).where(eq(outreachEvents.id, e.id));
    const [task] = await t.handle().select().from(tasks);
    expect(task!.outreachEventId).toBeNull();
  });
});

describe("actions", () => {
  it("an invalid uuid is not_found without touching the DB; a valid move succeeds", async () => {
    expect(await moveStageAction("nope", null, "SAVED")).toEqual({ ok: false, error: "not_found" });
    expect(await t.handle().select().from(auditLog)).toHaveLength(0);
    const e = await seed();
    expect(await moveStageAction(e.id, null, "SAVED")).toEqual({ ok: true });
    expect((await get(e.id)).stage).toBe("SAVED");
    expect(await moveStageAction(e.id, "BOGUS" as never, "SAVED")).toEqual({ ok: false, error: "invalid" });
  });

  it("requires the owner", async () => {
    denied = true;
    const e = await seed();
    await expect(moveStageAction(e.id, null, "SAVED")).rejects.toThrow("redirect");
    await expect(addToCalendarAction(e.id, null)).rejects.toThrow("redirect");
    await expect(createFollowUpsAction(e.id, [{ title: "x", dueDate: null }])).rejects.toThrow("redirect");
  });

  it("follow-up action validates lines", async () => {
    const e = await seed({ stage: "ATTENDED" });
    expect(await createFollowUpsAction(e.id, [])).toEqual({ ok: false, error: "invalid" });
    expect(await createFollowUpsAction(e.id, [{ title: "", dueDate: null }])).toMatchObject({ ok: false, errors: { "lines.0.title": "Add a title." } });
    expect(await createFollowUpsAction(e.id, [{ title: "Ping", dueDate: "2026-10-22" }])).toEqual({ ok: true, count: 1 });
  });
});
