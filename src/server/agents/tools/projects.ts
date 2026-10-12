// LifeOS project reads (D-17): READ-only, bounded, and picked field by field so the workspace path,
// machine label, launch command and brief never reach the model. Owner-private: taints the run (D-09).
import { eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { projects } from "../../db/schema";
import { listProjects, loadProject } from "../../project-queries";
import { ToolError, type Tool } from "../types";

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

export const projectTools: Record<string, Tool<never, Record<string, unknown>>> = Object.fromEntries(
  [listTool, getTool].map((t) => [t.name, t as unknown as Tool<never, Record<string, unknown>>]),
);
