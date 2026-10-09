import { describe, expect, it } from "vitest";
import { busyOf, conflicts, type SchedItem } from "@/server/calendar/conflicts";
import { addDaysYmd, freeSlots, sydneyYmd, wakingWindow } from "@/server/calendar/free-slots";
import { sydneyInstant } from "@/server/time";

const H = 3600000;
const t = (h: number) => 1_000_000_000_000 + h * H;
const it_ = (id: string, s: number, e: number, o: Partial<SchedItem> = {}): SchedItem => ({
  id, start: t(s), end: t(e), allDay: false, transparency: "opaque", declined: false, status: "confirmed", ...o,
});
const iso = (n: number) => new Date(n).toISOString();
const at = (y: number, m: number, d: number, h: number, min = 0) => sydneyInstant(y, m, d, h, min).getTime();

describe("conflicts", () => {
  it("touching events do not conflict", () => {
    expect(conflicts(busyOf([it_("a", 9, 10), it_("b", 10, 11)]))).toEqual([]);
  });
  it("overlap yields one pair with the shared window", () => {
    expect(conflicts(busyOf([it_("a", 9, 11), it_("b", 10, 12)]))).toEqual([{ a: "a", b: "b", start: t(10), end: t(11) }]);
  });
  it("nested yields one pair", () => {
    expect(conflicts(busyOf([it_("a", 9, 12), it_("b", 10, 11)]))).toEqual([{ a: "a", b: "b", start: t(10), end: t(11) }]);
  });
  it("three-way overlap yields three pairs", () => {
    expect(conflicts(busyOf([it_("a", 9, 12), it_("b", 10, 12), it_("c", 11, 12)]))).toHaveLength(3);
  });
  it("ignores all-day, transparent, declined, cancelled; tentative is busy", () => {
    const base = it_("a", 9, 11);
    for (const o of [{ allDay: true }, { transparency: "transparent" as const }, { declined: true }, { status: "cancelled" as const }]) {
      expect(conflicts(busyOf([base, it_("b", 10, 12, o)]))).toEqual([]);
    }
    expect(conflicts(busyOf([base, it_("b", 10, 12, { status: "tentative" })]))).toHaveLength(1);
  });
});

describe("free slots", () => {
  const w = () => wakingWindow("2026-10-08");
  it("empty day is one 08:00-22:00 slot", () => {
    expect(freeSlots([], w())).toEqual([{ start: at(2026, 10, 8, 8), end: at(2026, 10, 8, 22) }]);
  });
  it("rounds slot start up to 15 minutes", () => {
    const s = freeSlots([{ start: at(2026, 10, 8, 12), end: at(2026, 10, 8, 13, 10) }], w());
    expect(s).toEqual([
      { start: at(2026, 10, 8, 8), end: at(2026, 10, 8, 12) },
      { start: at(2026, 10, 8, 13, 15), end: at(2026, 10, 8, 22) },
    ]);
  });
  it("clips to now rounded up", () => {
    const s = freeSlots([], w(), { now: at(2026, 10, 8, 14, 7) });
    expect(s[0]!.start).toBe(at(2026, 10, 8, 14, 15));
  });
  it("drops past day entirely and short slots", () => {
    expect(freeSlots([], w(), { now: at(2026, 10, 8, 23) })).toEqual([]);
    expect(freeSlots([{ start: at(2026, 10, 8, 8, 10), end: at(2026, 10, 8, 22) }], w())).toEqual([]);
  });
  it("DST start day 2026-10-04", () => {
    const x = wakingWindow("2026-10-04");
    expect(iso(x.start)).toBe("2026-10-03T21:00:00.000Z");
    expect(iso(x.end)).toBe("2026-10-04T11:00:00.000Z");
    expect(sydneyInstant(2026, 10, 4, 9).toISOString()).toBe("2026-10-03T22:00:00.000Z");
    expect((x.end - x.start) / H).toBe(14);
  });
  it("DST end day 2027-04-04", () => {
    const x = wakingWindow("2027-04-04");
    expect(iso(x.start)).toBe("2027-04-03T22:00:00.000Z");
    expect(iso(x.end)).toBe("2027-04-04T12:00:00.000Z");
  });
  it("ymd helpers", () => {
    expect(sydneyYmd(new Date("2026-10-03T20:00:00Z"))).toBe("2026-10-04");
    expect(addDaysYmd("2026-10-04", 1)).toBe("2026-10-05");
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
  });
});
