import { describe, expect, it } from "vitest";
import { applySnapshot, healthFromActivity, isActivity, isNotification, mergeById, nextBackoff, parseSnapshot, restoreItem, unreadOf, wakeDelay } from "@/shell/live";
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
  it("wire guards drop frames that would crash render", () => {
    expect(isNotification(n("1"))).toBe(true);
    expect(isNotification({ ...n("1"), category: "NEW_KIND" })).toBe(false);
    expect(parseSnapshot({ items: [{ ...n("1"), category: "NEW_KIND" }], unread: 1, nextWake: null })).toBeNull();
    const a = { id: "1", at: "t", type: "x", source: "auth", title: "t", detail: null, tone: null, health: null };
    expect(isActivity(a)).toBe(true);
    expect(isActivity({ ...a, tone: "green", health: { status: "ok", db: "ok", worker: "ok", version: "1" } })).toBe(true);
    expect(isActivity({ ...a, source: undefined })).toBe(false);
    expect(isActivity({ ...a, tone: "purple" })).toBe(false);
    expect(isActivity({ ...a, health: {} })).toBe(false);
    expect(isActivity(null)).toBe(false);
  });
  it("applySnapshot replaces known items but keeps SSE arrivals made during the fetch", () => {
    const at = (id: string, t: string) => ({ ...n(id), createdAt: t });
    const cur = [at("new", "2026-01-03T00:00:00.000Z"), at("gone", "2026-01-02T00:00:00.000Z"), at("a", "2026-01-01T00:00:00.000Z")];
    const snap = [{ ...at("a", "2026-01-01T00:00:00.000Z"), readAt: "r" }];
    const out = applySnapshot(cur, snap, new Set(["gone", "a"]));
    expect(out.map((i) => i.id)).toEqual(["new", "a"]);
    expect(out[1]?.readAt).toBe("r");
    expect(applySnapshot([], [], new Set())).toEqual([]);
  });
  it("restoreItem undoes one item and keeps the rest", () => {
    const at = (id: string, t: string) => ({ ...n(id), createdAt: t });
    const orig = at("b", "2026-01-02T00:00:00.000Z");
    const cur = [at("c", "2026-01-03T00:00:00.000Z"), at("a", "2026-01-01T00:00:00.000Z")]; // b dismissed, c arrived since
    expect(restoreItem(cur, orig).map((i) => i.id)).toEqual(["c", "b", "a"]);
    expect(restoreItem([{ ...orig, readAt: "x" }], orig)).toEqual([orig]);
  });
});
