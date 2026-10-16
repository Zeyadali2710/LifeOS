import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callTool } from "@/server/agents/gateway";
import { createRun } from "@/server/agents/loop";
import { TOOLS } from "@/server/agents/tools";
import { agentRuns, goals, objectiveProjects, objectives, projects, settings, taskDependencies, tasks } from "@/server/db/schema";
import { loadGoals } from "@/server/goals";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const allowed = vi.hoisted(() => ({ owner: true }));
vi.mock("@/server/session", () => ({ requireOwner: async () => { if (!allowed.owner) throw new Error("Not owner"); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => t.handle() }));
import { deleteGoalAction, deleteObjectiveAction, linkProjectAction, saveGoalAction, saveObjectiveAction, saveVisionAction, unlinkProjectAction } from "@/server/goals-actions";

const h = () => t.handle();
const NOW = new Date("2026-10-15T01:00:00Z"); // Thu 12:00 Sydney
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const ok = async (p: Promise<{ ok: boolean; id?: string; error?: string }>) => { const r = await p; if (!r.ok) throw new Error(r.error); return r.id!; };

async function project(name: string, status = "active") {
  const [p] = await h().insert(projects).values({ name, status }).returning({ id: projects.id });
  return p!.id;
}
async function task(projectId: string, title: string, completed: number | null, created = 40) {
  const [r] = await h().insert(tasks).values({ title, projectId, completedAt: completed === null ? null : daysAgo(completed), createdAt: daysAgo(created) }).returning({ id: tasks.id });
  return r!.id;
}

beforeEach(async () => {
  allowed.owner = true;
  for (const table of [objectiveProjects, objectives, goals, tasks, projects, agentRuns]) await h().delete(table);
  await h().delete(settings).where(eq(settings.key, "goals.vision"));
});

describe("goals hierarchy", () => {
  it("derives progress, momentum, neglect, horizon and blocked tasks from linked projects", async () => {
    await ok(saveVisionAction("Build technology that gives people leverage."));
    const g = await ok(saveGoalAction({ title: "Launch LifeOS", color: "#0a84ff", targetDate: "2027-03-01" }));
    const o1 = await ok(saveObjectiveAction({ goalId: g, title: "Ship 0.9", targetDate: "2026-10-17" }));
    await ok(saveObjectiveAction({ goalId: g, title: "50 beta users", targetDate: "2026-12-01", progress: 12 }));
    const o3 = await ok(saveObjectiveAction({ goalId: g, title: "Write docs" }));
    // Old objective with an old project: neglected.
    await h().update(objectives).set({ createdAt: daysAgo(60), updatedAt: daysAgo(60) }).where(eq(objectives.id, o3));
    const p1 = await project("LifeOS 0.9");
    const pOld = await project("Docs site");
    await ok(linkProjectAction(o1, p1));
    await ok(linkProjectAction(o3, pOld));
    await h().update(objectiveProjects).set({ createdAt: daysAgo(60) }).where(eq(objectiveProjects.projectId, pOld));
    await task(p1, "Finish migration", 2);
    await task(p1, "Fix replay tests", 5);
    await task(p1, "Earlier step", 20);
    const blocker = await task(p1, "Write spec", null);
    const blockedTask = await task(p1, "Ship release notes", null);
    await h().insert(taskDependencies).values({ taskId: blockedTask, blockedByTaskId: blocker });
    await task(pOld, "Draft outline", 50, 60);

    const d = await loadGoals(h(), NOW);
    expect(d.vision).toMatch(/leverage/);
    const goal = d.goals[0]!;
    const [a, b, c] = goal.objectives;
    expect(a).toMatchObject({ title: "Ship 0.9", progress: 60, momentum: "rising", neglected: false, horizon: "week" });
    expect(a!.projects[0]!.tasks.find((x) => x.title === "Ship release notes")).toMatchObject({ blocked: true, done: false });
    expect(a!.projects[0]!.tasks.find((x) => x.title === "Write spec")).toMatchObject({ blocked: false });
    expect(b).toMatchObject({ progress: 12, momentum: "quiet", horizon: "year", projects: [] });
    expect(c).toMatchObject({ progress: 100, neglected: true, horizon: "long" }); // no own date: falls back to the goal's 2027 target
    expect(goal).toMatchObject({ progress: Math.round((60 + 12 + 100) / 3), momentum: "rising", neglected: 1 });
    expect(d.headline).toBe("Momentum is up on 1 of 1 goal.");
  });

  it("keeps one objective per project, moves on relink, and excludes archived projects", async () => {
    const g = await ok(saveGoalAction({ title: "G" }));
    const o1 = await ok(saveObjectiveAction({ goalId: g, title: "A" }));
    const o2 = await ok(saveObjectiveAction({ goalId: g, title: "B" }));
    const p = await project("Shared");
    await task(p, "t", 1);
    await ok(linkProjectAction(o1, p));
    await ok(linkProjectAction(o2, p));
    let d = await loadGoals(h(), NOW);
    expect(d.goals[0]!.objectives.map((o) => o.projects.length)).toEqual([0, 1]);
    expect(d.projects.find((x) => x.id === p)?.objectiveId).toBe(o2);
    await h().update(projects).set({ status: "archived" }).where(eq(projects.id, p));
    d = await loadGoals(h(), NOW);
    expect(d.goals[0]!.objectives[1]!.projects).toEqual([]);
    expect(d.projects.find((x) => x.id === p)).toBeUndefined();
    await ok(unlinkProjectAction(p));
    expect(await h().select().from(objectiveProjects)).toHaveLength(0);
  });

  it("validates, cascades deletes and reports missing rows", async () => {
    expect(await saveGoalAction({ title: "" })).toMatchObject({ ok: false });
    expect(await saveObjectiveAction({ goalId: "9f1c3c2e-4b7a-4c55-9a51-1f7e3b2a6d10", title: "x" })).toMatchObject({ ok: false, error: "That goal no longer exists." });
    expect(await saveVisionAction("x".repeat(501))).toMatchObject({ ok: false });
    const g = await ok(saveGoalAction({ title: "G" }));
    const o = await ok(saveObjectiveAction({ goalId: g, title: "O" }));
    const p = await project("P");
    await ok(linkProjectAction(o, p));
    expect(await linkProjectAction(o, "9f1c3c2e-4b7a-4c55-9a51-1f7e3b2a6d10")).toMatchObject({ ok: false });
    expect(await saveGoalAction({ title: "G2", status: "done" }, g)).toMatchObject({ ok: true });
    expect((await loadGoals(h(), NOW)).goals[0]).toMatchObject({ progress: 100, status: "done" });
    expect(await saveGoalAction({ title: "G3", status: "archived" }, g)).toMatchObject({ ok: true });
    expect((await loadGoals(h(), NOW)).goals).toHaveLength(0);
    expect((await loadGoals(h(), NOW, { includeArchived: true })).goals).toMatchObject([{ title: "G3", status: "archived" }]);
    expect(await deleteObjectiveAction(o)).toMatchObject({ ok: true });
    expect(await deleteGoalAction(g)).toMatchObject({ ok: true });
    expect(await deleteGoalAction(g)).toMatchObject({ ok: false });
    expect(await h().select().from(projects)).toHaveLength(1); // projects survive
  });

  it("checks the owner on every action", async () => {
    allowed.owner = false;
    for (const call of [() => saveVisionAction("x"), () => saveGoalAction({}), () => deleteGoalAction("x"), () => saveObjectiveAction({}), () => deleteObjectiveAction("x"), () => linkProjectAction("x", "y"), () => unlinkProjectAction("x")]) {
      await expect(call()).rejects.toThrow("Not owner");
    }
  });

  it("goals.overview gives the agent a private read-only summary", async () => {
    const g = await ok(saveGoalAction({ title: "Run a half-marathon" }));
    const o = await ok(saveObjectiveAction({ goalId: g, title: "25 km a week" }));
    const p = await project("Training");
    await ok(linkProjectAction(o, p));
    const blocker = await task(p, "Buy shoes", null);
    const b = await task(p, "Long run", null);
    await h().insert(taskDependencies).values({ taskId: b, blockedByTaskId: blocker });
    expect(TOOLS["goals.overview"]).toMatchObject({ tier: "READ", sideEffect: false, private: true });
    const r = await createRun(h(), { agentId: "goals", prompt: "How am I doing?" });
    if (!r.ok) throw new Error(r.code);
    const out = await callTool({ handle: h(), agentId: "goals", runId: r.runId, tools: TOOLS, now: () => NOW }, "goals.overview", { includeTasks: true }, "tu_1") as { status: string; output: { goals: { objectives: { projects: { openTasks: string[] }[] }[] }[] } };
    expect(out.status).toBe("ok");
    expect(out.output.goals[0]!.objectives[0]!.projects[0]!.openTasks).toEqual(expect.arrayContaining(["Buy shoes", "Long run (blocked)"]));
  });
});
