import { describe, expect, it } from "vitest";
import {
  dateLabel, formatHM, greeting, groupNotifications, notificationGroup, relativeTime,
  snoozePresets, snoozeToast, sydneyInstant, tzLabel,
} from "@/server/time";

const d = (s: string) => new Date(s);

describe("sydneyInstant", () => {
  it("is DST-correct", () => {
    expect(sydneyInstant(2026, 10, 4, 9).toISOString()).toBe("2026-10-03T22:00:00.000Z");
    expect(sydneyInstant(2026, 10, 3, 18).toISOString()).toBe("2026-10-03T08:00:00.000Z");
    expect(sydneyInstant(2026, 4, 5, 9).toISOString()).toBe("2026-04-04T23:00:00.000Z");
  });
});

describe("snoozePresets", () => {
  it("omits Tonight after 18:00", () => {
    const p = snoozePresets(d("2026-10-03T12:00:00Z"));
    expect(p.map((x) => x.key)).toEqual(["hour", "tomorrow"]);
    expect(p[1].until.toISOString()).toBe("2026-10-03T22:00:00.000Z");
    expect(p[1].hint).toBe("Sun 09:00");
  });
  it("offers all three at noon", () => {
    const now = d("2026-10-07T01:00:00Z");
    const p = snoozePresets(now);
    expect(p.map((x) => x.key)).toEqual(["hour", "tonight", "tomorrow"]);
    expect(p[0].until.getTime()).toBe(now.getTime() + 3600000);
    expect(p[0].hint).toBe("13:00");
    expect(p[1].until.toISOString()).toBe("2026-10-07T07:00:00.000Z");
    expect(p[1].hint).toBe("18:00");
    expect(p[2].until.toISOString()).toBe("2026-10-07T22:00:00.000Z");
  });
  it("rolls over the month", () => {
    const p = snoozePresets(d("2026-10-31T10:00:00Z"));
    expect(p.at(-1)!.until.toISOString()).toBe("2026-10-31T22:00:00.000Z");
  });
});

describe("snoozeToast", () => {
  it("same day vs next day", () => {
    const now = d("2026-10-07T01:00:00Z");
    expect(snoozeToast(d("2026-10-07T07:00:00Z"), now)).toBe("Snoozed until 18:00");
    expect(snoozeToast(d("2026-10-07T22:00:00Z"), now)).toBe("Snoozed until tomorrow 09:00");
  });
});

describe("greeting / labels", () => {
  it("greets by Sydney hour", () => {
    expect(greeting(d("2026-10-07T00:59:00Z"))).toBe("Good morning");
    expect(greeting(d("2026-10-07T01:00:00Z"))).toBe("Good afternoon");
    expect(greeting(d("2026-10-07T07:00:00Z"))).toBe("Good evening");
    expect(greeting(d("2026-10-06T14:00:00Z"))).toBe("Good morning");
  });
  it("formats date, time, zone", () => {
    expect(dateLabel(d("2026-10-07T01:00:00Z"))).toBe("WEDNESDAY, OCTOBER 7");
    expect(formatHM(d("2026-10-06T13:30:00Z"))).toBe("00:30");
    expect(tzLabel(d("2026-10-07T01:00:00Z"))).toBe("AEDT");
    expect(tzLabel(d("2026-07-07T01:00:00Z"))).toBe("AEST");
  });
});

describe("grouping", () => {
  const now = d("2026-10-07T04:00:00Z"); // 15:00 Sydney
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const n = (createdAt: string, readAt: string | null, category: string) => ({ createdAt, readAt, category });
  it("classifies", () => {
    expect(notificationGroup(n(ago(3 * 3600000), null, "URGENT"), now)).toBe("NOW");
    expect(notificationGroup(n(ago(1800000), "x", "FYI"), now)).toBe("NOW");
    expect(notificationGroup(n(ago(3 * 3600000), "x", "FYI"), now)).toBe("TODAY");
    expect(notificationGroup(n(ago(24 * 3600000), "x", "FYI"), now)).toBe("EARLIER");
  });
  it("omits empty groups and keeps order", () => {
    const items = [n(ago(24 * 3600000), "x", "FYI"), n(ago(1800000), "x", "FYI")];
    expect(groupNotifications(items, now).map((g) => g.group)).toEqual(["NOW", "EARLIER"]);
  });
});

describe("relativeTime", () => {
  const now = d("2026-10-07T04:00:00Z");
  it("formats by age", () => {
    expect(relativeTime(d("2026-10-07T02:30:00Z"), now)).toBe("13:30");
    expect(relativeTime(d("2026-10-04T04:00:00Z"), now)).toBe("Sun");
    expect(relativeTime(d("2026-09-27T04:00:00Z"), now)).toMatch(/^27 Sep/);
  });
});
