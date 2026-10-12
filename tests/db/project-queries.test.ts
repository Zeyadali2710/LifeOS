import { describe, expect, it } from "vitest";
import { githubCommits, githubRepos, milestones, projectDependencies, projectLinks, projects, taskDependencies, tasks } from "@/server/db/schema";
import { listProjects, loadActiveProjects, loadProject, searchProjects } from "@/server/project-queries";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const NOW = new Date("2026-10-05T00:00:00Z");
const d = (s: string) => new Date(s);

const mk = async (name: string, extra: Partial<typeof projects.$inferInsert> = {}) =>
  (await t.handle().insert(projects).values({ name, createdAt: d("2026-09-01T00:00:00Z"), updatedAt: d("2026-09-02T00:00:00Z"), ...extra }).returning())[0]!;

describe("project read model", () => {
  it("loadProject: unknown id -> null", async () => {
    expect(await loadProject(t.handle(), "00000000-0000-0000-0000-000000000000", NOW)).toBeNull();
  });

  it("workspace composes tasks, milestones, blockers, links, deps, activity, brief", async () => {
    const h = t.handle();
    const dep = await mk("Upstream", { status: "active" });
    const p = await mk("LifeOS", { workspacePath: "C:\\code\\lifeos", targetDate: "2026-12-01", priority: 1 });
    await h.insert(projectDependencies).values({ projectId: p.id, blockedByProjectId: dep.id });
    const [ms] = await h.insert(milestones).values([{ projectId: p.id, title: "M1", dueDate: "2026-12-01" }]).returning();
    const [a, b, c] = await h
      .insert(tasks)
      .values([
        { projectId: p.id, milestoneId: ms!.id, title: "later", dueDate: "2026-11-01", dueAt: d("2026-11-01T12:00:00Z") },
        { projectId: p.id, milestoneId: ms!.id, title: "soon", dueDate: "2026-10-20", dueAt: d("2026-10-20T12:00:00Z") },
        { projectId: p.id, title: "finished", completedAt: d("2026-10-01T00:00:00Z") },
      ])
      .returning();
    await h.insert(taskDependencies).values({ taskId: a!.id, blockedByTaskId: b!.id });
    await h.insert(githubRepos).values({ id: 1, fullName: "me/lifeos", htmlUrl: "https://github.com/me/lifeos", pushedAt: d("2026-10-04T00:00:00Z") });
    await h.insert(githubCommits).values({ sha: "abc", repoId: 1, message: "feat", committedAt: d("2026-10-04T00:00:00Z") });
    await h.insert(projectLinks).values([
      { projectId: p.id, kind: "repo", repoId: 1, createdAt: d("2026-09-03T00:00:00Z") },
      { projectId: p.id, kind: "url", url: "https://example.com", label: "Docs", createdAt: d("2026-09-04T00:00:00Z") },
    ]);

    const w = (await loadProject(h, p.id, NOW))!;
    expect(w.tasks.map((x) => x.title)).toEqual(["soon", "later", "finished"]);
    expect(w.milestones[0]).toMatchObject({ taskCount: 2, doneCount: 0 });
    expect(w.blockedBy).toEqual({ [a!.id]: ["soon"] });
    expect(w.blockers.map((x) => x.kind).sort()).toEqual(["project_blocked", "task_blocked"]);
    expect(w.links.map((l) => l.kind)).toEqual(["repo", "url"]);
    expect(w.dependsOn).toEqual([{ id: dep.id, name: "Upstream", status: "active" }]);
    expect(w.activity.length).toBeLessThanOrEqual(15);
    expect(w.activity[0]!.kind).toBe("commit");
    expect(w.launchCommand).toBe('cd "C:\\code\\lifeos" && claude');
    expect(w.primaryRepoUrl).toBe("https://github.com/me/lifeos");
    expect(w.brief).toContain("# LifeOS");
    expect(w.githubConnected).toBe(false);
    void c;
  });

  it("launchCommand null without path; overdue task -> behind", async () => {
    const h = t.handle();
    const p = await mk("Late");
    await h.insert(tasks).values({ projectId: p.id, title: "old", dueDate: "2026-10-01", dueAt: d("2026-10-01T12:00:00Z") });
    const w = (await loadProject(h, p.id, NOW))!;
    expect(w.launchCommand).toBeNull();
    expect(w.health).toBe("behind");
    expect(w.healthReason).toBe("Behind: 1 overdue item");
  });

  it("index cards: nextTask, lastActivity, timeline, sparkline, health only when active", async () => {
    const h = t.handle();
    const p = await mk("Cards", { targetDate: "2026-12-01" });
    const paused = await mk("Parked", { status: "paused" });
    await h.insert(tasks).values([
      { projectId: p.id, title: "undated" },
      { projectId: p.id, title: "dated", dueDate: "2026-11-10", dueAt: d("2026-11-10T12:00:00Z") },
      { projectId: p.id, title: "won", completedAt: d("2026-10-03T00:00:00Z") },
    ]);
    const cards = await listProjects(h, NOW);
    const c = cards.find((x) => x.project.id === p.id)!;
    expect(c.nextTask).toEqual({ title: "dated", dueDate: "2026-11-10" });
    expect(c.openTasks).toBe(2);
    expect(c.lastActivity).toEqual({ at: "2026-10-03T00:00:00.000Z", label: "Task completed" });
    expect(c.timeline).not.toBeNull();
    expect(c.repoSparkline).toBeNull();
    expect(c.progress).toMatchObject({ done: 1, total: 3, basis: "tasks" });
    expect(cards.find((x) => x.project.id === paused.id)!.health).toBeNull();
    expect(cards.find((x) => x.project.id === paused.id)!.timeline).toBeNull();
  });

  it("loadActiveProjects: max 4 active, priority then recent activity", async () => {
    const h = t.handle();
    await h.delete(projects);
    const mkp = (name: string, priority: number, updatedAt: string, status = "active") => mk(name, { priority, status, updatedAt: d(updatedAt) });
    await mkp("p2-old", 2, "2026-09-01T00:00:00Z");
    await mkp("p2-new", 2, "2026-09-20T00:00:00Z");
    await mkp("p1", 1, "2026-09-02T00:00:00Z");
    await mkp("p3", 3, "2026-09-30T00:00:00Z");
    await mkp("p3b", 3, "2026-09-05T00:00:00Z");
    await mkp("paused", 1, "2026-09-30T00:00:00Z", "paused");
    const out = await loadActiveProjects(h, NOW);
    expect(out.map((c) => c.project.name)).toEqual(["p1", "p2-new", "p2-old", "p3"]);
  });

  it("searchProjects: case-insensitive, excludes archived, max 4, wildcards literal", async () => {
    const h = t.handle();
    await h.delete(projects);
    await mk("LifeOS");
    await mk("Lifeguard", { status: "archived" });
    await mk("100% done");
    await mk("a_b");
    await mk("axb");
    expect((await searchProjects(h, "lif", 4, NOW)).map((r) => r.name)).toEqual(["LifeOS"]);
    expect((await searchProjects(h, "%", 4, NOW)).map((r) => r.name)).toEqual(["100% done"]);
    expect((await searchProjects(h, "a_b", 4, NOW)).map((r) => r.name)).toEqual(["a_b"]);
    for (let i = 0; i < 6; i++) await mk(`zeta ${i}`);
    expect(await searchProjects(h, "zeta", 4, NOW)).toHaveLength(4);
  });
});
