import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { taskInput } from "@/lib/task-payload";
import { auditLog, tasks } from "@/server/db/schema";
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
