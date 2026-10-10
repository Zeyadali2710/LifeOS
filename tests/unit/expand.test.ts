import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { expand, humanRule, zonedInstant } from "@/server/calendar/expand";
import type { StoredEvent } from "@/server/calendar/types";

const fx = (n: string) => readFileSync(`tests/fixtures/calendar/${n}`, "utf8");
const row = (o: Partial<StoredEvent>): StoredEvent => ({
  id: "e1", calendarId: "c1", remoteId: "r1", url: null, etag: null, title: "T", description: null, location: null,
  startAt: null, endAt: null, allDay: false, startDate: null, endDate: null, tz: "Australia/Sydney", recurrence: null,
  recurringRemoteId: null, originalStart: null, status: "confirmed", transparency: "opaque", declined: false, raw: {}, ...o,
});
const ics = (n: string) => row({ raw: { ics: fx(n) }, tz: null });
const from = new Date("2026-09-28T00:00:00Z");
const to = new Date("2026-10-19T00:00:00Z");
const starts = (r: ReturnType<typeof expand>) => r.map((i) => i.start.toISOString());

describe("zonedInstant", () => {
  it("handles DST and falls back to Sydney for bad zones", () => {
    expect(zonedInstant("Australia/Sydney", 2026, 10, 1, 9, 0).toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(zonedInstant("Nope/Zone", 2026, 10, 8, 9, 0).toISOString()).toBe("2026-10-07T22:00:00.000Z");
  });
});

describe("expand ICS", () => {
  it("weekly series is DST-correct with EXDATE and RECURRENCE-ID override", () => {
    const r = expand([ics("icloud-recurring.ics")], from, to);
    expect(starts(r)).toEqual(["2026-09-30T23:00:00.000Z", "2026-10-07T23:30:00.000Z"]);
    expect(r[1]!.title).toBe("Standup (moved)");
    expect(r[1]!.instanceStart).toBe("2026-10-07T22:00:00.000Z");
    expect(r[0]!.instanceStart).toBe("2026-09-30T23:00:00.000Z");
    expect(r[0]!.end.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("without the override the 8th is 2026-10-07T22:00:00.000Z", () => {
    const text = fx("icloud-recurring.ics");
    const noOverride = text.slice(0, text.indexOf("BEGIN:VEVENT", text.indexOf("BEGIN:VEVENT") + 5)) + "END:VCALENDAR\r\n";
    expect(starts(expand([row({ raw: { ics: noOverride } })], from, to))).toEqual(["2026-09-30T23:00:00.000Z", "2026-10-07T22:00:00.000Z"]);
  });

  it("floating DTSTART is Sydney", () => {
    expect(starts(expand([ics("icloud-floating.ics")], from, to))).toEqual(["2026-09-30T23:00:00.000Z"]);
  });

  it("all-day keeps dates, end exclusive", () => {
    const [i] = expand([ics("icloud-allday.ics")], from, to);
    expect([i!.allDay, i!.startDate, i!.endDate]).toEqual([true, "2026-10-12", "2026-10-14"]);
  });

  it("Windows TZID expands via the VTIMEZONE", () => {
    const r = expand([ics("icloud-windows-tz.ics")], from, new Date("2026-12-01T00:00:00Z"));
    expect(starts(r)).toEqual(["2026-09-30T23:00:00.000Z", "2026-10-07T22:00:00.000Z", "2026-10-14T22:00:00.000Z"]);
  });

  it("skips bad resources", () => {
    expect(expand([row({ raw: { ics: "garbage" } })], from, to)).toEqual([]);
  });
});

describe("expand Google rows", () => {
  const master = row({
    remoteId: "m1", startAt: new Date("2026-09-30T23:00:00Z"), endAt: new Date("2026-10-01T00:00:00Z"),
    recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TH", "EXDATE;TZID=Australia/Sydney:20261015T090000"],
  });
  const ov = (o: Partial<StoredEvent>) => row({ id: "o1", remoteId: "m1_x", recurringRemoteId: "m1", originalStart: "2026-10-07T22:00:00.000Z", ...o });

  it("applies EXDATE", () => {
    expect(starts(expand([master], from, to))).toEqual(["2026-09-30T23:00:00.000Z", "2026-10-07T22:00:00.000Z"]);
  });
  it("cancelled override removes an instance", () => {
    expect(starts(expand([master, ov({ status: "cancelled" })], from, to))).toEqual(["2026-09-30T23:00:00.000Z"]);
  });
  it("non-cancelled override replaces it", () => {
    const r = expand([master, ov({ title: "Moved", startAt: new Date("2026-10-07T23:30:00Z"), endAt: new Date("2026-10-08T00:30:00Z") })], from, to);
    expect(r.map((i) => i.title)).toEqual(["T", "Moved"]);
    expect(r[1]!.start.toISOString()).toBe("2026-10-07T23:30:00.000Z");
    expect(r[1]!.instanceStart).toBe("2026-10-07T22:00:00.000Z");
  });
  it("caps runaway series and bounds by window", () => {
    const daily = row({ startAt: new Date("2000-01-01T00:00:00Z"), endAt: new Date("2000-01-01T01:00:00Z"), recurrence: ["RRULE:FREQ=DAILY"] });
    expect(expand([daily], new Date("2026-01-01"), new Date("2026-02-01")).length).toBe(0); // beyond cap, documented ceiling
    expect(expand([daily], new Date("2000-01-10"), new Date("2000-01-13")).length).toBe(3);
  });
});

describe("humanRule", () => {
  it("describes common rules", () => {
    expect(humanRule("FREQ=WEEKLY;BYDAY=TH")).toBe("Repeats weekly on Thursday");
    expect(humanRule("FREQ=DAILY")).toBe("Repeats daily");
    expect(humanRule("FREQ=MONTHLY;BYMONTHDAY=8")).toBe("Repeats monthly on day 8");
    expect(humanRule("FREQ=YEARLY")).toBe("Repeats yearly");
    expect(humanRule("FREQ=HOURLY")).toBe("Repeats");
  });
});
