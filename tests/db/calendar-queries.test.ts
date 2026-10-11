import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calendarEvents, calendars, connections, settings, tasks } from "@/server/db/schema";
import { normalizeIcs } from "@/server/calendar/caldav/provider";
import { busyOf } from "@/server/calendar/conflicts";
import { freeSlots, wakingWindow } from "@/server/calendar/free-slots";
import {
  conflictsIn, freeSlotsOn, listEvents, loadInstances, loadTasks, organizationData, pickDefaultCalendar, viewRange, writableCalendars,
} from "@/server/calendar/queries";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const h = () => t.handle();
const NOW = new Date("2026-10-08T00:00:00Z"); // Thu 11:00 Sydney
// Thu 2026-10-08 Sydney (AEDT +11): HH:MM local -> instant
const at = (hh: number, mm = 0) => new Date(Date.UTC(2026, 9, 8, hh - 11, mm));
const ev = (calendarId: string, remoteId: string, title: string, s: Date, e: Date, extra: Partial<typeof calendarEvents.$inferInsert> = {}) =>
  ({ calendarId, remoteId, title, startAt: s, endAt: e, tz: "Australia/Sydney", raw: {}, ...extra }) as typeof calendarEvents.$inferInsert;

let main: string;
let reader: string;
let disabled: string;
let uncat: string;

describe("calendar queries", () => {
  it("seeds", async () => {
    await h().insert(connections).values({ id: "google_calendar", ciphertext: "x", last4: "abcd", lastSyncAt: NOW });
    const mk = (remoteId: string, v: Partial<typeof calendars.$inferInsert>) =>
      h().insert(calendars).values({ connectionId: "google_calendar", remoteId, name: remoteId, ...v }).returning();
    main = (await mk("main", { enabled: true, category: "work", access: "owner", isDefault: true, lastSyncedAt: NOW }))[0]!.id;
    reader = (await mk("reader", { enabled: true, category: "social", access: "reader" }))[0]!.id;
    disabled = (await mk("disabled", { enabled: false, category: "work" }))[0]!.id;
    uncat = (await mk("uncat", { enabled: true, category: null }))[0]!.id;
    await h().insert(calendarEvents).values([
      ev(main, "gym", "Gym", at(10), at(11)),
      ev(main, "gym2", "Gym class", at(10, 30), at(11, 30)),
      ev(main, "free", "Free thing", at(10), at(11), { transparency: "transparent" }),
      ev(main, "dec", "Declined", at(14), at(15), { declined: true }),
      ev(main, "tent", "Tentative", at(16), at(17), { status: "tentative" }),
      ev(reader, "ro", "Holiday", at(18), at(19)),
      ev(disabled, "d1", "Hidden", at(9), at(10)),
      ev(uncat, "u1", "Hidden2", at(9), at(10)),
      ev(main, "weekly", "Standup", at(9), at(9, 15), {
        recurrence: ["RRULE:FREQ=DAILY;COUNT=3", "EXDATE;TZID=Australia/Sydney:20261009T090000"],
      }),
    ]);
  });

  it("viewRange", () => {
    expect(viewRange("week", "2026-10-08").days).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(viewRange("day", "2026-10-08").days).toEqual(["2026-10-08"]);
    const m = viewRange("month", "2026-10-08");
    expect(m.days).toHaveLength(42);
    expect(m.days[0]).toBe("2026-09-28");
  });

  it("loadInstances flags and filters", async () => {
    const r = viewRange("day", "2026-10-08");
    const list = await loadInstances(h(), r.from, r.to);
    const titles = list.map((i) => i.title);
    expect(titles).not.toContain("Hidden");
    expect(titles).not.toContain("Hidden2");
    expect(titles).not.toContain("Declined");
    const by = (n: string) => list.find((i) => i.title === n)!;
    expect(by("Tentative").status).toBe("tentative");
    expect(by("Free thing").free).toBe(true);
    expect(by("Free thing").conflictWith).toEqual([]);
    expect(by("Gym").conflictWith).toEqual([by("Gym class").key]);
    expect(by("Holiday").readOnly).toBe(true);
    expect(by("Gym").readOnly).toBe(false);
    expect(titles).toContain("Standup");
  });

  it("recurring EXDATE is honoured", async () => {
    const r = viewRange("week", "2026-10-08");
    const days = (await loadInstances(h(), r.from, r.to)).filter((i) => i.title === "Standup").length;
    expect(days).toBe(2);
  });

  it("instances carry the raw RRULE so the edit dialog can parse it (CR-B01)", async () => {
    const r = viewRange("day", "2026-10-08");
    const s = (await loadInstances(h(), r.from, r.to)).find((i) => i.title === "Standup")!;
    expect(s.rrule).toBe("FREQ=DAILY;COUNT=3");
  });

  it("listEvents filters by title", async () => {
    const l = await listEvents(h(), "2026-10-05", "2026-10-11", "GYM");
    expect(l.map((i) => i.title).sort()).toEqual(["Gym", "Gym class"]);
  });

  it("freeSlotsOn equals freeSlots over busy", async () => {
    const r = viewRange("day", "2026-10-08");
    const busy = busyOf(
      (await loadInstances(h(), r.from, r.to)).map((i) => ({
        id: i.key, start: +new Date(i.start), end: +new Date(i.end), allDay: i.allDay,
        transparency: i.free ? ("transparent" as const) : ("opaque" as const), declined: i.declined, status: i.status,
      })),
    );
    expect(await freeSlotsOn(h(), "2026-10-08", 30, NOW)).toEqual(freeSlots(busy, wakingWindow("2026-10-08"), { now: +NOW, minMinutes: 30 }));
  });

  it("conflictsIn", async () => {
    const r = viewRange("day", "2026-10-08");
    const c = await conflictsIn(h(), r.from, r.to);
    expect(c).toHaveLength(1);
    expect([c[0]!.aTitle, c[0]!.bTitle]).toEqual(["Gym", "Gym class"]);
    expect(c[0]!.start).toBe(at(10, 30).toISOString());
    expect(c[0]!.end).toBe(at(11).toISOString());
  });

  it("writable + default", async () => {
    expect((await writableCalendars(h())).map((c) => c.id)).toEqual([main]);
    expect(await pickDefaultCalendar(h())).toBe(main);
    await h().insert(settings).values({ key: "calendar.last_used", value: reader });
    expect(await pickDefaultCalendar(h())).toBe(main); // reader not writable
    await h().delete(settings);
  });

  it("tasks + organizationData", async () => {
    await h().insert(tasks).values([
      { title: "Due today", dueDate: "2026-10-08", dueTime: "17:00", dueAt: at(17), priority: 1 },
      { title: "Overdue", dueDate: "2026-10-01", dueAt: new Date("2026-10-01T12:00:00Z") },
      { title: "Later", dueDate: "2026-10-20", dueAt: new Date("2026-10-20T12:00:00Z") },
      { title: "Done", completedAt: NOW },
    ]);
    expect((await loadTasks(h(), "today", NOW)).map((x) => x.title).sort()).toEqual(["Due today", "Overdue"]);
    expect(await loadTasks(h(), "open", NOW)).toHaveLength(3);
    expect((await loadTasks(h(), "completed", NOW)).map((x) => x.title)).toEqual(["Done"]);

    const d = await organizationData(h(), { view: "week", date: "2026-10-08", now: NOW });
    expect(d.state.connected).toBe(true);
    expect(d.state.stale).toBe(false);
    expect(d.header.lead).toMatch(/^Calendar, tasks and planning\. \d+ events this week · \d+ free hours · 1 conflict\.$/);
    expect(d.calendars.map((c) => c.id)).toEqual([main]);
    expect(d.defaultCalendarId).toBe(main);
    const due = d.plan.items.find((i) => i.title === "Due today")!;
    expect(due.id).toBe("plan:" + due.taskId + ":2026-10-08");
    expect(due.why).toMatch(/^Priority high, due today 17:00\.$/);
    expect(d.plan.items.find((i) => i.title === "Overdue")!.why).toContain("No free slot before it is due");

    const stale = await organizationData(h(), { view: "day", date: "2026-10-08", now: new Date(NOW.getTime() + 16 * 60000) });
    expect(stale.state.stale).toBe(true);
  });

  it("no connection branch", async () => {
    await h().delete(connections);
    const d = await organizationData(h(), { view: "week", date: "2026-10-08", now: NOW });
    expect(d.header.lead).toBe("Connect a calendar to see your week. Tasks work without one.");
    expect(d.header.headline).toBe("Your calendar, in one place.");
    expect(d.plan.tasksOnly).toBe(true);
  });
});

describe("loadInstances with CalDAV rows (IN-C01)", () => {
  it("bounds single CalDAV events by their stored range and still expands series", async () => {
    const fx = (n: string) => normalizeIcs(readFileSync(`tests/fixtures/calendar/${n}.ics`, "utf8"), `/cal/${n}.ics`, null);
    await h().insert(connections).values({ id: "icloud", ciphertext: "x", last4: "abcd" }).onConflictDoNothing();
    const [cal] = await h().insert(calendars).values({ connectionId: "icloud", remoteId: "/cal/", name: "iCloud", enabled: true, category: "personal" }).returning();
    await h().insert(calendarEvents).values(["icloud-floating", "icloud-allday", "icloud-recurring"].map((n) => ({ calendarId: cal!.id, ...fx(n) })));
    const titles = async (ymd: string) => (await loadInstances(h(), viewRange("day", ymd).from, viewRange("day", ymd).to)).map((i) => i.title);
    expect(await titles("2026-10-01")).toEqual(expect.arrayContaining(["Floating", "Standup"]));
    expect(await titles("2026-10-12")).toContain("Conference");
    const later = await titles("2026-10-22");
    expect(later).toContain("Standup");
    expect(later).not.toContain("Floating");
    expect(later).not.toContain("Conference");
  });
});
