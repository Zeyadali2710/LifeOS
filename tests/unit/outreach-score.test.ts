import { describe, expect, it } from "vitest";
import type { SchedItem } from "@/server/calendar/conflicts";
import { projectKeywords, scoreEvent } from "@/server/outreach/score";

// Thu 2026-11-05 19:00 Sydney (AEDT +11)
const start = new Date("2026-11-05T19:00:00+11:00");
const ev = (o: Partial<Parameters<typeof scoreEvent>[0]> = {}) => ({ title: "x", description: "", categories: [], startAt: start, endAt: new Date(start.getTime() + 2 * 3600000), allDay: false, ...o });
const ctx = (o: Partial<Parameters<typeof scoreEvent>[1]> = {}) => ({ interests: [], projects: [], busy: [] as SchedItem[], ...o });
const item = (o: Partial<SchedItem> = {}): SchedItem => ({ id: "i", start: start.getTime(), end: start.getTime() + 3600000, allDay: false, transparency: "opaque", declined: false, status: "confirmed", ...o });
const sig = (r: ReturnType<typeof scoreEvent>, l: string) => r.signals.find((s) => s.label === l)!;

describe("scoreEvent", () => {
  it("interests: title/category 25, description 12, cap 60", () => {
    const r = scoreEvent(ev({ title: "AI security night", categories: ["Cybersecurity"] }), ctx({ interests: ["AI", "Cybersecurity"] }));
    expect(sig(r, "INTERESTS")).toMatchObject({ value: 50, terms: ["AI", "Cybersecurity"] });
    expect(sig(scoreEvent(ev({ description: "about AI" }), ctx({ interests: ["AI"] })), "INTERESTS").value).toBe(12);
    const many = scoreEvent(ev({ title: "a b c" }), ctx({ interests: ["a", "b", "c"] }));
    expect(sig(many, "INTERESTS").value).toBe(60);
  });
  it("word boundary and regex escaping", () => {
    expect(sig(scoreEvent(ev({ title: "maintain" }), ctx({ interests: ["AI"] })), "INTERESTS").value).toBe(0);
    expect(sig(scoreEvent(ev({ title: "C++ meetup" }), ctx({ interests: ["C++"] })), "INTERESTS").value).toBe(25);
    expect(() => scoreEvent(ev(), ctx({ interests: ["(a+)+$", "[", "\\"] }))).not.toThrow();
  });
  it("projects by name, ignores short names, caps at 20", () => {
    const p = [{ name: "Sentinel", category: "Security", keywords: [] }, { name: "ab", category: "Personal", keywords: [] }];
    const r = scoreEvent(ev({ description: "Sentinel talk" }), ctx({ projects: p }));
    expect(sig(r, "PROJECTS")).toMatchObject({ value: 10, terms: ["project Sentinel"] });
    const three = ["Alpha", "Bravo", "Delta"].map((name) => ({ name, category: "x", keywords: [] }));
    expect(sig(scoreEvent(ev({ title: "Alpha Bravo Delta" }), ctx({ projects: three })), "PROJECTS").value).toBe(20);
  });
  it("projects by category label or keyword, once each", () => {
    const r = scoreEvent(ev({ title: "Fintech payments" }), ctx({ projects: [{ name: "Ledger", category: "Fintech", keywords: ["payments"] }] }));
    expect(sig(r, "PROJECTS")).toMatchObject({ value: 10, terms: ["project Ledger", "Fintech"] });
  });
  it("schedule", () => {
    expect(sig(scoreEvent(ev(), ctx({ busy: null })), "SCHEDULE")).toMatchObject({ value: 10, note: "calendar not connected" });
    expect(sig(scoreEvent(ev(), ctx({ busy: [item()] })), "SCHEDULE")).toMatchObject({ value: 0, note: "conflicts with your calendar" });
    expect(sig(scoreEvent(ev(), ctx({ busy: [item({ transparency: "transparent" })] })), "SCHEDULE")).toMatchObject({ value: 10, note: "overlaps an optional event" });
    expect(sig(scoreEvent(ev(), ctx({ busy: [item({ status: "tentative" })] })), "SCHEDULE").value).toBe(10);
    expect(sig(scoreEvent(ev(), ctx({ busy: [item({ allDay: true })] })), "SCHEDULE")).toMatchObject({ value: 20, note: "fits your Thursday evening" });
  });
  it("why line and total", () => {
    const r = scoreEvent(
      ev({ title: "AI cybersecurity Sentinel" }),
      ctx({ interests: ["AI", "Cybersecurity"], projects: [{ name: "Sentinel", category: "x", keywords: [] }] }),
    );
    expect(r.why).toBe("Matches AI, cybersecurity · fits your Thursday evening · related to project Sentinel");
    expect(r.score).toBe(50 + 10 + 20);
    expect(scoreEvent(ev(), ctx()).why).toBe("fits your Thursday evening");
  });
});

describe("projectKeywords", () => {
  it("distinct, stopworded, capped, ordered", () => {
    expect(projectKeywords("## Goals\nBuild a payments API for the payments team with Stripe")).toEqual(["goals", "payments", "stripe"]);
    expect(projectKeywords(Array.from({ length: 40 }, (_, i) => `word${i}`).join(" "))).toHaveLength(20);
  });
});
