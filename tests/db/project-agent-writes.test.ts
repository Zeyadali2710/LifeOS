import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectCreatePayload } from "@/lib/project-payload";
import { decide, executeApproved, listApprovals, retryApproval } from "@/server/agents/approvals";
import { callTool } from "@/server/agents/gateway";
import { advance, createRun, runQueued } from "@/server/agents/loop";
import { TOOLS } from "@/server/agents/tools";
import { createThread } from "@/server/agents/threads";
import {
  activityEvents, agentRuns, approvals, auditLog, githubRepos, milestones, notifications, projectLinks, projects, settings, taskDependencies, tasks, toolCalls,
} from "@/server/db/schema";
import { saveToken } from "@/server/github/connections";
import { createProject } from "@/server/projects";
import contentsReadme from "../fixtures/github/contents-readme.json";
import contentsRoadmap from "../fixtures/github/contents-roadmap.json";
import tree from "../fixtures/github/tree.json";
import user from "../fixtures/github/user.json";
import { fakeGithub } from "../helpers/fake-github";
import { scriptedLlm } from "../helpers/fake-llm";
import { setupTestDb } from "./helpers";

const key = vi.hoisted(() => Buffer.alloc(32, 7).toString("base64"));
vi.mock("@/server/env", () => ({ env: () => ({ LIFEOS_MASTER_KEY: key }) }));

const t = setupTestDb();
const h = () => t.handle();
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const noop = async () => {};
const gh = fakeGithub({
  "GET /user": () => json({ ...user, login: "me" }),
  "GET /user/repos": () => json([{ full_name: "me/studio" }]),
  "GET /repos/me/studio/git/trees/main": () => json(tree),
  "GET /repos/me/studio/contents/README.md": () => json(contentsReadme),
  "GET /repos/me/studio/contents/docs/ROADMAP.md": () => json(contentsRoadmap),
});

beforeEach(async () => {
  await h().delete(agentRuns); // cascades tool_calls and approvals
  await h().delete(tasks);
  await h().delete(projects);
  await h().delete(settings);
  await h().delete(activityEvents);
  await h().delete(notifications);
  await h().delete(auditLog);
  await h().delete(githubRepos);
  await saveToken(h(), "github_read", "read_token_0001", { key: Buffer.from(key, "base64"), fetch: gh });
  await h().insert(githubRepos).values({ id: 7, fullName: "me/studio", private: false, defaultBranch: "main", htmlUrl: "u", pushedAt: new Date() });
});

async function newRun(prompt = "p") {
  const threadId = await createThread(h(), "t");
  const r = await createRun(h(), { agentId: "projects", prompt, threadId });
  if (!r.ok) throw new Error(r.code);
  return r.runId;
}
const call = async (name: string, input: unknown, runId?: string) =>
  callTool({ handle: h(), runId: runId ?? (await newRun()), agentId: "projects", tools: TOOLS, fetch: gh }, name, input, `tu_${Math.random()}`);
const err = (r: Awaited<ReturnType<typeof call>>) => (r as { error: string }).error;
const apId = (r: Awaited<ReturnType<typeof call>>) => {
  expect(r.status).toBe("waiting_approval");
  return (r as { approvalId: string }).approvalId;
};
const count = async (table: typeof projects | typeof tasks | typeof milestones | typeof projectLinks | typeof taskDependencies | typeof approvals) => (await h().select().from(table)).length;
const markers = () => h().select().from(auditLog).where(eq(auditLog.actor, "agent:projects"));
const row = async (id: string) => (await h().select().from(approvals).where(eq(approvals.id, id)))[0]!;
const approve = async (id: string, edited?: unknown) => {
  expect((await decide(h(), id, "approve", { enqueue: noop, edited })).ok).toBe(true);
  return executeApproved(h(), id, { fetch: gh });
};

const draft = {
  name: "Studio",
  description: "d",
  context: "ctx text",
  milestones: [{ ref: "m1", title: "MVP" }, { ref: "m2", title: "Launch" }],
  tasks: [
    { ref: "t1", title: "Build", milestoneRef: "m1" },
    { ref: "t2", title: "Ship", milestoneRef: "m2", blockedBy: ["t1"] },
  ],
  links: [{ kind: "repo", repo: "me/studio" }, { kind: "url", label: "Docs", url: "https://example.com/d" }],
};

describe("projects.create", () => {
  it("proposes exactly one approval and writes nothing", async () => {
    const id = apId(await call("projects.create", { ...draft, reason: "r", sources: ["lie"] }));
    expect(await count(projects)).toBe(0);
    expect(await count(approvals)).toBe(1);
    const ap = await row(id);
    expect(ap.tool).toBe("projects.create");
    expect(projectCreatePayload.parse(ap.originalPayload)).toMatchObject({ name: "Studio", sources: [] });
    expect(ap.reason).toBe("r");
  });

  it("rejects an unknown repository link at call time", async () => {
    const r = await call("projects.create", { ...draft, links: [{ kind: "repo", repo: "me/nope" }] });
    expect(r.status).toBe("error");
    expect(err(r)).toContain("Unknown repository me/nope");
    expect(await count(approvals)).toBe(0);
  });

  it.each([
    ["dangling milestoneRef", { tasks: [{ ref: "a", title: "x", milestoneRef: "m9" }] }, ["milestoneRef", "m9"]],
    ["self-blocking task", { tasks: [{ ref: "a", title: "x", blockedBy: ["a"] }] }, ["blockedBy", "block itself"]],
    ["duplicate repo link", { links: [{ kind: "repo", repo: "me/studio" }, { kind: "repo", repo: "me/studio" }] }, ["links", "already in the draft"]],
  ])("%s comes back as a tool error and creates no approval", async (_n, patch, words) => {
    const r = await call("projects.create", { ...draft, ...patch });
    expect(r.status).toBe("error");
    for (const w of words) expect(err(r)).toContain(w);
    expect(await count(approvals)).toBe(0);
  });

  it("a run that hits a bad ref keeps going and completes", async () => {
    const runId = await newRun();
    const llm = scriptedLlm([{ toolUses: [{ name: "projects.create", input: { ...draft, tasks: [{ title: "x", milestoneRef: "m9" }] } }] }, { text: "done" }]);
    expect(await advance(runId, { handle: h(), llm, fetch: gh })).toBe("completed");
    expect(await count(approvals)).toBe(0);
  });

  it("the handler refuses to run without an approval", async () => {
    await expect(TOOLS["projects.create"]!.handler(draft, { handle: h(), runId: "r", agentId: "projects", toolUseId: "x", now: () => new Date() })).rejects.toThrow(
      "Project changes require an approval.",
    );
  });

  it("approval creates the project, milestones, mapped tasks, links and dependencies", async () => {
    const id = apId(await call("projects.create", draft));
    const out = await approve(id);
    expect(out.status).toBe("executed");
    const [p] = await h().select().from(projects);
    expect(p).toMatchObject({ name: "Studio", context: "ctx text", workspacePath: null });
    expect(out).toMatchObject({ result: { projectId: p!.id, name: "Studio", url: `/projects/${p!.id}`, counts: { milestones: 2, tasks: 2, links: 2, deps: 1 } } });
    const ms = await h().select().from(milestones).orderBy(milestones.sortOrder);
    expect(ms.map((m) => m.title)).toEqual(["MVP", "Launch"]);
    const ts = await h().select().from(tasks);
    expect(ts.find((x) => x.title === "Ship")!.milestoneId).toBe(ms[1]!.id);
    expect(ts.find((x) => x.title === "Build")!.milestoneId).toBe(ms[0]!.id);
    const links = await h().select().from(projectLinks);
    expect(links.map((l) => l.kind).sort()).toEqual(["repo", "url"]);
    expect(links.find((l) => l.kind === "repo")!.repoId).toBe(7);
    expect(await count(taskDependencies)).toBe(1);
    expect(await markers()).toHaveLength(1);
  });

  it("an invalid item at execute time rolls everything back", async () => {
    const cyc = { ...draft, tasks: [{ ref: "a", title: "A", blockedBy: ["b"] }, { ref: "b", title: "B", blockedBy: ["a"] }] };
    const id = apId(await call("projects.create", cyc));
    const out = await approve(id);
    expect(out.status).toBe("failed");
    expect(await row(id)).toMatchObject({ status: "failed", ambiguous: false });
    for (const tbl of [projects, milestones, tasks, projectLinks, taskDependencies] as const) expect(await count(tbl)).toBe(0);
    expect(await markers()).toHaveLength(0);
  });

  it("an ambiguous retry adopts the stored result instead of creating a second project", async () => {
    const id = apId(await call("projects.create", draft));
    const first = await approve(id);
    await h().update(approvals).set({ status: "failed", ambiguous: true }).where(eq(approvals.id, id));
    expect((await retryApproval(h(), id, { enqueue: noop })).ok).toBe(true);
    const again = await executeApproved(h(), id, { fetch: gh });
    expect(again).toEqual(first);
    expect(await count(projects)).toBe(1);
    expect(await count(tasks)).toBe(2);
  });
});

async function seed() {
  const c = await createProject(h(), { name: "Live", description: "desc", context: "keep ctx", status: "paused", workspacePath: "/home/me/live", workspaceMachine: "box", blockerNote: "bn" }, new Date());
  if (!c.ok) throw new Error("seed");
  const pid = c.project.id;
  const [m] = await h().insert(milestones).values({ projectId: pid, title: "M0", sortOrder: 1 }).returning();
  const [a] = await h()
    .insert(tasks)
    .values({ projectId: pid, milestoneId: m!.id, title: "Old", notes: "keep notes", dueDate: "2030-02-01", dueTime: "09:30", remindAt: new Date("2030-01-01T00:00:00Z") })
    .returning();
  return { pid, mid: m!.id, tid: a!.id };
}

describe("projects.update", () => {
  it("rejects unknown projects and items of other projects at call time", async () => {
    const s = await seed();
    expect(err(await call("projects.update", { project: "nope" }))).toContain("Unknown project");
    const other = await createProject(h(), { name: "Other" }, new Date());
    if (!other.ok) throw new Error("x");
    const [ot] = await h().insert(tasks).values({ projectId: other.project.id, title: "theirs" }).returning();
    const r = await call("projects.update", { project: s.pid, tasks: [{ id: ot!.id, title: "hijack" }] });
    expect(r.status).toBe("error");
    expect(err(r)).toContain("doesn't belong");
    expect(await count(approvals)).toBe(0);
  });

  it("carries a server-built before and the resolved project id", async () => {
    const s = await seed();
    const id = apId(await call("projects.update", { project: "live", changes: { name: "Live 2" }, tasks: [{ id: s.tid, title: "New title" }] }));
    const p = (await row(id)).originalPayload as { projectId: string; before: { name: string; updatedAt: string; tasks: { id: string }[] } };
    expect(p.projectId).toBe(s.pid);
    expect(p.before).toMatchObject({ name: "Live" });
    expect(p.before.tasks.map((x) => x.id)).toEqual([s.tid]);
  });

  it("merges onto the current rows: rename keeps workspace, notes, reminders", async () => {
    const s = await seed();
    const id = apId(await call("projects.update", { project: s.pid, changes: { name: "Renamed" }, tasks: [{ id: s.tid, title: "Retitled" }] }));
    expect((await approve(id)).status).toBe("executed");
    const [p] = await h().select().from(projects).where(eq(projects.id, s.pid));
    expect(p).toMatchObject({ name: "Renamed", workspacePath: "/home/me/live", workspaceMachine: "box", blockerNote: "bn", status: "paused", context: "keep ctx" });
    const [tk] = await h().select().from(tasks).where(eq(tasks.id, s.tid));
    expect(tk).toMatchObject({ title: "Retitled", notes: "keep notes", dueTime: "09:30", dueDate: "2030-02-01", milestoneId: s.mid });
    expect(tk!.remindAt!.toISOString()).toBe("2030-01-01T00:00:00.000Z");
  });

  it("a dangling blockedBy is a tool error, no approval, and the run keeps going", async () => {
    const s = await seed();
    const runId = await newRun();
    const llm = scriptedLlm([{ toolUses: [{ name: "projects.update", input: { project: s.pid, tasks: [{ title: "n", blockedBy: ["ghost"] }] } }] }, { text: "done" }]);
    expect(await advance(runId, { handle: h(), llm, fetch: gh })).toBe("completed");
    expect(await count(approvals)).toBe(0);
    const r = await call("projects.update", { project: s.pid, tasks: [{ title: "n", blockedBy: ["ghost"] }] });
    expect(err(r)).toContain("blockedBy");
    expect(err(r)).toContain("ghost");
  });

  it("refuses a project that changed after drafting", async () => {
    const s = await seed();
    const id = apId(await call("projects.update", { project: s.pid, changes: { name: "X" } }));
    await h().update(projects).set({ updatedAt: new Date(Date.now() + 5000) }).where(eq(projects.id, s.pid));
    const out = await approve(id);
    expect(out).toMatchObject({ status: "failed", error: "This project changed after the request was prepared, so it can't be applied." });
    expect((await h().select().from(projects).where(eq(projects.id, s.pid)))[0]!.name).toBe("Live");
  });

  it("WR-03: refuses (and flags) a draft whose task was edited after drafting", async () => {
    const s = await seed();
    const id = apId(await call("projects.update", { project: s.pid, tasks: [{ id: s.tid, title: "Agent title" }] }));
    expect((await listApprovals(h(), "pending")).find((a) => a.id === id)!.targetChanged).toBe(false);
    await h().update(tasks).set({ title: "Owner title" }).where(eq(tasks.id, s.tid));
    expect((await listApprovals(h(), "pending")).find((a) => a.id === id)!.targetChanged).toBe(true);
    expect(await approve(id)).toMatchObject({ status: "failed", error: "This project changed after the request was prepared, so it can't be applied." });
    expect((await h().select().from(tasks).where(eq(tasks.id, s.tid)))[0]!.title).toBe("Owner title");
  });

  it("adds tasks, milestones, links and a dependency on an existing task; retry adopts", async () => {
    const s = await seed();
    const id = apId(
      await call("projects.update", {
        project: s.pid,
        milestones: [{ ref: "m1", title: "Next" }],
        tasks: [{ ref: "n1", title: "Fresh", milestoneRef: "m1", blockedBy: [s.tid] }],
        links: [{ kind: "repo", repo: "me/studio" }],
      }),
    );
    const first = await approve(id);
    expect(first.status).toBe("executed");
    expect(await count(taskDependencies)).toBe(1);
    expect(await count(projectLinks)).toBe(1);
    expect(await count(milestones)).toBe(2);
    await h().update(approvals).set({ status: "failed", ambiguous: true }).where(eq(approvals.id, id));
    await retryApproval(h(), id, { enqueue: noop });
    expect(await executeApproved(h(), id, { fetch: gh })).toEqual(first);
    expect(await count(tasks)).toBe(2);
  });
});

describe("studio flow", () => {
  it("WR-02: sources include a sibling run's untrusted reads (issue titles too)", async () => {
    const parent = await newRun();
    const mk = async () => (await h().insert(agentRuns).values({ agentId: "projects", prompt: "p", model: "m", parentRunId: parent }).returning())[0]!.id;
    const reader = await mk();
    await h().insert(toolCalls).values({ runId: reader, toolUseId: "x1", kind: "tool", tool: "github.list_issues", tier: "READ", status: "done", seq: 1, input: { repo: "me/studio" } });
    const id = apId(await call("projects.create", { name: "Studio" }, await mk()));
    expect((await row(id)).originalPayload).toMatchObject({ sources: ["me/studio · (issue list)"] });
  });
  it("studio: list_tree, parallel get_file, one create, owner edits a task out, approve, resume", async () => {
    const runId = await newRun("Create a project from me/studio");
    const create = {
      ...draft,
      sources: ["model lies"],
      tasks: [
        { ref: "t1", title: "One", milestoneRef: "m1" },
        { ref: "t2", title: "Two", milestoneRef: "m1" },
        { ref: "t3", title: "Three", milestoneRef: "m2" },
        { ref: "t4", title: "Four", milestoneRef: "m2" },
        { ref: "t5", title: "Five", milestoneRef: "m2" },
      ],
    };
    const llm = scriptedLlm([
      { toolUses: [{ name: "github.list_tree", input: { repo: "me/studio" } }] },
      {
        toolUses: [
          { name: "github.get_file", input: { repo: "me/studio", path: "README.md" } },
          { name: "github.get_file", input: { repo: "me/studio", path: "docs/ROADMAP.md" } },
        ],
      },
      { toolUses: [{ name: "projects.create", input: create }] },
      (params) => {
        const last = params.messages.at(-1)!.content as { type: string; content: string }[];
        const url = /"url":"([^"]+)"/.exec(last.map((b) => b.content).join(""))?.[1];
        return { text: `Created Studio: ${url}` };
      },
    ]);
    expect(await advance(runId, { handle: h(), llm, fetch: gh })).toBe("waiting_approval");
    const aps = await h().select().from(approvals).where(eq(approvals.runId, runId));
    expect(aps).toHaveLength(1);
    const payload = aps[0]!.originalPayload as { sources: string[]; tasks: { ref: string }[] };
    expect(payload.sources).toEqual(["me/studio · (file list)", "me/studio · README.md", "me/studio · docs/ROADMAP.md"]);
    const edited = { ...payload, tasks: payload.tasks.filter((x) => x.ref !== "t3") };
    expect((await approve(aps[0]!.id, edited)).status).toBe("executed");
    expect(await runQueued(h(), runId, { llm, fetch: gh })).toBe("completed");
    const [p] = await h().select().from(projects);
    expect(await count(tasks)).toBe(4);
    expect(await count(milestones)).toBe(2);
    expect((await h().select().from(projectLinks).where(and(eq(projectLinks.projectId, p!.id), eq(projectLinks.kind, "repo")))).length).toBe(1);
    const [r] = await h().select().from(agentRuns).where(eq(agentRuns.id, runId));
    expect(r!.answer).toContain(`/projects/${p!.id}`);
  });
});
