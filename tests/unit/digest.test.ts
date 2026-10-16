import { describe, expect, it } from "vitest";
import { composeBriefing, DEFAULT_SCHEDULE, dueBriefings, periodKey, rankPriorities, type Digest } from "@/lib/digest";

const base: Digest = {
  today: "2026-10-15", generatedAt: "2026-10-15T02:00:00.000Z", calendarConnected: true,
  events: [{ title: "Standup", start: "2026-10-14T22:00:00.000Z", end: "2026-10-14T22:15:00.000Z", allDay: false, calendar: "Work" }, { title: "Demo", start: "2026-10-15T06:00:00.000Z", end: "2026-10-15T07:00:00.000Z", allDay: false, calendar: "Work" }],
  conflicts: [], tasks: [], doneToday: [], approvalsWaiting: 0, importantMail: [], outreach: [], goals: [], overBudget: [], ciFailures: [],
  upcoming: [{ day: "2026-10-16", events: [{ title: "Gym", start: "2026-10-16T08:00:00.000Z", end: "2026-10-16T09:00:00.000Z", allDay: false, calendar: "Personal" }] }],
  backup: null,
};

describe("digest rules", () => {
  it("ranks priorities with fixed weights and caps the list", () => {
    const d: Digest = {
      ...base,
      approvalsWaiting: 2,
      tasks: [
        { id: "t1", title: "Low today", dueAt: null, priority: 3, overdue: false, projectId: null },
        { id: "t2", title: "Overdue P1", dueAt: "2026-10-14T00:00:00Z", priority: 1, overdue: true, projectId: "p1" },
      ],
      importantMail: [{ id: "m1", subject: "Offer", from: "Recruiter" }],
      conflicts: [{ a: "Standup", b: "Dentist", start: "x" }],
      overBudget: [{ category: "Delivery", over: 1234 }],
      goals: [{ title: "Run 25 km", goal: "Half-marathon", neglected: true, momentum: "quiet" }],
      ciFailures: [{ title: "CI failed on main", at: "x" }],
    };
    const p = rankPriorities(d, 10);
    expect(p.map((x) => x.key)).toEqual(["task:t2", "approvals", "conflict:Standup:Dentist", "mail:m1", "ci:x:CI failed on main", "task:t1", "budget:Delivery", "goal:Half-marathon:Run 25 km"]);
    expect(p[0]).toMatchObject({ href: "/projects/p1", tone: "red" });
    expect(p.find((x) => x.key === "budget:Delivery")?.detail).toMatch(/\$12\.34 over/);
    expect(rankPriorities(d)).toHaveLength(5);
    expect(rankPriorities(base)).toEqual([]);
  });

  it("flags a failed or stale backup, but not a fresh or never-recorded one", () => {
    expect(rankPriorities({ ...base, backup: { ok: true, at: "2026-10-14T20:00:00.000Z" } })).toEqual([]);
    expect(rankPriorities({ ...base, backup: { ok: true, at: "2026-10-13T00:00:00.000Z" } })[0]).toMatchObject({ key: "backup", label: "Last backup was 2 days ago", tone: "red" });
    expect(rankPriorities({ ...base, backup: { ok: false, at: "2026-10-15T01:00:00.000Z" } })[0]?.label).toBe("The last database backup failed");
    expect(rankPriorities({ ...base, backup: { ok: false, at: "2026-10-01T00:00:00.000Z", never: true } })[0]?.label).toBe("No database backup has been recorded");
  });

  it("composes each briefing kind honestly", () => {
    const morning = composeBriefing("morning", "2026-10-15", base);
    expect(morning.headline).toBe("2 events, 0 tasks and 0 approvals today.");
    expect(morning.sections.find((s) => s.id === "calendar")?.items.map((i) => i.text)).toEqual(["Standup", "Demo"]);
    const midday = composeBriefing("midday", "2026-10-15", base);
    expect(midday.sections.find((s) => s.id === "calendar")?.items.map((i) => i.text)).toEqual(["Demo"]); // standup already ended
    const evening = composeBriefing("evening", "2026-10-15", { ...base, doneToday: [{ title: "Ship" }] });
    expect(evening.headline).toBe("1 task done today.");
    expect(evening.sections.find((s) => s.label === "Tomorrow")?.items.map((i) => i.text)).toEqual(["Gym"]);
    const weekly = composeBriefing("weekly", "2026-10-18", base, { completed: 7 });
    expect(weekly.headline).toBe("7 tasks completed this week.");
    const disconnected = composeBriefing("morning", "2026-10-15", { ...base, calendarConnected: false, events: [] });
    expect(disconnected.sections.find((s) => s.id === "calendar")?.empty).toBe("No calendar connected.");
  });

  it("keys periods by Sydney day, weekly by that week's Sunday", () => {
    expect(periodKey("morning", "2026-10-15")).toBe("2026-10-15");
    expect(periodKey("weekly", "2026-10-15")).toBe("2026-10-18");
    expect(periodKey("weekly", "2026-10-18")).toBe("2026-10-18");
  });

  it("finds due briefings from the schedule", () => {
    expect(dueBriefings(DEFAULT_SCHEDULE, { ymd: "2026-10-15", hm: "06:59", weekday: "Thu" })).toEqual([]);
    expect(dueBriefings(DEFAULT_SCHEDULE, { ymd: "2026-10-15", hm: "07:00", weekday: "Thu" })).toEqual(["morning"]);
    expect(dueBriefings(DEFAULT_SCHEDULE, { ymd: "2026-10-15", hm: "19:00", weekday: "Thu" })).toEqual(["morning", "evening"]);
    expect(dueBriefings(DEFAULT_SCHEDULE, { ymd: "2026-10-18", hm: "19:00", weekday: "Sun" })).toEqual(["morning", "evening", "weekly"]);
    expect(dueBriefings({ ...DEFAULT_SCHEDULE, midday: { on: true, time: "12:30" } }, { ymd: "x", hm: "12:30", weekday: "Mon" })).toEqual(["morning", "midday"]);
  });
});
