import { readFileSync } from "node:fs";
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { googlePlan, icsApply, icsCreate } from "@/server/calendar/recurrence-edit";
import type { EventWrite } from "@/server/calendar/types";

const recurring = readFileSync("tests/fixtures/calendar/icloud-recurring.ics", "utf8");
const parse = (s: string) => new ICAL.Component(ICAL.parse(s));
const vevents = (s: string) => parse(s).getAllSubcomponents("vevent");
const master = (s: string) => vevents(s).find((v) => !v.hasProperty("recurrence-id"))!;
const props = (s: string, n: string) => master(s).getAllProperties(n).map((p) => p.toICALString());

const input = (o: Partial<EventWrite> = {}): EventWrite => ({
  title: "Gym", start: "2026-10-22T07:00:00.000Z", end: "2026-10-22T08:00:00.000Z", allDay: false, timeZone: "Australia/Sydney",
  location: "", description: "", showAs: "busy", repeat: "weekly", marker: null, ...o,
});

describe("icsCreate", () => {
  it("builds a Sydney weekly event with marker", () => {
    // 18:00 AEST (+10, DST starts 4 Oct) is 08:00Z
    const ics = icsCreate("u1@lifeos", input({ start: "2026-10-01T08:00:00.000Z", end: "2026-10-01T09:00:00.000Z" }), "appr-1");
    const root = parse(ics);
    const v = master(ics);
    expect(v.getFirstPropertyValue("summary")).toBe("Gym");
    expect(v.getFirstProperty("dtstart")!.getParameter("tzid")).toBe("Australia/Sydney");
    expect(String(v.getFirstProperty("dtstart")!.jCal[3])).toBe("2026-10-01T18:00:00");
    expect(root.getAllSubcomponents("vtimezone")[0]!.getFirstPropertyValue("tzid")).toBe("Australia/Sydney");
    expect(String(v.getFirstPropertyValue("rrule"))).toBe("FREQ=WEEKLY;BYDAY=TH");
    expect(v.getFirstPropertyValue("x-lifeos-approval")).toBe("appr-1");
    expect(v.getFirstPropertyValue("transp")).toBe("OPAQUE");
    expect(root.getFirstPropertyValue("prodid")).toBe("-//LifeOS//EN");
  });

  it("is safe against CRLF injection", () => {
    const evil = "Hi\r\nATTENDEE:mailto:x@y";
    const ics = icsCreate("u2@lifeos", input({ title: evil, description: evil, repeat: "none" }), null);
    expect(master(ics).getFirstPropertyValue("summary")).toBe("Hi\nATTENDEE:mailto:x@y");
    expect(master(ics).hasProperty("attendee")).toBe(false);
    expect(ics).not.toMatch(/^ATTENDEE/m);
  });

  it("writes all-day events as DATE values", () => {
    const ics = icsCreate("u3@lifeos", input({ allDay: true, start: "2026-10-12", end: "2026-10-14", repeat: "none" }), null);
    expect([String(master(ics).getFirstProperty("dtstart")!.jCal[3]), String(master(ics).getFirstProperty("dtend")!.jCal[3])]).toEqual(["2026-10-12", "2026-10-14"]);
  });
});

describe("icsApply", () => {
  it("all/update keeps overrides, EXDATE, VALARM and X-APPLE props", () => {
    const { updated } = icsApply(recurring, { kind: "update", scope: "all", instanceStart: "2026-10-01T09:00:00.000Z", input: input({ title: "Renamed", repeat: "keep", start: "2026-09-30T23:00:00.000Z", end: "2026-10-01T00:00:00.000Z" }) });
    expect(master(updated!).getFirstPropertyValue("summary")).toBe("Renamed");
    expect(vevents(updated!)).toHaveLength(2);
    expect(props(updated!, "exdate")).toHaveLength(1);
    expect(master(updated!).getFirstSubcomponent("valarm")).toBeTruthy();
    expect(master(updated!).hasProperty("x-apple-travel-advisory-behavior")).toBe(true);
    expect(String(master(updated!).getFirstPropertyValue("rrule"))).toBe("FREQ=WEEKLY;BYDAY=TH");
  });

  it("this/update adds an override with RECURRENCE-ID", () => {
    const { updated } = icsApply(recurring, { kind: "update", scope: "this", instanceStart: "2026-10-21T22:00:00.000Z", input: input({ title: "Once", repeat: "keep" }) });
    const ov = vevents(updated!).find((v) => v.getFirstPropertyValue("summary") === "Once")!;
    const rid = ov.getFirstProperty("recurrence-id")!;
    expect(rid.getParameter("tzid")).toBe("Australia/Sydney");
    expect(String(rid.jCal[3])).toBe("2026-10-22T09:00:00");
    expect(String(ov.getFirstProperty("dtstart")!.jCal[3])).toBe("2026-10-22T18:00:00");
    expect(ov.hasProperty("rrule")).toBe(false);
  });

  it("this/delete adds EXDATE and removes the override", () => {
    const { updated } = icsApply(recurring, { kind: "delete", scope: "this", instanceStart: "2026-10-07T22:00:00.000Z" });
    expect(vevents(updated!)).toHaveLength(1);
    expect(props(updated!, "exdate").some((l) => l.includes("20261008T090000"))).toBe(true);
    const d = icsApply(recurring, { kind: "delete", scope: "this", instanceStart: "2026-10-21T22:00:00.000Z" });
    expect(props(d.updated!, "exdate").some((l) => l.includes("20261022T090000"))).toBe(true);
  });

  it("following/update ends the master and creates a new series", () => {
    const { updated, created } = icsApply(recurring, { kind: "update", scope: "following", instanceStart: "2026-10-21T22:00:00.000Z", newUid: "new@lifeos", input: input({ title: "Later", repeat: "keep" }) });
    const rule = String(master(updated!).getFirstPropertyValue("rrule"));
    expect(rule).toContain("UNTIL=20261021T215959Z");
    expect(rule).not.toContain("COUNT");
    expect(vevents(updated!)).toHaveLength(2); // override on 8 Oct is before the split
    const n = master(created!);
    expect(n.getFirstPropertyValue("uid")).toBe("new@lifeos");
    expect(n.getFirstPropertyValue("summary")).toBe("Later");
    expect(String(n.getFirstProperty("dtstart")!.jCal[3])).toBe("2026-10-22T18:00:00");
    expect(String(n.getFirstPropertyValue("rrule"))).toBe("FREQ=WEEKLY;BYDAY=TH");
    expect(vevents(created!)).toHaveLength(1);
    expect(n.hasProperty("exdate")).toBe(false);
  });

  it("UNTIL is the instance minus one second in UTC", () => {
    const ics = icsCreate("u4@lifeos", input({ start: "2026-10-15T23:00:00.000Z", end: "2026-10-16T00:00:00.000Z" }), null);
    const { updated } = icsApply(ics, { kind: "delete", scope: "following", instanceStart: "2026-10-21T23:00:00.000Z" });
    expect(String(master(updated!).getFirstPropertyValue("rrule"))).toContain("UNTIL=20261021T225959Z");
  });

  it("following converts COUNT for the new series", () => {
    const ics = icsCreate("u5@lifeos", input({ start: "2026-10-01T08:00:00.000Z", end: "2026-10-01T09:00:00.000Z" }), null)
      .replace("FREQ=WEEKLY;BYDAY=TH", "FREQ=WEEKLY;BYDAY=TH;COUNT=5");
    const { updated, created } = icsApply(ics, { kind: "update", scope: "following", instanceStart: "2026-10-14T23:00:00.000Z", input: input({ start: "2026-10-15T08:00:00.000Z", end: "2026-10-15T09:00:00.000Z", repeat: "keep" }) });
    expect(String(master(updated!).getFirstPropertyValue("rrule"))).not.toContain("COUNT");
    expect(String(master(created!).getFirstPropertyValue("rrule"))).toContain("COUNT=3");
  });

  it("following at the first occurrence behaves as all", () => {
    expect(icsApply(recurring, { kind: "delete", scope: "following", instanceStart: "2026-09-30T23:00:00.000Z" })).toEqual({ updated: null, created: null });
    const r = icsApply(recurring, { kind: "update", scope: "following", instanceStart: "2026-09-30T23:00:00.000Z", input: input({ title: "All", repeat: "keep" }) });
    expect(r.created).toBeNull();
    expect(master(r.updated!).getFirstPropertyValue("summary")).toBe("All");
  });

  it("all-day series use a DATE UNTIL", () => {
    const ics = icsCreate("u6@lifeos", input({ allDay: true, start: "2026-10-12", end: "2026-10-13", repeat: "daily" }), null);
    const { updated } = icsApply(ics, { kind: "delete", scope: "following", instanceStart: "2026-10-20" });
    expect(String(master(updated!).getFirstPropertyValue("rrule"))).toContain("UNTIL=20261019");
    expect(String(master(updated!).getFirstPropertyValue("rrule"))).not.toContain("UNTIL=20261019T");
  });

  it("all/delete deletes the resource", () => {
    expect(icsApply(recurring, { kind: "delete", scope: "all", instanceStart: null })).toEqual({ updated: null, created: null });
  });
});

describe("googlePlan", () => {
  const timed = { remoteId: "ev1", recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TH", "EXDATE;TZID=Australia/Sydney:20261015T090000"], allDay: false };
  const plan = (o: object) => googlePlan({ kind: "update", scope: "all", calendarRemoteId: "me@x.com", master: timed, instanceStart: "2026-10-21T22:00:00.000Z", body: { summary: "S" }, ...o });
  const root = "/calendars/me%40x.com/events";

  it("all and this", () => {
    expect(plan({})).toEqual([{ method: "PATCH", path: `${root}/ev1?sendUpdates=none`, body: { summary: "S" } }]);
    expect(plan({ scope: "this" })).toEqual([{ method: "PATCH", path: `${root}/ev1_20261021T220000Z?sendUpdates=none`, body: { summary: "S" } }]);
    expect(plan({ scope: "this", kind: "delete" })).toEqual([{ method: "DELETE", path: `${root}/ev1_20261021T220000Z?sendUpdates=none` }]);
    expect(plan({ kind: "delete" })).toEqual([{ method: "DELETE", path: `${root}/ev1?sendUpdates=none` }]);
  });

  it("following update patches master UNTIL and posts a new series", () => {
    const ops = plan({ scope: "following" });
    expect(ops[0]).toEqual({
      method: "PATCH", path: `${root}/ev1?sendUpdates=none`,
      body: { recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20261021T215959Z", "EXDATE;TZID=Australia/Sydney:20261015T090000"] },
    });
    expect(ops[1]).toEqual({ method: "POST", path: `${root}?sendUpdates=none`, body: { summary: "S", recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TH"] } });
    expect(plan({ scope: "following", kind: "delete" })).toHaveLength(1);
  });

  it("all-day instance ids use YYYYMMDD and UNTIL is a date", () => {
    const m = { remoteId: "ad", recurrence: ["RRULE:FREQ=DAILY;COUNT=10"], allDay: true };
    expect(plan({ master: m, scope: "this", instanceStart: "2026-10-22" })[0]!.path).toBe(`${root}/ad_20261022?sendUpdates=none`);
    const ops = plan({ master: { ...m, occurrencesBefore: 4 }, scope: "following", instanceStart: "2026-10-22" });
    expect(ops[0]!.body).toEqual({ recurrence: ["RRULE:FREQ=DAILY;UNTIL=20261021"] });
    expect(ops[1]!.body).toMatchObject({ recurrence: ["RRULE:FREQ=DAILY;COUNT=6"] });
  });
});
