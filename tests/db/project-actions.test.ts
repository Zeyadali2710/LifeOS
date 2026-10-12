import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activityEvents, auditLog, githubRepos, milestones, projectLinks, projects, taskDependencies, tasks } from "@/server/db/schema";
import { blockedProjectIds } from "@/server/project-blockers";
import {
  addLink,
  addProjectDependency,
  createMilestone,
  createProject,
  deleteMilestone,
  deleteProject,
  removeLink,
  setMilestoneDone,
  setProjectArchived,
  updateProject,
} from "@/server/projects";
import { setTaskCompleted } from "@/server/tasks";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const h = () => t.handle();
const NOW = new Date("2026-10-05T00:00:00Z");
const events = async (type: string) => (await h().select().from(activityEvents).where(eq(activityEvents.type, type))).length;
const audits = async (id: string) => await h().select().from(auditLog).where(eq(auditLog.target, id));

async function mk(name = "p") {
  const r = await createProject(h(), { name }, NOW);
  if (!r.ok) throw new Error("create failed");
  return r.project;
}
let repoSeq = 5000;
async function mkRepo() {
  const id = repoSeq++;
  await h().insert(githubRepos).values({ id, fullName: `me/r${id}` });
  return id;
}

describe("projects", () => {
  it("creates with audit {id} only and a created event", async () => {
    const before = await events("project.created");
    const p = await mk("secret name");
    expect(await events("project.created")).toBe(before + 1);
    const a = await audits(p.id);
    expect(a.map((x) => x.action)).toEqual(["project.create"]);
    expect(a[0]!.metadata).toEqual({ id: p.id });
  });

  it("validates name and workspacePath", async () => {
    expect(await createProject(h(), { name: "" }, NOW)).toEqual({ ok: false, errors: { name: "Give the project a name." } });
    const r = await createProject(h(), { name: "x", workspacePath: "C:\\a$b" }, NOW);
    expect(r.ok === false && "errors" in r && r.errors.workspacePath).toBeTruthy();
  });

  it("update not_found; archive emits once, unarchive emits nothing", async () => {
    expect(await updateProject(h(), "00000000-0000-4000-8000-000000000000", { name: "x" }, NOW)).toEqual({ ok: false, error: "not_found" });
    const p = await mk();
    const before = await events("project.archived");
    await setProjectArchived(h(), p.id, true, NOW);
    expect(await events("project.archived")).toBe(before + 1);
    const un = await setProjectArchived(h(), p.id, false, NOW);
    expect(un.ok && "project" in un && un.project.status).toBe("active");
    expect(await events("project.archived")).toBe(before + 1);
  });

  it("delete is refused with linked data unless confirmed; tasks survive unlinked", async () => {
    const p = await mk();
    const [task] = await h().insert(tasks).values({ title: "keep", projectId: p.id }).returning();
    await createMilestone(h(), p.id, { title: "m" }, NOW);
    const refused = await deleteProject(h(), p.id, false);
    expect(refused).toEqual({ ok: false, error: "has_linked_data", counts: { tasks: 1, milestones: 1, links: 0, dependencies: 0 } });
    expect((await h().select().from(projects).where(eq(projects.id, p.id))).length).toBe(1);
    expect(await deleteProject(h(), p.id, true)).toEqual({ ok: true });
    expect((await h().select().from(tasks).where(eq(tasks.id, task!.id)))[0]!.projectId).toBeNull();
  });

  it("a project whose only linked data is a dependency edge needs confirmation, then deletes (CR-01)", async () => {
    const a = await mk("dep-a");
    const b = await mk("dep-b");
    expect(await addProjectDependency(h(), b.id, a.id, NOW)).toEqual({ ok: true });
    expect(await deleteProject(h(), a.id, false)).toEqual({ ok: false, error: "has_linked_data", counts: { tasks: 0, milestones: 0, links: 0, dependencies: 1 } });
    expect(await deleteProject(h(), a.id, true)).toEqual({ ok: true });
  });

  it("an empty project deletes without confirmation", async () => {
    const empty = await mk("empty");
    expect(await deleteProject(h(), empty.id, false)).toEqual({ ok: true });
    expect(await deleteProject(h(), empty.id, false)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("milestones", () => {
  it("create/not_found, done emits once, delete", async () => {
    expect(await createMilestone(h(), "00000000-0000-4000-8000-000000000000", { title: "m" }, NOW)).toEqual({ ok: false, error: "not_found" });
    const p = await mk("ms");
    const m = await createMilestone(h(), p.id, { title: "Ship" }, NOW);
    if (!m.ok || !("id" in m)) throw new Error("create failed");
    const before = await events("project.milestone_done");
    await setMilestoneDone(h(), m.id, true, NOW);
    await setMilestoneDone(h(), m.id, true, NOW);
    expect(await events("project.milestone_done")).toBe(before + 1);
    expect((await h().select().from(milestones).where(eq(milestones.id, m.id)))[0]!.completedAt).toEqual(NOW);
  });

  it("milestone audit rows carry {id} only; delete works", async () => {
    const p = await mk("ms2");
    const m = await createMilestone(h(), p.id, { title: "Ship" }, NOW);
    if (!m.ok || !("id" in m)) throw new Error("create failed");
    expect((await audits(m.id)).every((a) => (a.metadata as { id: string }).id === m.id)).toBe(true);
    expect(await deleteMilestone(h(), m.id)).toEqual({ ok: true });
  });
});

describe("links", () => {
  it("repo link validation, duplicate, url scheme, remove", async () => {
    const p = await mk("links");
    expect(await addLink(h(), p.id, { kind: "repo", repoId: 999999 }, NOW)).toEqual({ ok: false, errors: { repoId: "Pick a synced repository." } });
    const repoId = await mkRepo();
    const a = await addLink(h(), p.id, { kind: "repo", repoId }, NOW);
    expect(a.ok).toBe(true);
    expect(await addLink(h(), p.id, { kind: "repo", repoId }, NOW)).toEqual({ ok: false, errors: { repoId: "Already linked." } });
  });

  it("url links reject non-http schemes and can be removed", async () => {
    const p = await mk("urls");
    const bad = await addLink(h(), p.id, { kind: "url", label: "x", url: "javascript:alert(1)" }, NOW);
    expect(bad.ok === false && "errors" in bad && bad.errors.url).toBeTruthy();
    const u = await addLink(h(), p.id, { kind: "url", label: "Docs", url: "https://example.com" }, NOW);
    if (!u.ok || !("id" in u)) throw new Error("link failed");
    expect(await removeLink(h(), u.id)).toEqual({ ok: true });
    expect((await h().select().from(projectLinks).where(eq(projectLinks.projectId, p.id))).length).toBe(0);
  });
});

describe("blocker loader", () => {
  it("project with an open task blocked by an open task is blocked until it completes", async () => {
    const p = await mk("blk");
    const [a] = await h().insert(tasks).values({ title: "a", projectId: p.id }).returning();
    const [b] = await h().insert(tasks).values({ title: "b" }).returning();
    await h().insert(taskDependencies).values({ taskId: a!.id, blockedByTaskId: b!.id });
    expect((await blockedProjectIds(h(), [p.id], NOW)).has(p.id)).toBe(true);
    await setTaskCompleted(h(), b!.id, true, NOW);
    expect((await blockedProjectIds(h(), [p.id], NOW)).has(p.id)).toBe(false);
  });
});
