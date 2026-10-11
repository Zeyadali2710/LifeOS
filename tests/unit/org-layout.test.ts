import { describe, expect, it } from "vitest";
import { blockGeometry, earlierCount, packLanes, rangeLabel } from "@/organization/layout";

// 2026-10-08 is AEDT (+11)
const at = (d: string, hm: string) => new Date(`${d}T${hm}:00+11:00`).toISOString();

describe("blockGeometry", () => {
  it("places 18:00-20:30", () => {
    const g = blockGeometry(at("2026-10-08", "18:00"), at("2026-10-08", "20:30"), "2026-10-08")!;
    expect([g.top, g.height, g.timeLine]).toEqual([485, 107, "18:00–20:30"]);
  });
  it("min height 22 for 15 minutes", () => {
    expect(blockGeometry(at("2026-10-08", "10:00"), at("2026-10-08", "10:15"), "2026-10-08")!.height).toBe(22);
  });
  it("clips overnight events to each day", () => {
    const s = at("2026-10-08", "22:00");
    const e = at("2026-10-09", "02:00");
    const a = blockGeometry(s, e, "2026-10-08")!;
    expect([a.height, a.timeLine]).toEqual([2 * 44 - 3, "from 22:00"]);
    expect(blockGeometry(s, e, "2026-10-09")).toBeNull();
    expect(blockGeometry(s, e, "2026-10-09", 0)!.timeLine).toBe("→ 02:00");
  });
});

describe("packLanes", () => {
  const ev = (key: string, a: string, b: string) => ({ key, start: at("2026-10-08", a), end: at("2026-10-08", b) });
  it("packs clusters", () => {
    const r = packLanes([ev("A", "09:00", "11:00"), ev("B", "10:00", "12:00"), ev("C", "13:00", "14:00")]);
    expect(r).toEqual({ A: { lane: 0, lanes: 2 }, B: { lane: 1, lanes: 2 }, C: { lane: 0, lanes: 1 } });
  });
  it("three overlapping", () => {
    const r = packLanes([ev("A", "09:00", "12:00"), ev("B", "09:30", "12:00"), ev("C", "10:00", "12:00")]);
    expect([r.A!.lane, r.B!.lane, r.C!.lane, r.C!.lanes]).toEqual([0, 1, 2, 3]);
  });
});

describe("rangeLabel", () => {
  it("labels", () => {
    expect(rangeLabel("week", ["2026-10-05", "2026-10-06", "2026-10-11"])).toBe("5 – 11 Oct 2026");
    expect(rangeLabel("week", ["2026-09-28", "2026-10-04"])).toBe("28 Sep – 4 Oct 2026");
    expect(rangeLabel("day", "2026-10-07")).toBe("Wed 7 Oct");
    expect(rangeLabel("month", "2026-10-08")).toBe("October 2026");
  });
});

describe("earlierCount", () => {
  it("counts events ending by 07:00", () => {
    const d = "2026-10-08";
    const items = [
      { start: at(d, "05:00"), end: at(d, "06:00"), allDay: false },
      { start: at(d, "06:30"), end: at(d, "08:00"), allDay: false },
      { start: at(d, "08:00"), end: at(d, "09:00"), allDay: false },
    ];
    expect(earlierCount(items, d)).toBe(1);
  });
  it("counts an overnight event whose tail ends before 07:00 (WR-B02)", () => {
    const night = { start: at("2026-10-07", "22:00"), end: at("2026-10-08", "06:00"), allDay: false };
    expect(earlierCount([night], "2026-10-08")).toBe(1);
    expect(earlierCount([night], "2026-10-07")).toBe(0);
  });
});
