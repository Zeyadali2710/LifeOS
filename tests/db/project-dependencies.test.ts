import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activityEvents, projectDependencies, projects, taskDependencies, tasks } from "@/server/db/schema";
import { addProjectDependency, addTaskDependency, removeTaskDependency } from "@/server/projects";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const h = () => t.handle();
const NOW = new Date("2026-10-05T00:00:00Z");
const TASK_MSG = "That would create a circular dependency. Pick a different task.";
const PROJ_MSG = "That would create a circular dependency. Pick a different project.";
const cycle = (msg: string) => ({ ok: false, errors: { blockedBy: msg } });
const NONE = "00000000-0000-4000-8000-000000000000";

const mkTask = async (title: string, projectId: string | null = null) =>
  (await h().insert(tasks).values({ title, projectId }).returning())[0]!.id;
const mkProject = async (name: string) => (await h().insert(projects).values({ name }).returning())[0]!.id;
const events = async (type: string) => (await h().select().from(activityEvents).where(eq(activityEvents.type, type))).length;

describe("task dependency cycles", () => {
  it("rejects self, direct, transitive and cross-project cycles", async () => {
    const [p1, p2] = [await mkProject("x1"), await mkProject("x2")];
    const a = await mkTask("a", p1);
    const b = await mkTask("b", p2);
    const c = await mkTask("c");
    expect(await addTaskDependency(h(), a, a, NOW)).toEqual(cycle(TASK_MSG));
    expect(await addTaskDependency(h(), a, b, NOW)).toEqual({ ok: true });
    expect(await addTaskDependency(h(), b, a, NOW)).toEqual(cycle(TASK_MSG));
    expect(await addTaskDependency(h(), b, c, NOW)).toEqual({ ok: true });
    expect(await addTaskDependency(h(), c, a, NOW)).toEqual(cycle(TASK_MSG)); // a->b->c->a, across projects
  });

  it("is idempotent", async () => {
    const a = await mkTask("a");
    const b = await mkTask("b");
    await addTaskDependency(h(), a, b, NOW);
    expect(await addTaskDependency(h(), a, b, NOW)).toEqual({ ok: true });
    expect((await h().select().from(taskDependencies).where(eq(taskDependencies.taskId, a))).length).toBe(1);
  });

  it("rejects unknown ids", async () => {
    const a = await mkTask("a");
    expect(await addTaskDependency(h(), a, NONE, NOW)).toEqual({ ok: false, error: "not_found" });
    expect(await addTaskDependency(h(), NONE, a, NOW)).toEqual({ ok: false, error: "not_found" });
  });

  it("emits project.blocked once on add and project.unblocked on remove", async () => {
    const p = await mkProject("ev");
    const a = await mkTask("a", p);
    const b = await mkTask("b");
    const [bl, ub] = [await events("project.blocked"), await events("project.unblocked")];
    await addTaskDependency(h(), a, b, NOW);
    expect(await events("project.blocked")).toBe(bl + 1);
    await removeTaskDependency(h(), a, b, NOW);
    expect(await events("project.unblocked")).toBe(ub + 1);
  });

  it("concurrent opposite inserts: exactly one succeeds", async () => {
    const a = await mkTask("ca");
    const b = await mkTask("cb");
    const r = await Promise.all([addTaskDependency(h(), a, b, NOW), addTaskDependency(h(), b, a, NOW)]);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect(r.filter((x) => !x.ok)).toEqual([cycle(TASK_MSG)]);
  });
});

describe("project dependency cycles", () => {
  it("rejects self, direct and transitive cycles; idempotent; not_found", async () => {
    const [a, b, c] = [await mkProject("a"), await mkProject("b"), await mkProject("c")];
    expect(await addProjectDependency(h(), a, a, NOW)).toEqual(cycle(PROJ_MSG));
    expect(await addProjectDependency(h(), a, b, NOW)).toEqual({ ok: true });
    expect(await addProjectDependency(h(), a, b, NOW)).toEqual({ ok: true });
    expect((await h().select().from(projectDependencies).where(eq(projectDependencies.projectId, a))).length).toBe(1);
    expect(await addProjectDependency(h(), b, a, NOW)).toEqual(cycle(PROJ_MSG));
    expect(await addProjectDependency(h(), b, c, NOW)).toEqual({ ok: true });
    expect(await addProjectDependency(h(), c, a, NOW)).toEqual(cycle(PROJ_MSG));
  });

  it("rejects unknown project ids", async () => {
    const a = await mkProject("nf");
    expect(await addProjectDependency(h(), a, NONE, NOW)).toEqual({ ok: false, error: "not_found" });
  });

  it("concurrent opposite inserts: exactly one succeeds", async () => {
    const [a, b] = [await mkProject("pa"), await mkProject("pb")];
    const r = await Promise.all([addProjectDependency(h(), a, b, NOW), addProjectDependency(h(), b, a, NOW)]);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
  });
});
