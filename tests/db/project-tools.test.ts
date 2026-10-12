import { beforeAll, describe, expect, it, vi } from "vitest";
import { callTool } from "@/server/agents/gateway";
import { projectTools } from "@/server/agents/tools/projects";
import { agentRuns, milestones, projects, tasks } from "@/server/db/schema";
import { setupTestDb } from "./helpers";

vi.mock("@/server/agents/registry", () => ({
  getAgent: () => ({ id: "projects", name: "Projects", live: true, tools: Object.keys(projectTools) }),
}));

const t = setupTestDb();
const NOW = new Date("2026-10-05T00:00:00Z");
const PATH = "C:\\secret\\workspace\\lifeos";
let runId = "";
const call = (name: string, input: unknown) =>
  callTool({ handle: t.handle(), runId, agentId: "projects", tools: projectTools, now: () => NOW }, name, input, `tu_${Math.random()}`);
const output = (r: Awaited<ReturnType<typeof call>>) => (r as { output: Record<string, unknown> }).output;

beforeAll(async () => {
  const h = t.handle();
  const [r] = await h.insert(agentRuns).values({ agentId: "projects", prompt: "p", model: "m" }).returning();
  runId = r!.id;
  const [p] = await h.insert(projects).values({ name: "LifeOS", workspacePath: PATH, workspaceMachine: "desktop-box" }).returning();
  await h.insert(projects).values({ name: "Old", status: "archived" });
  const [m] = await h.insert(milestones).values({ projectId: p!.id, title: "M1" }).returning();
  await h.insert(tasks).values({ projectId: p!.id, milestoneId: m!.id, title: "t".repeat(5000) });
});

describe("projects tools", () => {
  it("projects.list and projects.get are READ, side-effect free", () => {
    for (const x of [projectTools["projects.list"], projectTools["projects.get"]]) expect(x).toMatchObject({ tier: "READ", sideEffect: false });
  });

  it("projects.list excludes archived by default, all includes them, limit caps", async () => {
    const names = (r: Awaited<ReturnType<typeof call>>) => (output(r).items as { name: string }[]).map((i) => i.name).sort();
    expect(names(await call("projects.list", {}))).toEqual(["LifeOS"]);
    expect(names(await call("projects.list", { status: "all" }))).toEqual(["LifeOS", "Old"]);
    expect(names(await call("projects.list", { status: "archived" }))).toEqual(["Old"]);
    expect((output(await call("projects.list", { status: "all", limit: 1 })).items as unknown[]).length).toBe(1);
    expect(await call("projects.list", { limit: 51 })).toHaveProperty("error");
  });

  it("projects.get by name (case-insensitive) and by id; never leaks the workspace path", async () => {
    const byName = output(await call("projects.get", { project: "lifeos" }));
    const id = (byName.project as { id: string }).id;
    const byId = output(await call("projects.get", { project: id }));
    expect(byId.project).toEqual(byName.project);
    for (const o of [byName, byId]) {
      const s = JSON.stringify(o);
      expect(s).not.toContain("secret");
      expect(s).not.toContain("desktop-box");
    }
    const task = (byName.tasks as { title: string }[])[0]!;
    expect(task.title.length).toBe(2000);
    expect((byName.milestones as unknown[]).length).toBe(1);
    expect((byName.project as { context: string }).context).toBe("");
  });

  it("unknown project -> not_found; wildcard names do not match", async () => {
    expect(await call("projects.get", { project: "nope" })).toHaveProperty("error");
    expect(await call("projects.get", { project: "%" })).toHaveProperty("error");
  });
});
