import { count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  githubRepos,
  milestones,
  projectDependencies,
  projectLinks,
  projects,
  taskDependencies,
  tasks,
} from "@/server/db/schema";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const h = () => t.handle();

async function mkProject(name = "p") {
  const [p] = await h().insert(projects).values({ name }).returning();
  return p!;
}
async function mkTask(title = "t", extra: Partial<typeof tasks.$inferInsert> = {}) {
  const [r] = await h().insert(tasks).values({ title, ...extra }).returning();
  return r!;
}
let repoSeq = 1000;
async function mkRepo() {
  const id = repoSeq++;
  await h().insert(githubRepos).values({ id, fullName: `me/r${id}` });
  return id;
}

describe("phase 5 schema", () => {
  it("project defaults", async () => {
    const p = await mkProject("defaults");
    expect([p.category, p.status, p.priority, p.blockerNote]).toEqual(["personal", "active", 2, ""]);
  });

  it("rejects bad status, category and priority", async () => {
    await expect(h().insert(projects).values({ name: "x", status: "bogus" })).rejects.toThrow();
    await expect(h().insert(projects).values({ name: "x", category: "bogus" })).rejects.toThrow();
    await expect(h().insert(projects).values({ name: "x", priority: 4 })).rejects.toThrow();
  });

  it("deleting a project keeps its tasks (project_id set null)", async () => {
    const p = await mkProject();
    const task = await mkTask("keep", { projectId: p.id });
    await h().delete(projects).where(eq(projects.id, p.id));
    const [r] = await h().select().from(tasks).where(eq(tasks.id, task.id));
    expect(r!.projectId).toBeNull();
  });

  it("cascades project -> milestones; milestone delete nulls task.milestone_id", async () => {
    const p = await mkProject();
    const [m1] = await h().insert(milestones).values({ projectId: p.id, title: "m1" }).returning();
    const [m2] = await h().insert(milestones).values({ projectId: p.id, title: "m2" }).returning();
    const task = await mkTask("ms", { projectId: p.id, milestoneId: m1!.id });
    await h().delete(milestones).where(eq(milestones.id, m1!.id));
    const [r] = await h().select().from(tasks).where(eq(tasks.id, task.id));
    expect(r!.milestoneId).toBeNull();
    await h().delete(projects).where(eq(projects.id, p.id));
    const [c] = await h().select({ n: count() }).from(milestones).where(eq(milestones.id, m2!.id));
    expect(c!.n).toBe(0);
  });

  it("task_dependencies: no self, no duplicates, cascades from either task", async () => {
    const a = await mkTask("a");
    const b = await mkTask("b");
    await expect(h().insert(taskDependencies).values({ taskId: a.id, blockedByTaskId: a.id })).rejects.toThrow();
    await h().insert(taskDependencies).values({ taskId: a.id, blockedByTaskId: b.id });
    await expect(h().insert(taskDependencies).values({ taskId: a.id, blockedByTaskId: b.id })).rejects.toThrow();
    await h().delete(tasks).where(eq(tasks.id, b.id));
    const [c] = await h().select({ n: count() }).from(taskDependencies).where(eq(taskDependencies.taskId, a.id));
    expect(c!.n).toBe(0);
    const d = await mkTask("d");
    await h().insert(taskDependencies).values({ taskId: d.id, blockedByTaskId: a.id });
    await h().delete(tasks).where(eq(tasks.id, d.id));
    const [c2] = await h().select({ n: count() }).from(taskDependencies).where(eq(taskDependencies.blockedByTaskId, a.id));
    expect(c2!.n).toBe(0);
  });

  it("project_dependencies rejects self rows", async () => {
    const a = await mkProject();
    const b = await mkProject();
    await expect(h().insert(projectDependencies).values({ projectId: a.id, blockedByProjectId: a.id })).rejects.toThrow();
    await h().insert(projectDependencies).values({ projectId: a.id, blockedByProjectId: b.id });
  });

  it("project_links: kind checks, per-project repo uniqueness, repo cascade", async () => {
    const p1 = await mkProject();
    const p2 = await mkProject();
    const repo = await mkRepo();
    await expect(h().insert(projectLinks).values({ projectId: p1.id, kind: "repo" })).rejects.toThrow();
    await expect(h().insert(projectLinks).values({ projectId: p1.id, kind: "url", url: "https://x.test", repoId: repo })).rejects.toThrow();
    await expect(h().insert(projectLinks).values({ projectId: p1.id, kind: "url" })).rejects.toThrow();
    await h().insert(projectLinks).values({ projectId: p1.id, kind: "repo", repoId: repo });
    await expect(h().insert(projectLinks).values({ projectId: p1.id, kind: "repo", repoId: repo })).rejects.toThrow();
    await h().insert(projectLinks).values({ projectId: p2.id, kind: "repo", repoId: repo });
    await h().insert(projectLinks).values({ projectId: p1.id, kind: "url", url: "https://a.test" });
    await h().insert(projectLinks).values({ projectId: p1.id, kind: "url", url: "https://b.test" });
    await h().delete(githubRepos).where(eq(githubRepos.id, repo));
    const [c] = await h().select({ n: count() }).from(projectLinks).where(eq(projectLinks.repoId, repo));
    expect(c!.n).toBe(0);
  });

  it("github_repos.languages is null until fetched", async () => {
    const id = await mkRepo();
    const [r] = await h().select().from(githubRepos).where(eq(githubRepos.id, id));
    expect(r!.languages).toBeNull();
  });
});
