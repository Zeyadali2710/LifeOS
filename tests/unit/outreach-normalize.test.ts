import { describe, expect, it } from "vitest";
import { canonTitle, canonUrl, inWindow, minuteKey, sameEvent, sydneyCheck } from "@/server/outreach/normalize";

const d = (s: string) => new Date(s);
describe("normalize", () => {
  it("canonUrl", () => {
    expect(canonUrl("https://Lu.ma/Event/AbC?utm=1#x")).toBe("https://lu.ma/event/abc");
    expect(canonUrl("https://lu.ma/e/")).toBe("https://lu.ma/e");
    expect(canonUrl("nope")).toBeNull();
  });
  it("canonTitle", () => {
    expect(canonTitle("  AI & Startups: Demo-Night!! ")).toBe("ai startups demo night");
  });
  it("minuteKey drops seconds", () => {
    expect(minuteKey(d("2026-11-01T10:00:45.123Z"))).toBe("2026-11-01T10:00:00.000Z");
  });
  it("sameEvent: url + minute", () => {
    const a = { url: "https://x.com/e?a=1", title: "A", startAt: d("2026-11-01T10:00:10Z") };
    expect(sameEvent(a, { url: "https://x.com/e/", title: "B", startAt: d("2026-11-01T10:00:50Z") })).toBe(true);
  });
  it("sameEvent: weekly occurrences sharing a URL do not collapse", () => {
    const a = { url: "https://x.com/e", title: "Weekly", startAt: d("2026-11-01T10:00:00Z") };
    expect(sameEvent(a, { ...a, startAt: d("2026-11-08T10:00:00Z") })).toBe(false);
  });
  it("sameEvent: title + minute across urls", () => {
    const a = { url: "https://a.com/1", title: "Demo Night!", startAt: d("2026-11-01T10:00:00Z") };
    expect(sameEvent(a, { url: "https://b.com/2", title: "demo night", startAt: d("2026-11-01T10:00:00Z") })).toBe(true);
    expect(sameEvent(a, { url: "https://b.com/2", title: "other", startAt: d("2026-11-01T10:00:00Z") })).toBe(false);
  });
  it("sydneyCheck geo", () => {
    expect(sydneyCheck({ lat: -37.81, lng: 144.96 }).keep).toBe(false);
    expect(sydneyCheck({ lat: -33.9, lng: 151.2 }).keep).toBe(true);
  });
  it("sydneyCheck text", () => {
    expect(sydneyCheck({ location: "Fishburners" }).keep).toBe(true);
    expect(sydneyCheck({ location: "Melbourne VIC" }).keep).toBe(false);
    expect(sydneyCheck({ location: "Melbourne St, Sydney NSW" }).keep).toBe(true);
    expect(sydneyCheck({ location: "Come act now" }).keep).toBe(true);
  });
  it("sydneyCheck online / unknown tags", () => {
    expect(sydneyCheck({ online: true })).toEqual({ keep: true, tag: "online" });
    expect(sydneyCheck({ location: null })).toEqual({ keep: true, tag: "unknown" });
  });
  it("inWindow", () => {
    const now = d("2026-10-14T00:00:00Z");
    expect(inWindow({ startAt: d("2026-10-13T00:00:00Z"), endAt: null }, now)).toBe(false);
    expect(inWindow({ startAt: d("2026-10-13T23:00:00Z"), endAt: d("2026-10-14T01:00:00Z") }, now)).toBe(true);
    expect(inWindow({ startAt: d("2026-12-20T00:00:00Z"), endAt: null }, now)).toBe(false);
    expect(inWindow({ startAt: d("2026-11-20T00:00:00Z"), endAt: null }, now)).toBe(true);
  });
});
