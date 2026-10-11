import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { createCalendarSync, SYNC_WINDOW_DAYS } from "@/server/calendar/sync";
import type { NormalizedEvent } from "@/server/calendar/types";
import { calendarEvents, calendars, connections, settings } from "@/server/db/schema";
import { fakeCalendarProvider } from "../helpers/fake-calendar";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const NOW = new Date("2026-10-08T00:00:00Z"); // Thu 11:00 Sydney (AEDT)
const DAY = 86_400_000;
const hrs = (n: number) => new Date(NOW.getTime() + n * 3_600_000);

type Emitted = { a: { type: string; title: string; detail?: string; tone?: string }; n?: { category: string; title: string; body?: string; actionUrl?: string } };
let ev: Emitted[] = [];
const emit = (async (a: Emitted["a"], n?: Emitted["n"]) => {
  ev.push({ a, n });
  return null;
}) as never;

const event = (remoteId: string, title: string, startH: number, durH = 1, etag = "e1"): NormalizedEvent => ({
  remoteId, url: null, etag, title, description: "secret description", location: "secret place", startAt: hrs(startH), endAt: hrs(startH + durH), allDay: false,
  startDate: null, endDate: null, tz: "Australia/Sydney", recurrence: null, recurringRemoteId: null, originalStart: null, status: "confirmed", transparency: "opaque", declined: false, raw: {},
});

const remote = [
  { remoteId: "main", name: "Main", access: "owner" as const, kind: "primary" as const },
  { remoteId: "subs", name: "Subscribed", access: "reader" as const, kind: "subscribed" as const },
];

describe("calendar sync", () => {
  it("no connection -> not_connected and the provider factory is never called", async () => {
    const providerFor = vi.fn();
    const r = await createCalendarSync({ handle: t.handle(), providerFor, emit, now: () => NOW }).run();
    expect(r).toEqual({ google_calendar: { skipped: "not_connected" }, icloud_calendar: { skipped: "not_connected" } });
    expect(providerFor).not.toHaveBeenCalled();
  });

  it("first sync: window, only enabled+categorised calendars, silent, cursor saved", async () => {
    const h = t.handle();
    await h.insert(connections).values({ id: "google_calendar", ciphertext: "x", last4: "", login: "me@example.com" });
    const state = { calendars: remote, results: { main: { upserts: [event("a", "Standup", 5), event("b", "Gym", 5.5)], deletes: [], cursor: "c1", reset: true } } };
    const p = fakeCalendarProvider("google", state);
    const s = createCalendarSync({ handle: h, providerFor: async () => p, emit, now: () => NOW });
    expect((await s.run()).google_calendar).toEqual({ ok: true, changed: 2, calendars: 1 });
    expect(p.calls.sync).toHaveLength(1); // "subs" is not enabled/categorised
    const w = p.calls.sync[0]!.window;
    expect(w.from.getTime()).toBe(NOW.getTime() - SYNC_WINDOW_DAYS.back * DAY);
    expect(w.to.getTime()).toBe(NOW.getTime() + SYNC_WINDOW_DAYS.ahead * DAY);
    expect(ev).toEqual([]); // first sync silent
    expect(await h.select().from(calendarEvents)).toHaveLength(2);
    const [cal] = await h.select().from(calendars).where(eq(calendars.remoteId, "main"));
    expect(cal!.syncCursor).toBe("c1");
    expect(cal!.lastSyncedAt).toEqual(NOW);
    const [c] = await h.select().from(connections);
    expect(c!.lastSyncAt).toEqual(NOW);
    expect(c!.lastSyncError).toBeNull();
  });

  it("later sync: meaningful changes only, cursor passed back, unchanged etag silent", async () => {
    const h = t.handle();
    const state = {
      calendars: remote,
      results: {
        main: {
          upserts: [event("a", "Standup", 5), event("c", "Dentist", 30), event("d", "Far away", 24 * 20), event("e", "Soon", 48, 1)], // a unchanged
          deletes: ["b"],
          cursor: "c2",
          reset: false,
        },
      },
    };
    const p = fakeCalendarProvider("google", state);
    const s = createCalendarSync({ handle: h, providerFor: async () => p, emit, now: () => NOW });
    ev = [];
    expect((await s.run()).google_calendar).toMatchObject({ ok: true, changed: 4 });
    expect(p.calls.sync[0]!.ref.syncCursor).toBe("c1");
    const titles = ev.map((e) => `${e.a.title}|${e.a.detail}`);
    expect(titles).toContain("Event added|Dentist · Fri 9 Oct 17:00");
    expect(titles).toContain("Event added|Soon · Sat 10 Oct 11:00");
    expect(titles).toContain("Event cancelled|Gym · Thu 8 Oct 16:30");
    expect(titles.join()).not.toContain("Far away"); // beyond 7 days: silent
    expect(ev.at(-1)!.a).toMatchObject({ title: "Calendar synced", detail: "3 updates" });
    expect(JSON.stringify(ev)).not.toContain("secret");
    expect(await h.select().from(calendarEvents)).toHaveLength(4);

    ev = [];
    expect((await s.run()).google_calendar).toMatchObject({ ok: true, changed: 0 });
    expect(ev).toEqual([]); // unchanged etags
  });

  it("changed event emits Event changed; reset deletes rows not in the set", async () => {
    const h = t.handle();
    const state = { calendars: remote, results: { main: { upserts: [event("a", "Standup moved", 6, 1, "e2")], deletes: [], cursor: "c3", reset: true } } };
    const p = fakeCalendarProvider("google", state);
    ev = [];
    await createCalendarSync({ handle: h, providerFor: async () => p, emit, now: () => NOW }).run();
    expect(ev.map((e) => e.a.title)).toContain("Event changed");
    expect((await h.select().from(calendarEvents)).map((r) => r.remoteId)).toEqual(["a"]);
  });

  it("caps activity at 5 plus one summary", async () => {
    const h = t.handle();
    const ups = [1, 2, 3, 4, 5, 6, 7].map((i) => event(`m${i}`, `Meet ${i}`, 60 + i * 3));
    const p = fakeCalendarProvider("google", { calendars: remote, results: { main: { upserts: ups, deletes: [], cursor: "c4", reset: false } } });
    ev = [];
    await createCalendarSync({ handle: h, providerFor: async () => p, emit, now: () => NOW }).run();
    const acts = ev.filter((e) => e.a.type.startsWith("calendar.event"));
    expect(acts).toHaveLength(5);
    expect(ev.at(-1)!.a).toMatchObject({ title: "Calendar synced", detail: "7 updates" });
  });

  it("new conflict in 48h notifies once, pair deduped, old keys pruned", async () => {
    const h = t.handle();
    const seed = { stale: new Date(NOW.getTime() - 4 * DAY).toISOString() };
    await h.insert(settings).values({ key: "calendar.notified_conflicts", value: seed }).onConflictDoUpdate({ target: settings.key, set: { value: seed } });
    const first = { calendars: remote, results: { main: { upserts: [event("x1", "Alpha", 20), event("x2", "Beta", 20.5)], deletes: [], cursor: "c5", reset: false } } };
    const p = fakeCalendarProvider("google", first);
    ev = [];
    const s = createCalendarSync({ handle: h, providerFor: async () => p, emit, now: () => NOW });
    await s.run();
    const notes = ev.filter((e) => e.n?.title === "Schedule conflict");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.n).toMatchObject({ category: "IMPORTANT", body: "Alpha overlaps Beta on Fri 9 Oct 07:30.", actionUrl: expect.stringMatching(/^\/organization\?view=day&date=\d{4}-\d{2}-\d{2}$/) });
    expect(ev.find((e) => e.a.title === "Conflict found")!.a).toMatchObject({ tone: "red", detail: "Alpha overlaps Beta · Fri 9 Oct 07:30" });
    const [row] = await h.select().from(settings).where(eq(settings.key, "calendar.notified_conflicts"));
    expect(Object.keys(row!.value as object)).toHaveLength(1); // stale pruned

    ev = [];
    first.results.main = { upserts: [event("x3", "Gamma", 100)], deletes: [], cursor: "c6", reset: false };
    await s.run();
    expect(ev.filter((e) => e.n?.title === "Schedule conflict")).toEqual([]);
  });

  it("non-provider failure records a fixed message and never throws", async () => {
    const h = t.handle();
    const p = fakeCalendarProvider("google", { calendars: remote, results: {}, syncError: new Error("token=sekrit boom") });
    const r = await createCalendarSync({ handle: h, providerFor: async () => p, emit, now: () => NOW }).run();
    expect(r.google_calendar).toEqual({ error: "other" });
    const [c] = await h.select().from(connections);
    expect(c!.lastSyncError).toBe("Sync failed. Retrying in 5 minutes.");
  });
});
