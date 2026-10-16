// Goals read: the owner's vision, goals, objectives and linked-project progress. Private (owner-authored, names projects).
import { z } from "zod";
import { loadGoals } from "../../goals";
import type { Tool } from "../types";

const overview: Tool<{ includeTasks: boolean }, Record<string, unknown>> = {
  name: "goals.overview",
  label: "Reading your goals",
  description: "Read the owner's vision, active goals, objectives, progress (percent, null when nothing is measurable yet), momentum (tasks completed in the last 14 days vs the 14 before), neglected objectives (no activity for 21 days), horizon and linked projects. includeTasks adds open task titles per project.",
  input: z.object({ includeTasks: z.boolean().default(false) }),
  output: z.record(z.string(), z.unknown()),
  tier: "READ",
  sideEffect: false,
  private: true,
  async handler(i, ctx) {
    const d = await loadGoals(ctx.handle, ctx.now());
    return {
      vision: d.vision || null, headline: d.headline, today: d.today, link: "/goals",
      goals: d.goals.map((g) => ({
        title: g.title, status: g.status, targetDate: g.targetDate, progress: g.progress, momentum: g.momentum, neglectedObjectives: g.neglected,
        objectives: g.objectives.map((o) => ({
          title: o.title, status: o.status, targetDate: o.targetDate, horizon: o.horizon, progress: o.progress, manual: o.manualProgress !== null,
          momentum: o.momentum, neglected: o.neglected, lastActivity: o.lastActivity,
          projects: o.projects.map((p) => ({ name: p.name, status: p.status, done: p.done, total: p.total, ...(i.includeTasks ? { openTasks: p.tasks.filter((t) => !t.done).slice(0, 15).map((t) => (t.blocked ? `${t.title} (blocked)` : t.title)) } : {}) })),
        })),
      })),
    };
  },
};

export const goalTools = { [overview.name]: overview };
