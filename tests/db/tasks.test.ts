import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { taskInput } from "@/lib/task-payload";
import { auditLog, milestones, projects, taskDependencies, tasks } from "@/server/db/schema";
import { taskDialogOptions } from "@/server/projects";
import { createTask, deleteTask, setTaskCompleted, updateTask } from "@/server/tasks";
import { sydneyInstant } from "@/server/time";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const NOW = new Date("2026-10-05T00:00:00Z");
const row = async (id: string) => (await t.handle().select().from(tasks).where(eq(tasks.id, id)))[0]!;
const actions = async (id: string) =>
  (await t.handle().select().from(auditLog).where(eq(auditLog.target, id))).map((a) => a.action);

describe("taskInput", () => {
  it("rejects bad titles, time without date, long notes", () => {
    const msg = (v: unknown) => taskInput.safeParse(v).error?.issues[0]?.message;
    expect(msg({ title: "  " })).toBe("Add a title.");
    expect(msg({ title: "x".repeat(201) })).toBe("Title must be 200 characters or fewer.");
    expect(msg({ title: "a", dueTime: "18:00" })).toBe("Add a due date before choosing a time.");
    expect(taskInput.safeParse({ title: "a", notes: "n".repeat(4001) }).success).toBe(false);
    expect(taskInput.safeParse({ title: "a" }).success).toBe(true);
  });

  it("rejects impossible due dates and offset-less reminder times (WR-C06)", () => {
    const msg = (v: unknown) => taskInput.safeParse(v).error?.issues[0]?.message;
    expect(msg({ title: "a", dueDate: "2026-02-31" })).toBe("Enter a valid date.");
    expect(msg({ title: "a", dueDate: "2026-13-45" })).toBe("Enter a valid date.");
    expect(msg({ title: "a", remindAt: "2026-10-13T09:00" })).toBe("Enter a valid reminder time.");
    expect(taskInput.safeParse({ title: "a", dueDate: "2028-02-29", remindAt: "2026-10-12T22:00:00.000Z" }).success).toBe(true);
    expect(taskInput.safeParse({ title: "a", remindAt: "2026-10-13T09:00:00+11:00" }).success).toBe(true);
  });
});

describe("tasks service", () => {
  it("derives dueAt, audits without contents, and rejects past reminders", async () => {
    const a = await createTask(t.handle(), { title: "secret title", notes: "secret notes", dueDate: "2026-10-08" }, NOW);
    if (!a.ok) throw new Error("create failed");
    expect(a.task.dueAt).toBe(sydneyInstant(2026, 10, 8, 23, 59).toISOString());
    const b = await createTask(t.handle(), { title: "b", dueDate: "2026-10-08", dueTime: "18:00" }, NOW);
    if (!b.ok) throw new Error("create failed");
    expect(b.task.dueAt).toBe(sydneyInstant(2026, 10, 8, 18, 0).toISOString());

    const bad = await createTask(t.handle(), { title: "c", remindAt: "2026-10-04T00:00:00Z" }, NOW);
    expect(bad).toEqual({ ok: false, errors: { remindAt: "Reminder must be in the future." } });

    const audit = await t.handle().select().from(auditLog).where(eq(auditLog.target, a.task.id));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.metadata).toEqual({ id: a.task.id });
  });

  it("re-arms only when remindAt changes; complete/reopen/delete audit", async () => {
    const c = await createTask(t.handle(), { title: "r", remindAt: "2026-10-06T00:00:00Z" }, NOW);
    if (!c.ok) throw new Error("create failed");
    const id = c.task.id;
    const stamp = new Date("2026-10-06T00:01:00Z");
    await t.handle().update(tasks).set({ remindedAt: stamp }).where(eq(tasks.id, id));

    await updateTask(t.handle(), id, { title: "r2", remindAt: "2026-10-06T00:00:00Z" }, NOW);
    expect((await row(id)).remindedAt).toEqual(stamp);

    await updateTask(t.handle(), id, { title: "r2", remindAt: "2026-10-07T00:00:00Z" }, NOW);
    expect((await row(id)).remindedAt).toBeNull();

    expect((await setTaskCompleted(t.handle(), id, true, NOW)).ok).toBe(true);
    expect((await row(id)).completedAt).toEqual(NOW);
    await setTaskCompleted(t.handle(), id, false, NOW);
    expect((await row(id)).completedAt).toBeNull();
    expect((await deleteTask(t.handle(), id)).ok).toBe(true);
    expect((await deleteTask(t.handle(), id)).ok).toBe(false);
    expect((await actions(id)).sort()).toEqual(["task.complete", "task.create", "task.delete", "task.reopen", "task.update", "task.update"]);
  });
});

describe("tasks project/milestone", () => {
  const mkProject = async (name: string) => (await t.handle().insert(projects).values({ name }).returning())[0]!.id;
  const mkMilestone = async (projectId: string) => (await t.handle().insert(milestones).values({ projectId, title: "m" }).returning())[0]!.id;

  it("stores a project and a milestone of that project", async () => {
    const p = await mkProject("tp1");
    const m = await mkMilestone(p);
    const r = await createTask(t.handle(), { title: "x", projectId: p, milestoneId: m }, NOW);
    if (!r.ok) throw new Error("create failed");
    expect([r.task.projectId, r.task.milestoneId]).toEqual([p, m]);
  });

  it("rejects a milestone of another project, a milestone without a project, and an unknown project", async () => {
    const [p1, p2] = [await mkProject("tp2"), await mkProject("tp3")];
    const m2 = await mkMilestone(p2);
    const msg = { milestoneId: "Pick a milestone from this project." };
    expect(await createTask(t.handle(), { title: "x", projectId: p1, milestoneId: m2 }, NOW)).toEqual({ ok: false, errors: msg });
    expect(await createTask(t.handle(), { title: "x", milestoneId: m2 }, NOW)).toEqual({ ok: false, errors: msg });
    expect(await createTask(t.handle(), { title: "x", projectId: "00000000-0000-4000-8000-000000000000" }, NOW)).toEqual({
      ok: false,
      errors: { projectId: "Pick a project." },
    });
  });

  it("clearing the project clears the milestone", async () => {
    const p = await mkProject("tp4");
    const m = await mkMilestone(p);
    const a = await createTask(t.handle(), { title: "a", projectId: p, milestoneId: m }, NOW);
    if (!a.ok) throw new Error("create failed");
    const u = await updateTask(t.handle(), a.task.id, { title: "a", projectId: null }, NOW);
    if (!u.ok) throw new Error("update failed");
    expect([u.task.projectId, u.task.milestoneId]).toEqual([null, null]);
  });

  it("taskDialogOptions lists projects with milestones, other open tasks and current blockers", async () => {
    const p = await mkProject("tp5");
    const m = await mkMilestone(p);
    const a = await createTask(t.handle(), { title: "a", projectId: p, milestoneId: m }, NOW);
    const b = await createTask(t.handle(), { title: "b" }, NOW);
    if (!a.ok || !b.ok) throw new Error("create failed");
    await t.handle().insert(taskDependencies).values({ taskId: a.task.id, blockedByTaskId: b.task.id });
    const opts = await taskDialogOptions(t.handle(), a.task.id);
    expect(opts.projects.find((x) => x.id === p)?.milestones).toEqual([{ id: m, title: "m" }]);
    expect(opts.tasks.map((x) => x.id)).not.toContain(a.task.id);
    expect(opts.tasks.map((x) => x.id)).toContain(b.task.id);
    expect(opts.blockedBy).toEqual([{ id: b.task.id, title: "b" }]);
  });
});
