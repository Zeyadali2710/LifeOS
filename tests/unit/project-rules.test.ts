import { describe, expect, it } from "vitest";
import { linkInput, projectInput } from "@/lib/project-payload";
import {
  addDays,
  blockers,
  buildBrief,
  ciChip,
  ciHealth,
  health,
  isMilestoneOverdue,
  isTaskOverdue,
  languageBar,
  launchCommand,
  progress,
  sparkline,
  sydneyYmd,
  timelineBar,
} from "@/lib/project-rules";

const NOW = new Date("2026-05-10T02:00:00Z"); // Sydney 2026-05-10 12:00
const TODAY = "2026-05-10";
const run = (branch: string | null, status: string, conclusion: string | null, at: string) => ({ branch, status, conclusion, at });

describe("dates", () => {
  it("sydneyYmd uses the Sydney day", () => {
    expect(sydneyYmd(new Date("2026-05-10T15:30:00Z"))).toBe("2026-05-11");
    expect(sydneyYmd(NOW)).toBe(TODAY);
  });
  it("addDays crosses month ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("ciHealth", () => {
  it("latest completed success is passing", () => {
    const r = [run("main", "completed", "success", "2026-05-09T00:00:00Z"), run("main", "completed", "failure", "2026-05-08T00:00:00Z")];
    expect(ciHealth(r, "main")).toEqual({ state: "passing", running: false });
    expect(ciChip(r, "main")).toBe("passing");
  });
  it.each(["failure", "timed_out", "startup_failure", "action_required"])("%s is failing", (c) => {
    expect(ciHealth([run("main", "completed", c, "2026-05-09T00:00:00Z")], "main").state).toBe("failing");
  });
  it("ignores other branches", () => {
    const r = [run("feat", "completed", "failure", "2026-05-09T00:00:00Z"), run("main", "completed", "success", "2026-05-01T00:00:00Z")];
    expect(ciHealth(r, "main").state).toBe("passing");
  });
  it("skips cancelled/skipped/neutral/stale", () => {
    const r = [
      run("main", "completed", "cancelled", "2026-05-09T03:00:00Z"),
      run("main", "completed", "skipped", "2026-05-09T02:00:00Z"),
      run("main", "completed", "neutral", "2026-05-09T01:00:00Z"),
      run("main", "completed", "stale", "2026-05-09T00:30:00Z"),
      run("main", "completed", "failure", "2026-05-09T00:00:00Z"),
    ];
    expect(ciHealth(r, "main").state).toBe("failing");
  });
  it("in-progress newest sets running but state from newest completed", () => {
    const r = [run("main", "in_progress", null, "2026-05-10T00:00:00Z"), run("main", "completed", "failure", "2026-05-09T00:00:00Z")];
    expect(ciHealth(r, "main")).toEqual({ state: "failing", running: true });
    expect(ciChip(r, "main")).toBe("running");
  });
  it("no runs is none", () => {
    expect(ciHealth([], "main")).toEqual({ state: "none", running: false });
    expect(ciChip([], "main")).toBe("none");
  });
});

describe("languageBar", () => {
  it("empty and null cases", () => {
    expect(languageBar({}, "Go")).toEqual([]);
    expect(languageBar(null, null)).toEqual([]);
    const f = languageBar(null, "Go");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ name: "Go", pct: 100 });
  });
  it("top 5 plus Other, pct sums to 100", () => {
    const bar = languageBar({ A: 700, B: 600, C: 500, D: 400, E: 300, F: 200, G: 100 }, null);
    expect(bar.map((s) => s.name)).toEqual(["A", "B", "C", "D", "E", "Other"]);
    expect(bar.reduce((n, s) => n + s.pct, 0)).toBe(100);
    expect(bar[5]).toMatchObject({ name: "Other", color: "#8e8e93" });
    expect(bar[0]!.color).toBe(languageBar({ A: 1 }, null)[0]!.color); // stable per name
  });
  it("remainder goes on the largest slice", () => {
    const bar = languageBar({ A: 1, B: 1, C: 1 }, null);
    expect(bar.reduce((n, s) => n + s.pct, 0)).toBe(100);
  });
});

describe("sparkline", () => {
  it("buckets by Sydney day, oldest to newest", () => {
    const s = sparkline(["2026-05-09T15:30:00Z", "2026-05-10T02:00:00Z", NOW], NOW);
    expect(s).toHaveLength(14);
    expect(s[13]).toBe(3); // 10 May Sydney
    expect(s.reduce((a, b) => a + b, 0)).toBe(3);
  });
  it("commit at 15:30Z lands on the next Sydney day", () => {
    const now = new Date("2026-05-12T02:00:00Z");
    const s = sparkline(["2026-05-10T15:30:00Z"], now);
    expect(s[12]).toBe(1); // 11 May is one day before 12 May
  });
  it("ignores null and old dates", () => {
    const s = sparkline([null, "2026-04-01T00:00:00Z", new Date("2026-05-10T00:00:00Z")], NOW);
    expect(s.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe("progress", () => {
  const t = (done: boolean) => ({ completedAt: done ? "2026-05-01T00:00:00Z" : null });
  it("tasks win", () => {
    expect(progress({ tasks: [t(true), t(false), t(false)], milestones: [] })).toEqual({ pct: 33, done: 1, total: 3, basis: "tasks" });
  });
  it("falls back to milestones", () => {
    expect(progress({ tasks: [], milestones: [t(true), t(false)] })).toEqual({ pct: 50, done: 1, total: 2, basis: "milestones" });
  });
  it("neither is null", () => {
    expect(progress({ tasks: [], milestones: [] })).toEqual({ pct: null, done: 0, total: 0, basis: "none" });
  });
});

describe("overdue", () => {
  it("tasks compare dueAt to now", () => {
    expect(isTaskOverdue({ completedAt: null, dueAt: "2026-05-10T01:00:00Z" }, NOW)).toBe(true);
    expect(isTaskOverdue({ completedAt: null, dueAt: "2026-05-10T03:00:00Z" }, NOW)).toBe(false);
    expect(isTaskOverdue({ completedAt: "2026-05-01T00:00:00Z", dueAt: "2026-05-01T00:00:00Z" }, NOW)).toBe(false);
    expect(isTaskOverdue({ completedAt: null, dueAt: null }, NOW)).toBe(false);
  });
  it("milestones compare dueDate to today", () => {
    expect(isMilestoneOverdue({ completedAt: null, dueDate: "2026-05-09" }, TODAY)).toBe(true);
    expect(isMilestoneOverdue({ completedAt: null, dueDate: TODAY }, TODAY)).toBe(false);
    expect(isMilestoneOverdue({ completedAt: "x", dueDate: "2026-05-01" }, TODAY)).toBe(false);
  });
});

describe("health", () => {
  const base = { status: "active" as const, targetDate: null, today: TODAY, progressPct: 50, overdue: 0, failingRepos: [] };
  it("not active is null", () => {
    expect(health({ ...base, status: "paused", overdue: 3 }).health).toBeNull();
  });
  it("overdue is behind", () => {
    expect(health({ ...base, overdue: 2 })).toEqual({ health: "behind", reason: "Behind: 2 overdue items" });
  });
  it("target passed and not done is behind", () => {
    expect(health({ ...base, targetDate: "2026-05-09" }).health).toBe("behind");
  });
  it("target within 7 days below 80% is at risk", () => {
    expect(health({ ...base, targetDate: "2026-05-15", progressPct: 40 })).toEqual({ health: "at_risk", reason: "At risk: target in 5 days at 40%" });
    expect(health({ ...base, targetDate: "2026-05-17", progressPct: 79 }).health).toBe("at_risk");
    expect(health({ ...base, targetDate: "2026-05-17", progressPct: 80 }).health).toBe("on_track");
  });
  it("target beyond 7 days is on track", () => {
    expect(health({ ...base, targetDate: "2026-05-18", progressPct: 0 })).toEqual({ health: "on_track", reason: "On track" });
  });
  it("CI failing alone is at risk", () => {
    expect(health({ ...base, failingRepos: ["owner/repo"] })).toEqual({ health: "at_risk", reason: "At risk: CI failing on owner/repo" });
  });
});

describe("blockers", () => {
  const i = {
    tasks: [
      { id: "t1", title: "A", completedAt: null },
      { id: "t2", title: "Z", completedAt: "2026-05-01T00:00:00Z" },
    ],
    taskDeps: [] as { taskId: string; blockedById: string; blockedByTitle: string; blockedByDone: boolean }[],
    projectDeps: [] as { id: string; name: string; status: "active" | "paused" | "done" | "archived" }[],
    milestones: [] as { id: string; title: string; dueDate: string | null; completedAt: string | null }[],
    failingRepos: [] as string[],
    today: TODAY,
    projectId: "p1",
  };
  it("task blocked by incomplete blocker", () => {
    const b = blockers({ ...i, taskDeps: [{ taskId: "t1", blockedById: "x", blockedByTitle: "B", blockedByDone: false }] });
    expect(b).toEqual([{ kind: "task_blocked", refId: "t1", label: 'Task "A" is blocked by "B"', href: "/projects/p1?task=t1" }]);
  });
  it("completed blocker or done task gives none", () => {
    expect(blockers({ ...i, taskDeps: [{ taskId: "t1", blockedById: "x", blockedByTitle: "B", blockedByDone: true }] })).toEqual([]);
    expect(blockers({ ...i, taskDeps: [{ taskId: "t2", blockedById: "x", blockedByTitle: "B", blockedByDone: false }] })).toEqual([]);
  });
  it("project deps: active/paused block, done/archived do not", () => {
    const b = blockers({ ...i, projectDeps: [{ id: "p2", name: "P", status: "active" }] });
    expect(b[0]).toEqual({ kind: "project_blocked", refId: "p2", label: 'Waiting on project "P" (Active)', href: "/projects/p2" });
    expect(blockers({ ...i, projectDeps: [{ id: "p2", name: "P", status: "paused" }] })).toHaveLength(1);
    expect(blockers({ ...i, projectDeps: [{ id: "p2", name: "P", status: "done" }, { id: "p3", name: "Q", status: "archived" }] })).toEqual([]);
  });
  it("overdue milestone and failing repo", () => {
    const m = blockers({ ...i, milestones: [{ id: "m1", title: "M", dueDate: "2026-05-01", completedAt: null }] });
    expect(m).toEqual([{ kind: "milestone_overdue", refId: "m1", label: 'Milestone "M" is overdue', href: "/projects/p1#milestones" }]);
    const c = blockers({ ...i, failingRepos: ["o/r"] });
    expect(c).toEqual([{ kind: "ci_failing", refId: "o/r", label: "CI failing on o/r", href: "/career/o/r" }]);
  });
});

describe("timelineBar", () => {
  it("null without target", () => {
    expect(timelineBar({ startYmd: "2026-05-01", targetDate: null, today: TODAY })).toBeNull();
  });
  it("midway", () => {
    expect(timelineBar({ startYmd: "2026-05-01", targetDate: "2026-05-11", today: "2026-05-06" })).toEqual({ pct: 50, daysLeft: 5 });
  });
  it("past target", () => {
    expect(timelineBar({ startYmd: "2026-05-01", targetDate: "2026-05-11", today: "2026-05-14" })).toEqual({ pct: 100, daysLeft: -3 });
  });
});

describe("launchCommand", () => {
  it("null for empty", () => {
    expect(launchCommand(null)).toBeNull();
    expect(launchCommand("")).toBeNull();
  });
  it("quotes the path", () => {
    expect(launchCommand("C:\\code\\lifeos")).toBe('cd "C:\\code\\lifeos" && claude');
  });
  it("rejects shell metacharacters", () => {
    for (const p of ['a"b', "a`b", "a$b", "a\nb"]) expect(launchCommand(p)).toBeNull();
  });
});

describe("buildBrief", () => {
  const input = {
    project: { name: "LifeOS", description: "Personal OS", context: "", status: "active" as const, priority: 1 as const, targetDate: "2026-06-01", blockerNote: "" },
    health: "on_track" as const,
    progress: { pct: 33, done: 1, total: 3, basis: "tasks" as const },
    openTasks: [{ title: "Ship it", dueDate: "2026-05-12" }, { title: "Docs", dueDate: null }],
    blockers: [],
    milestones: [{ title: "Beta", dueDate: "2026-05-20", completedAt: null }],
    repos: [{ fullName: "o/r", ci: "passing" as const }],
  };
  it("matches snapshot", () => {
    expect(buildBrief(input)).toMatchInlineSnapshot(`
      "# LifeOS

      Personal OS

      ## Status

      - Status: Active
      - Health: On track
      - Priority: P1
      - Progress: 33% (1/3 tasks)
      - Target: 2026-06-01

      ## Open tasks

      - Ship it (due 2026-05-12)
      - Docs

      ## Blockers

      None.

      ## Milestones

      - [ ] Beta (due 2026-05-20)

      ## Repositories

      - o/r (CI passing)"
    `);
  });
  it("empty sections say None.", () => {
    const b = buildBrief({ ...input, openTasks: [], milestones: [], repos: [] });
    for (const h of ["## Status", "## Open tasks", "## Blockers", "## Milestones", "## Repositories"]) expect(b).toContain(h);
    expect(b.match(/None\./g)!.length).toBeGreaterThanOrEqual(4);
  });
  it("adds a Context section only when non-empty", () => {
    const b = buildBrief({ ...input, project: { ...input.project, context: "Built with Next.js" } });
    expect(b).toContain("## Context\nBuilt with Next.js");
    expect(b.indexOf("## Context")).toBeGreaterThan(b.indexOf("Personal OS"));
    expect(b.indexOf("## Context")).toBeLessThan(b.indexOf("## Status"));
    expect(buildBrief(input)).not.toContain("## Context");
    expect(buildBrief({ ...input, project: { ...input.project, context: "y".repeat(4000) } }).length).toBeLessThanOrEqual(8000);
  });
  it("caps lists at 20 and total at 8000 chars", () => {
    const many = Array.from({ length: 50 }, (_, n) => ({ title: `T${n}`, dueDate: null }));
    const b = buildBrief({ ...input, openTasks: many });
    expect(b).toContain("- T19");
    expect(b).not.toContain("- T20");
    const huge = buildBrief({ ...input, project: { ...input.project, description: "x".repeat(20000) } });
    expect(huge.length).toBeLessThanOrEqual(8000);
  });
});

describe("payload", () => {
  it("projectInput rejects $ in workspacePath and accepts a normal path", () => {
    expect(projectInput.safeParse({ name: "A", workspacePath: "C:\\a$b" }).success).toBe(false);
    const ok = projectInput.parse({ name: "A", workspacePath: " C:\\code ", workspaceMachine: "" });
    expect(ok.workspacePath).toBe("C:\\code");
    expect(ok.workspaceMachine).toBeNull();
    expect(projectInput.parse({ name: "A", workspacePath: "" }).workspacePath).toBeNull();
  });
  it("linkInput rejects javascript: and accepts http", () => {
    expect(linkInput.safeParse({ kind: "url", label: "x", url: "javascript:alert(1)" }).success).toBe(false);
    expect(linkInput.safeParse({ kind: "url", label: "x", url: "http://example.com" }).success).toBe(true);
    expect(linkInput.safeParse({ kind: "repo", repoId: 5 }).success).toBe(true);
  });
});
