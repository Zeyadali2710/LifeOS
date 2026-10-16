import { z } from "zod";

export const GOAL_STATUSES = ["active", "done", "archived"] as const;
export const GOAL_COLORS = ["#0a84ff", "#ff9f0a", "#ff6482", "#30d158", "#64d2ff", "#bf5af2"] as const;
export const NEGLECT_DAYS = 21;
export const MOMENTUM_DAYS = 14;
const DAY = 86_400_000;
const realDay = (v: string) => { const d = new Date(`${v}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; };
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(realDay, "Use a valid date.");

export const goalInput = z.object({
  title: z.string().trim().min(1, "Add a title.").max(200),
  color: z.enum(GOAL_COLORS).default("#0a84ff"),
  targetDate: ymd.nullable().default(null),
  status: z.enum(GOAL_STATUSES).default("active"),
});
export const objectiveInput = z.object({
  goalId: z.uuid(),
  title: z.string().trim().min(1, "Add a title.").max(200),
  targetDate: ymd.nullable().default(null),
  status: z.enum(["active", "done"]).default("active"),
  progress: z.number().int().min(0).max(100).nullable().default(null),
});
export const visionInput = z.string().trim().max(500, "Keep the vision under 500 characters.");

export type Momentum = "rising" | "steady" | "slowing" | "quiet";
/** Tasks completed in the last MOMENTUM_DAYS vs the MOMENTUM_DAYS before. */
export function momentum(recent: number, prior: number): Momentum {
  if (recent === 0 && prior === 0) return "quiet";
  return recent > prior ? "rising" : recent < prior ? "slowing" : "steady";
}

/** Manual value wins; otherwise completed/total linked tasks; null when there is nothing to measure yet. */
export function objectiveProgress(manual: number | null, done: number, total: number, status: "active" | "done"): number | null {
  if (status === "done") return 100;
  if (manual !== null) return manual;
  return total > 0 ? Math.round((done / total) * 100) : null;
}

/** Mean of measurable objectives; null when none are measurable. */
export function goalProgress(objectives: (number | null)[]): number | null {
  const xs = objectives.filter((x): x is number => x !== null);
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

export function isNeglected(lastActivity: Date, now: Date, active: boolean): boolean {
  return active && now.getTime() - lastActivity.getTime() > NEGLECT_DAYS * DAY;
}

export const HORIZONS = ["week", "month", "year", "long"] as const;
export type Horizon = (typeof HORIZONS)[number];
export const HORIZON_LABEL: Record<Horizon, string> = { week: "THIS WEEK", month: "THIS MONTH", year: "THIS YEAR", long: "LONG TERM" };

/** Sydney calendar horizon for a target date. Overdue counts as this week; no date is long term. Weeks end on Sunday. */
export function horizonOf(targetDate: string | null, today: string): Horizon {
  if (!targetDate) return "long";
  const t = new Date(`${today}T00:00:00Z`);
  const daysToSunday = (7 - t.getUTCDay()) % 7;
  const weekEnd = new Date(t.getTime() + daysToSunday * DAY).toISOString().slice(0, 10);
  if (targetDate <= weekEnd) return "week";
  if (targetDate.slice(0, 7) === today.slice(0, 7)) return "month";
  if (targetDate.slice(0, 4) === today.slice(0, 4)) return "year";
  return "long";
}

/** Header sentence from real momentum, e.g. "Momentum is up on 3 of 5 goals." */
export function goalsHeadline(active: { momentum: Momentum }[]): string {
  if (!active.length) return "Set a direction.";
  const up = active.filter((g) => g.momentum === "rising").length;
  return `Momentum is up on ${up} of ${active.length} goal${active.length === 1 ? "" : "s"}.`;
}
