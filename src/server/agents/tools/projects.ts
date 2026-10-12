// LifeOS project reads (D-17): READ-only, bounded, and picked field by field so the workspace path,
// machine label, launch command and brief never reach the model. Owner-private: taints the run (D-09).
import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { draftCounts, projectCreatePayload, projectUpdatePayload, type DraftLink, type ProjectUpdatePayload } from "@/lib/project-payload";
import type { DB } from "../../db/client";
import { auditLog, githubRepos, milestones, projectLinks, projects, tasks, toolCalls } from "../../db/schema";
import { listProjects, loadProject } from "../../project-queries";
import { addLink, addTaskDependency, createMilestone, createProject, updateMilestone, updateProject } from "../../projects";
import { createTask, updateTask } from "../../tasks";
import { CONTENT_TOOLS, contentScope } from "../policy";
import { ToolError, type Tool, type ToolContext } from "../types";

const MAX_STR = 2000;
const cut = (s: string | null | undefined) => (s ?? "").slice(0, MAX_STR);
const limit = z.number().int().min(1).max(50).default(20);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const out = z.record(z.string(), z.unknown());

const listTool: Tool<{ status?: "active" | "paused" | "done" | "archived" | "all"; limit: number }, Record<string, unknown>> = {
  name: "projects.list",
  label: "Reading your projects",
  description: "List the owner's LifeOS projects with progress, health and next task. Archived projects are excluded unless status is 'all' or 'archived'.",
  input: z.object({ status: z.enum(["active", "paused", "done", "archived", "all"]).optional(), limit }),
  output: out,
  tier: "READ",
  sideEffect: false,
  private: true,
  async handler(i, ctx) {
    const items = (await listProjects(ctx.handle, ctx.now()))
      .filter((c) => (i.status && i.status !== "all" ? c.project.status === i.status : i.status === "all" || c.project.status !== "archived"))
      .slice(0, i.limit)
      .map((c) => ({
        id: c.project.id,
        name: cut(c.project.name),
        category: c.project.category,
        status: c.project.status,
        priority: c.project.priority,
        targetDate: c.project.targetDate,
        progressPct: c.progress.pct,
        health: c.health,
        openTasks: c.openTasks,
        blocked: c.blocked,
        nextTask: c.nextTask ? { title: cut(c.nextTask.title), dueDate: c.nextTask.dueDate } : null,
      }));
    return { items };
  },
};

const getTool: Tool<{ project: string }, Record<string, unknown>> = {
  name: "projects.get",
  label: "Opening a project",
  description: "Get one LifeOS project by id or exact name: tasks, milestones, blockers, links, health.",
  input: z.object({ project: z.string().min(1).max(200) }),
  output: out,
  tier: "READ",
  sideEffect: false,
  private: true,
  async handler(i, ctx) {
    const where = UUID.test(i.project) ? eq(projects.id, i.project) : ilike(projects.name, escapeLike(i.project));
    const [row] = await ctx.handle.select({ id: projects.id }).from(projects).where(where).limit(1);
    const w = row ? await loadProject(ctx.handle, row.id, ctx.now()) : null;
    if (!w) throw new ToolError("not_found", `Unknown project ${cut(i.project).slice(0, 80)}`);
    const p = w.project;
    return {
      project: {
        id: p.id,
        name: cut(p.name),
        description: cut(p.description),
        context: cut(p.context),
        category: p.category,
        status: p.status,
        priority: p.priority,
        targetDate: p.targetDate,
      },
      progress: w.progress,
      health: w.health,
      healthReason: w.healthReason,
      tasks: w.tasks.slice(0, 50).map((t) => ({ id: t.id, title: cut(t.title), dueDate: t.dueDate, priority: t.priority, completed: t.completedAt !== null, milestoneId: t.milestoneId })),
      milestones: w.milestones.slice(0, 30).map((m) => ({ id: m.id, title: cut(m.title), dueDate: m.dueDate, completed: m.completedAt !== null, taskCount: m.taskCount, doneCount: m.doneCount })),
      blockers: w.blockers.slice(0, 30).map((b) => ({ kind: b.kind, label: cut(b.label) })),
      links: w.links.slice(0, 30).map((l) => (l.kind === "repo" ? { kind: "repo", fullName: l.repo.fullName, ci: l.repo.ci } : { kind: "url", label: cut(l.label), url: cut(l.url) })),
      dependsOn: w.dependsOn.map((d) => ({ id: d.id, name: cut(d.name), status: d.status })),
      blockerNote: cut(p.blockerNote),
    };
  },
};

// ---- writes (phase 5.1): one composite APPROVE tool per kind; nothing is written before the owner approves ----
const NEEDS_APPROVAL = "Project changes require an approval.";
const CHANGED = "This project changed after the request was prepared, so it can't be applied.";
const needApproval = (ctx: ToolContext) => {
  if (!ctx.approvalId) throw new ToolError("not_allowed", NEEDS_APPROVAL);
};
const reason = z.string().max(500).optional();
const writeOut = z.object({
  projectId: z.string(),
  name: z.string(),
  url: z.string(),
  counts: z.object({ milestones: z.number(), tasks: z.number(), links: z.number(), deps: z.number(), fields: z.number() }),
});
type WriteOut = z.infer<typeof writeOut>;

/** Server-built provenance: untrusted reads in the same scope as the gateway's content floor, never model-supplied (D-15). */
async function runSources(ctx: ToolContext): Promise<string[]> {
  const rows = await ctx.handle
    .select({ tool: toolCalls.tool, input: toolCalls.input })
    .from(toolCalls)
    .where(and(sql`${toolCalls.runId} in ${contentScope(ctx.runId)}`, eq(toolCalls.status, "done"), inArray(toolCalls.tool, [...CONTENT_TOOLS])))
    .orderBy(asc(toolCalls.startedAt), asc(toolCalls.seq));
  const label = (tool: string, i: { repo?: string; path?: string; prefix?: string; number?: number }) => {
    if (tool === "github.get_file") return `${i.repo} · ${i.path}`;
    if (tool === "github.list_tree") return `${i.repo} · (file list${i.prefix ? `: ${i.prefix}` : ""})`;
    if (tool === "github.get_pull_request") return `${i.repo} · (pull request #${i.number})`;
    if (tool === "github.list_pull_requests") return `${i.repo ?? "all repos"} · (pull request list)`;
    if (tool === "github.recent_commits") return `${i.repo ?? "all repos"} · (commit messages)`;
    return `${i.repo ?? "all repos"} · (issue list)`;
  };
  const all = rows.map((r) => {
    const s = label(r.tool, (r.input ?? {}) as Parameters<typeof label>[1]);
    return s.length > 300 ? `${s.slice(0, 299)}…` : s;
  });
  return [...new Set(all)].slice(0, 50);
}

/** Model-facing message for the first schema issue, with the offending ref value for ref paths. */
function badDraft(issues: z.core.$ZodIssue[], raw: unknown): ToolError {
  const issue = issues[0]!;
  const path = issue.path.map(String);
  let msg = `${path.join(".")}: ${issue.message}`;
  if (["milestoneRef", "blockedBy"].includes(path[path.length - 1] ?? "")) {
    const v = path.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], raw);
    msg += ` (got ${JSON.stringify(v)})`;
  }
  return new ToolError("invalid_input", msg);
}

async function checkRepos(h: DB, links: DraftLink[]) {
  for (const l of links) {
    if (l.kind !== "repo") continue;
    const [r] = await h.select({ id: githubRepos.id }).from(githubRepos).where(eq(githubRepos.fullName, l.repo));
    if (!r) throw new ToolError("not_found", `Unknown repository ${l.repo}`);
  }
}

/** WR-03: did any task or milestone captured in `before` change (or vanish) since drafting? Edits to them don't bump the project. */
export async function itemsChanged(h: DB, before: Pick<ProjectUpdatePayload["before"], "milestones" | "tasks">): Promise<boolean> {
  const mIds = before.milestones.map((m) => m.id);
  const tIds = before.tasks.map((t) => t.id);
  const cm = mIds.length ? await h.select({ id: milestones.id, title: milestones.title, dueDate: milestones.dueDate }).from(milestones).where(inArray(milestones.id, mIds)) : [];
  const ct = tIds.length
    ? await h.select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate, priority: tasks.priority, milestoneId: tasks.milestoneId }).from(tasks).where(inArray(tasks.id, tIds))
    : [];
  const same = (a: Record<string, unknown>, b: Record<string, unknown> | undefined) => !!b && Object.keys(a).every((k) => a[k] === b[k]);
  return !before.milestones.every((m) => same(m, cm.find((x) => x.id === m.id))) || !before.tasks.every((t) => same(t, ct.find((x) => x.id === t.id)));
}

/** Server functions return {ok:false}; throwing makes the surrounding transaction roll back (Pitfall 1). */
function must<T extends { ok: boolean }>(r: T, label: string): Extract<T, { ok: true }> {
  if (r.ok) return r as Extract<T, { ok: true }>;
  const f = r as unknown as { errors?: Record<string, string>; error?: string };
  throw new ToolError("invalid_input", `${label}: ${f.errors ? (Object.values(f.errors)[0] ?? "invalid") : (f.error ?? "invalid")}`);
}

async function applyDraft(ctx: ToolContext, kind: "create" | "update", raw: Record<string, unknown>): Promise<WriteOut> {
  needApproval(ctx);
  const parsed = (kind === "create" ? projectCreatePayload : projectUpdatePayload).safeParse({ ...raw, sources: [] });
  if (!parsed.success) throw badDraft(parsed.error.issues, raw);
  const p = parsed.data;
  const action = kind === "create" ? "project.agent_create" : "project.agent_update";
  const now = ctx.now();
  return ctx.handle.transaction(async (txn) => {
    const tx = txn as unknown as DB;
    // D-11: an earlier attempt that landed left a marker keyed by this approval; return its result.
    const [mark] = await tx.select({ metadata: auditLog.metadata }).from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.target, ctx.approvalId!)));
    if (mark) return (mark.metadata as { result: WriteOut }).result;

    let projectId: string;
    let name: string;
    const mRefs = new Map<string, string>();
    const tRefs = new Map<string, string>();
    const taskIds: string[] = [];
    if ("projectId" in p) {
      projectId = p.projectId;
      const [cur] = await tx.select().from(projects).where(eq(projects.id, projectId));
      if (!cur) throw new ToolError("not_found", "That project no longer exists.");
      if (cur.updatedAt.toISOString() !== p.before.updatedAt || (await itemsChanged(tx, p.before))) throw new ToolError("invalid_input", CHANGED);
      const changes = Object.fromEntries(Object.entries(p.changes).filter(([, v]) => v !== undefined));
      // updateProject replaces the whole record: start from the current row so workspace, notes and status survive.
      const next = must(
        await updateProject(
          tx,
          projectId,
          {
            name: cur.name,
            description: cur.description,
            context: cur.context,
            category: cur.category,
            status: cur.status,
            priority: cur.priority,
            targetDate: cur.targetDate,
            workspacePath: cur.workspacePath,
            workspaceMachine: cur.workspaceMachine,
            blockerNote: cur.blockerNote,
            ...changes,
          },
          now,
        ),
        "Project",
      );
      name = next.project.name;
    } else {
      const c = must(
        await createProject(tx, { name: p.name, description: p.description, context: p.context, category: p.category, priority: p.priority, targetDate: p.targetDate }, now),
        "Project",
      );
      projectId = c.project.id;
      name = c.project.name;
    }

    const owned = async (table: typeof milestones | typeof tasks, ids: string[], what: string) => {
      if (!ids.length) return;
      const found = await tx.select({ id: table.id }).from(table).where(and(eq(table.projectId, projectId), inArray(table.id, ids)));
      if (found.length !== new Set(ids).size) throw new ToolError("not_found", `A ${what} in this request doesn't belong to the project.`);
    };
    const isUuid = (v: string | null | undefined): v is string => !!v && UUID.test(v);
    if ("projectId" in p) {
      await owned(milestones, [...p.milestones.map((m) => m.id).filter(isUuid), ...p.tasks.map((t) => t.milestoneRef).filter(isUuid)], "milestone");
      await owned(tasks, [...p.tasks.map((t) => t.id).filter(isUuid), ...p.tasks.flatMap((t) => (t.blockedBy ?? []).filter(isUuid))], "task");
    }
    const resolveRef = (map: Map<string, string>, ref: string, what: string) => {
      const id = map.get(ref) ?? (UUID.test(ref) ? ref : undefined);
      if (!id) throw new ToolError("invalid_input", `Unknown ${what} ref ${ref}`);
      return id;
    };

    for (const m of p.milestones) {
      const id = "id" in m ? m.id : undefined;
      let mid: string;
      if (id) {
        const [cm] = await tx.select().from(milestones).where(eq(milestones.id, id));
        must(await updateMilestone(tx, id, { title: m.title, dueDate: m.dueDate === undefined ? cm!.dueDate : m.dueDate }, now), "Milestone");
        mid = id;
      } else {
        mid = must(await createMilestone(tx, projectId, { title: m.title, dueDate: m.dueDate ?? null }, now), "Milestone").id;
      }
      if (m.ref) mRefs.set(m.ref, mid);
    }

    for (const t of p.tasks) {
      const id = "id" in t ? t.id : undefined;
      const milestoneId = t.milestoneRef ? resolveRef(mRefs, t.milestoneRef, "milestone") : null;
      let tid: string;
      if (id) {
        const [ct] = await tx.select().from(tasks).where(eq(tasks.id, id));
        const dueDate = t.dueDate === undefined ? ct!.dueDate : t.dueDate;
        must(
          await updateTask(
            tx,
            id,
            {
              title: t.title,
              notes: ct!.notes,
              dueDate,
              dueTime: dueDate ? ct!.dueTime : null,
              priority: t.priority === undefined ? ct!.priority : t.priority,
              remindAt: ct!.remindAt ? ct!.remindAt.toISOString() : null,
              projectId,
              milestoneId: t.milestoneRef === undefined ? ct!.milestoneId : milestoneId,
            },
            now,
          ),
          "Task",
        );
        tid = id;
      } else {
        tid = must(await createTask(tx, { title: t.title, dueDate: t.dueDate ?? null, priority: t.priority ?? null, projectId, milestoneId }, now), "Task").task.id;
      }
      taskIds.push(tid);
      if (t.ref) tRefs.set(t.ref, tid);
    }

    for (const l of p.links) {
      if (l.kind === "url") {
        must(await addLink(tx, projectId, l, now), "Link");
        continue;
      }
      const [r] = await tx.select({ id: githubRepos.id }).from(githubRepos).where(eq(githubRepos.fullName, l.repo));
      if (!r) throw new ToolError("not_found", `Unknown repository ${l.repo}`);
      // Re-linking a repo the project already has is a no-op (WR-04), not a failed approval.
      const [has] = await tx.select({ id: projectLinks.id }).from(projectLinks).where(and(eq(projectLinks.projectId, projectId), eq(projectLinks.repoId, r.id)));
      if (!has) must(await addLink(tx, projectId, { kind: "repo", repoId: r.id }, now), "Link");
    }

    for (const [i, t] of p.tasks.entries()) {
      for (const b of t.blockedBy ?? []) must(await addTaskDependency(tx, taskIds[i]!, resolveRef(tRefs, b, "task"), now), "Dependency");
    }

    const result: WriteOut = { projectId, name, url: `/projects/${projectId}`, counts: draftCounts(p) };
    // Direct insert (not the swallowing aud helper): a failed marker must roll the whole change back (Pitfall 2).
    await tx.insert(auditLog).values({ actor: "agent:projects", action, target: ctx.approvalId!, metadata: { approvalId: ctx.approvalId, projectId, result } });
    return result;
  });
}

const { sources: _cs, ...createShape } = projectCreatePayload.shape;
const createInput = z.object({ ...createShape, reason });
type CreateInput = z.infer<typeof createInput> & { sources?: string[] };
const { sources: _us, before: _ub, projectId: _up, ...updateShape } = projectUpdatePayload.shape;
// projectId/before are server-filled in resolve; they stay in the schema so the approved payload survives executeApproved's re-parse.
const updateInput = z.object({
  ...updateShape,
  project: z.string().min(1).max(200).optional().describe("Project id or exact name"),
  projectId: z.uuid().optional().describe("Server-filled; leave out"),
  before: z.record(z.string(), z.unknown()).optional().describe("Server-filled; leave out"),
  reason,
});
type UpdateInput = z.infer<typeof updateInput> & { sources?: string[] };

const createTool: Tool<CreateInput, WriteOut> = {
  name: "projects.create",
  label: "Preparing a project",
  description:
    "Propose a new LifeOS project with milestones, tasks, links and task dependencies in one approval. Needs owner approval. Give milestones and tasks a short ref (m1, t1) and refer to them from task milestoneRef and blockedBy.",
  input: createInput,
  output: writeOut,
  tier: "APPROVE",
  sideEffect: true,
  private: true,
  async resolve(i, ctx) {
    const { reason: _r, sources: _s, ...draft } = i;
    const r = projectCreatePayload.safeParse({ ...draft, sources: [] });
    if (!r.success) throw badDraft(r.error.issues, draft);
    await checkRepos(ctx.handle, r.data.links);
    return { ...i, sources: await runSources(ctx) };
  },
  toApproval({ reason: r, ...payload }) {
    return { payload: projectCreatePayload.parse(payload), reason: r ?? null };
  },
  handler: (i, ctx) => applyDraft(ctx, "create", i),
};

const updateTool: Tool<UpdateInput, WriteOut> = {
  name: "projects.update",
  label: "Preparing project changes",
  description:
    "Propose changes to one existing project (fields, add or update tasks and milestones, add links and task dependencies). Needs owner approval. Cannot delete or unlink anything. Existing items are referenced by id.",
  input: updateInput,
  output: writeOut,
  tier: "APPROVE",
  sideEffect: true,
  private: true,
  async resolve(i, ctx) {
    const key = i.project ?? i.projectId;
    if (!key) throw new ToolError("invalid_input", "project: Name the project to change.");
    const where = UUID.test(key) ? eq(projects.id, key) : ilike(projects.name, escapeLike(key));
    const h = ctx.handle;
    const [cur] = await h.select().from(projects).where(where).limit(1);
    if (!cur) throw new ToolError("not_found", `Unknown project ${cut(key).slice(0, 80)}`);
    const uuids = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x && UUID.test(x));
    const mIds = uuids([...i.milestones.map((m) => m.id), ...i.tasks.map((t) => t.milestoneRef)]);
    const tIds = uuids([...i.tasks.map((t) => t.id), ...i.tasks.flatMap((t) => t.blockedBy ?? [])]);
    const mine = mIds.length ? await h.select().from(milestones).where(and(eq(milestones.projectId, cur.id), inArray(milestones.id, mIds))) : [];
    const theirs = tIds.length ? await h.select().from(tasks).where(and(eq(tasks.projectId, cur.id), inArray(tasks.id, tIds))) : [];
    if (mine.length !== new Set(mIds).size) throw new ToolError("not_found", "A milestone in this request doesn't belong to that project.");
    if (theirs.length !== new Set(tIds).size) throw new ToolError("not_found", "A task in this request doesn't belong to that project.");
    await checkRepos(h, i.links);
    const touchedM = new Set(uuids(i.milestones.map((m) => m.id)));
    const touchedT = new Set(uuids(i.tasks.map((t) => t.id)));
    const before = {
      name: cur.name,
      updatedAt: cur.updatedAt.toISOString(),
      fields: { name: cur.name, description: cur.description, context: cur.context, category: cur.category, priority: cur.priority, targetDate: cur.targetDate },
      milestones: mine.filter((m) => touchedM.has(m.id)).map((m) => ({ id: m.id, title: m.title, dueDate: m.dueDate })),
      tasks: theirs.filter((t) => touchedT.has(t.id)).map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, priority: t.priority, milestoneId: t.milestoneId })),
    };
    const { reason: _r, project: _p, sources: _s, ...rest } = i;
    const next = { ...rest, projectId: cur.id, before, sources: await runSources(ctx) };
    const r = projectUpdatePayload.safeParse(next);
    if (!r.success) throw badDraft(r.error.issues, next);
    return { ...i, projectId: cur.id, before, sources: next.sources };
  },
  toApproval({ reason: r, project: _p, ...payload }) {
    return { payload: projectUpdatePayload.parse(payload), reason: r ?? null };
  },
  handler: (i, ctx) => applyDraft(ctx, "update", i),
};

export const projectTools: Record<string, Tool<never, Record<string, unknown>>> = Object.fromEntries(
  [listTool, getTool, createTool, updateTool].map((t) => [t.name, t as unknown as Tool<never, Record<string, unknown>>]),
);
