import { describe, expect, it } from "vitest";
import { createGoogle } from "@/server/calendar/google/client";
import { createGoogleProvider, normalizeGoogleEvent } from "@/server/calendar/google/provider";
import type { CalendarRef, EventWrite, StoredEvent } from "@/server/calendar/types";
import events from "../fixtures/calendar/google-events.json";
import list from "../fixtures/calendar/google-calendar-list.json";
import { fakeGoogle, json } from "../helpers/fake-google";

type GE = Parameters<typeof normalizeGoogleEvent>[0];
const ref: CalendarRef = { id: "c1", connectionId: "google_calendar", remoteId: "me@gmail.com", access: "owner", syncCursor: null, ctag: null };
const window = { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-12-31T00:00:00Z") };
const EV = "/calendar/v3/calendars/me%40gmail.com/events";
const make = (routes: Parameters<typeof fakeGoogle>[0]) => {
  const f = fakeGoogle(routes);
  return { f, p: createGoogleProvider({ google: createGoogle({ getToken: async () => "tok", fetch: f }) }) };
};
const input: EventWrite = { title: "T", start: "2026-10-20T00:00:00.000Z", end: "2026-10-20T01:00:00.000Z", allDay: false, timeZone: "Australia/Sydney", location: "", description: "", showAs: "busy", repeat: "keep", marker: null };
const stored = (n: ReturnType<typeof normalizeGoogleEvent>): StoredEvent => ({ ...n, id: "row", calendarId: "c1" });
const [single, weekly] = (events.pages[0]!.items as unknown as GE[]).map((i) => stored(normalizeGoogleEvent(i)));

describe("google provider", () => {
  it("lists calendars", async () => {
    const { p } = make({ "GET /calendar/v3/users/me/calendarList": json(list) });
    const r = await p.listCalendars();
    expect(r.map((c) => [c.remoteId, c.access, c.kind])).toEqual([
      ["me@gmail.com", "owner", "primary"],
      ["family123@group.calendar.google.com", "owner", "owned"],
      ["en.australian#holiday@group.v.calendar.google.com", "reader", "holiday"],
      ["addressbook#contacts@group.v.calendar.google.com", "reader", "birthday"],
      ["team@example.com", "reader", "subscribed"],
      ["shared@example.com", "writer", "subscribed"],
    ]);
    expect(r[1]!.name).toBe("Family stuff");
  });

  it("normalises event shapes", () => {
    const by = Object.fromEntries((events.pages as unknown as { items: GE[] }[]).flatMap((p) => p.items).map((i) => [i.id, normalizeGoogleEvent(i)]));
    expect(by.single1).toMatchObject({ allDay: false, tz: "Australia/Sydney", title: "Dentist" });
    expect(by.single1!.startAt!.toISOString()).toBe("2026-10-13T22:00:00.000Z");
    expect(by.weekly1!.recurrence).toHaveLength(2);
    expect(by["weekly1_20261019T223000Z"]).toMatchObject({ recurringRemoteId: "weekly1", originalStart: "2026-10-18T22:30:00.000Z" });
    expect(by["weekly1_20261026T223000Z"]!.status).toBe("cancelled");
    expect(by.allday1).toMatchObject({ allDay: true, startDate: "2026-11-02", endDate: "2026-11-04", startAt: null });
    expect(by.declined1!.declined).toBe(true);
    expect(by.free1!.transparency).toBe("transparent");
    expect(by.single1!.declined).toBe(false);
  });

  it("full sync pages, filters, and never mixes timeMin with syncToken", async () => {
    const { p, f } = make({ [`GET ${EV}`]: [json(events.pages[0]), json(events.pages[1])] });
    const r = await p.sync(ref, window);
    expect(r.reset).toBe(true);
    expect(r.cursor).toBe("SYNC1");
    expect(r.deletes).toEqual(["gone1"]);
    expect(r.upserts.map((u) => u.remoteId)).toEqual(["single1", "weekly1", "weekly1_20261019T223000Z", "weekly1_20261026T223000Z", "allday1", "declined1", "free1"]);
    expect(f.calls[0]!.url).toContain("singleEvents=false&showDeleted=true&maxResults=250");
    expect(f.calls[0]!.url).not.toMatch(/timeMin|syncToken/);
    expect(f.calls[1]!.url).toContain("pageToken=PAGE2");
  });

  it("incremental sync sends syncToken only; 410 forces a full resync", async () => {
    const inc = make({ [`GET ${EV}`]: json({ items: [], nextSyncToken: "SYNC2" }) });
    const r = await inc.p.sync({ ...ref, syncCursor: "SYNC1" }, window);
    expect(r).toMatchObject({ reset: false, cursor: "SYNC2" });
    expect(inc.f.calls[0]!.url).toContain("syncToken=SYNC1");
    expect(inc.f.calls[0]!.url).not.toContain("timeMin");

    const gone = make({ [`GET ${EV}`]: [json({}, 410), json(events.pages[1])] });
    const g = await gone.p.sync({ ...ref, syncCursor: "OLD" }, window);
    expect(g.reset).toBe(true);
    expect(gone.f.calls[1]!.url).not.toContain("syncToken");
  });

  it("creates with sendUpdates=none, marker and deterministic id; 409 adopts", async () => {
    const created = { id: "lifeos0abc", etag: '"x"', summary: "T", start: { dateTime: "2026-10-20T11:00:00+11:00" }, end: { dateTime: "2026-10-20T12:00:00+11:00" } };
    const { p, f } = make({ [`POST ${EV}`]: json({}, 409), [`GET ${EV}/lifeos0abc`]: json(created) });
    const r = await p.create(ref, { ...input, repeat: "weekly", marker: "appr-1" }, { remoteId: "lifeos0abc" });
    expect(r.upserts[0]!.remoteId).toBe("lifeos0abc");
    const post = f.calls[0]!;
    expect(post.url).toContain("sendUpdates=none");
    expect(post.body).toMatchObject({ id: "lifeos0abc", extendedProperties: { private: { lifeosApproval: "appr-1" } }, start: { dateTime: input.start, timeZone: "Australia/Sydney" } });
    expect((post.body as { recurrence: string[] }).recurrence[0]).toMatch(/^RRULE:FREQ=WEEKLY/);
  });

  it("update uses If-Match; recurring scopes plan correctly; deletes are idempotent", async () => {
    const ok = { id: "single1", etag: '"n"', start: { dateTime: "2026-10-20T11:00:00+11:00" }, end: { dateTime: "2026-10-20T12:00:00+11:00" } };
    const a = make({ [`PATCH ${EV}/single1`]: json(ok) });
    await a.p.update(ref, single!, input, "all", null);
    expect(a.f.calls[0]!.headers.get("if-match")).toBe('"e-single1"');
    expect(a.f.calls[0]!.url).toContain("sendUpdates=none");

    const b = make({ [`PATCH ${EV}/weekly1`]: json({ ...ok, id: "weekly1" }), [`POST ${EV}`]: json({ ...ok, id: "new1" }) });
    const r = await b.p.update(ref, weekly!, input, "following", "2026-10-26T09:30:00+11:00");
    expect(b.f.calls.map((c) => c.method)).toEqual(["POST", "PATCH"]);
    expect(b.f.calls[1]!.headers.get("if-match")).toBe('"e-weekly1"');
    expect(b.f.calls[0]!.headers.get("if-match")).toBeNull();
    expect(r.upserts.map((u) => u.remoteId)).toEqual(["new1", "weekly1"]);

    const c = make({ [`DELETE ${EV}/single1`]: () => new Response(null, { status: 410 }) });
    expect(await c.p.remove(ref, single!, "all", null)).toEqual({ upserts: [], deletes: ["single1"] });

    const d = make({ [`DELETE ${EV}/weekly1_20261026T093000Z`]: () => new Response(null, { status: 204 }) });
    const rd = await d.p.remove(ref, weekly!, "this", "2026-10-26T09:30:00Z");
    expect(rd.upserts[0]).toMatchObject({ remoteId: "weekly1_20261026T093000Z", status: "cancelled", recurringRemoteId: "weekly1" });
    for (const call of [...a.f.calls, ...b.f.calls, ...c.f.calls, ...d.f.calls]) expect(call.url).toContain("sendUpdates=none");
  });

  it("following split creates the continuation first and removes it if truncating the master fails (CR-A02)", async () => {
    const ok = { id: "x", start: { dateTime: "2026-10-20T11:00:00+11:00" }, end: { dateTime: "2026-10-20T12:00:00+11:00" } };
    const { p, f } = make({
      [`POST ${EV}`]: json({ ...ok, id: "lifeosappr1f" }),
      [`PATCH ${EV}/weekly1`]: json({}, 503),
      [`DELETE ${EV}/lifeosappr1f`]: () => new Response(null, { status: 204 }),
    });
    await expect(p.update(ref, weekly!, { ...input, marker: "appr-1" }, "following", "2026-10-26T09:30:00+11:00")).rejects.toMatchObject({ kind: "unavailable" });
    expect(f.calls.map((c) => c.method)).toEqual(["POST", "PATCH", "DELETE"]);
    expect(f.calls[0]!.body).toMatchObject({ id: "lifeosappr1f" });

    // retry after a lost response: 409 adopts the continuation, then truncates
    const r = make({ [`POST ${EV}`]: json({}, 409), [`GET ${EV}/lifeosappr1f`]: json({ ...ok, id: "lifeosappr1f" }), [`PATCH ${EV}/weekly1`]: json({ ...ok, id: "weekly1" }) });
    const out = await r.p.update(ref, weekly!, { ...input, marker: "appr-1" }, "following", "2026-10-26T09:30:00+11:00");
    expect(out.upserts.map((u) => u.remoteId)).toEqual(["lifeosappr1f", "weekly1"]);
  });

  it("following on a COUNT series keeps the remaining COUNT; PATCH clears the other date field", async () => {
    const counted = { ...weekly!, recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=6"] };
    const ok = { id: "x", start: { dateTime: "2026-10-20T11:00:00+11:00" }, end: { dateTime: "2026-10-20T12:00:00+11:00" } };
    const { p, f } = make({ [`PATCH ${EV}/weekly1`]: json({ ...ok, id: "weekly1" }), [`POST ${EV}`]: json({ ...ok, id: "new1" }) });
    // weekly1 starts Mon 5 Oct; editing from 19 Oct leaves 2 occurrences before it.
    await p.update(ref, counted, input, "following", "2026-10-18T22:30:00.000Z");
    expect((f.calls[0]!.body as { recurrence: string[] }).recurrence).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4"]);
    expect(f.calls[1]!.body).toMatchObject({ recurrence: [expect.stringContaining("UNTIL=")] });

    const a = make({ [`PATCH ${EV}/single1`]: json({ ...ok, id: "single1" }) });
    await a.p.update(ref, single!, { ...input, allDay: true, start: "2026-10-20", end: "2026-10-21" }, "all", null);
    expect(a.f.calls[0]!.body).toMatchObject({ start: { date: "2026-10-20", dateTime: null }, end: { date: "2026-10-21", dateTime: null } });
  });
});
