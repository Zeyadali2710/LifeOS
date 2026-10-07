import { describe, expect, it } from "vitest";
import { healthFromActivity, mergeById, nextBackoff, parseSnapshot, unreadOf, wakeDelay } from "@/shell/live";
import type { ActivityDTO, NotificationDTO } from "@/lib/live-types";

const n = (id: string, readAt: string | null = null): NotificationDTO => ({
  id, category: "FYI", source: "s", title: "t", body: null, actionUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z", readAt, snoozedUntil: null,
});

describe("live helpers", () => {
  it("nextBackoff doubles to 30s cap", () => {
    const seq: number[] = [];
    let p = 0;
    for (let i = 0; i < 7; i++) seq.push((p = nextBackoff(p)));
    expect(seq).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });
  it("mergeById dedupes (incoming wins), sorts desc, limits", () => {
    const cur = [{ id: "a", at: "2026-01-01", v: 1 }, { id: "b", at: "2026-01-03", v: 1 }];
    const inc = [{ id: "a", at: "2026-01-02", v: 2 }, { id: "c", at: "2026-01-04", v: 2 }];
    expect(mergeById(cur, inc, "at", 10).map((x) => `${x.id}${x.v}`)).toEqual(["c2", "b1", "a2"]);
    expect(mergeById(cur, inc, "at", 2)).toHaveLength(2);
  });
  it("healthFromActivity", () => {
    const h = { status: "ok" } as unknown as NonNullable<ActivityDTO["health"]>;
    const a = { id: "1", at: "", type: "system.health_down", source: "", title: "", detail: null, tone: null, health: h };
    expect(healthFromActivity(a)).toBe(h);
    expect(healthFromActivity({ ...a, type: "other" })).toBeNull();
    expect(healthFromActivity({ ...a, health: null })).toBeNull();
  });
  it("unreadOf counts null readAt", () => {
    expect(unreadOf([n("1"), n("2", "x"), n("3")])).toBe(2);
  });
  it("wakeDelay", () => {
    expect(wakeDelay(null, 0)).toBeNull();
    expect(wakeDelay(new Date(1000).toISOString(), 0)).toBe(1500);
    expect(wakeDelay(new Date(0).toISOString(), 5000)).toBe(0);
    expect(wakeDelay(new Date(1e13).toISOString(), 0)).toBe(2147483647);
  });
  it("parseSnapshot", () => {
    expect(parseSnapshot({ items: [n("1")], unread: 1, nextWake: null })).toEqual({ items: [n("1")], unread: 1, nextWake: null });
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot({ items: [{}], unread: 1, nextWake: null })).toBeNull();
    expect(parseSnapshot({ items: [], unread: "x", nextWake: null })).toBeNull();
  });
});
