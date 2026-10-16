import { z } from "zod";

// Client-safe automation contract: trigger → all-of conditions → actions.

/** Event types an automation may listen for (the existing activity vocabulary, minus automation's own). */
export const TRIGGER_EVENTS = {
  "github.ci.failed": "GitHub CI failed",
  "github.pr.review_requested": "GitHub review requested",
  "github.pr.merged": "GitHub PR merged",
  "mail.important": "Important email arrived",
  "calendar.conflict": "Calendar conflict",
  "task.reminder": "Task reminder fired",
  "project.created": "Project created",
  "project.milestone_done": "Milestone completed",
  "outreach.stage": "Event pipeline stage changed",
  "social.published": "Social post published",
  "social.publish_failed": "Social post failed",
  "social.connection_expiring": "Social connection expiring",
  "agent.approval.requested": "Approval requested",
  "agent.run.completed": "Agent run completed",
  "briefing.ready": "Briefing ready",
  "system.health_degraded": "System health degraded",
} as const;
export type TriggerEvent = keyof typeof TRIGGER_EVENTS;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 07:30.");

export const triggerInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("event"), eventType: z.enum(Object.keys(TRIGGER_EVENTS) as [TriggerEvent, ...TriggerEvent[]]) }),
  z.object({ type: z.literal("schedule"), at: hm, days: z.array(z.enum(WEEKDAYS)).min(1, "Pick at least one day.").max(7) }),
]);
export const conditionInput = z.object({
  field: z.enum(["title", "detail", "source"]),
  op: z.enum(["contains", "equals"]),
  value: z.string().trim().min(1, "Add a value to match.").max(200),
});
const text = (max: number) => z.string().trim().min(1, "This can't be empty.").max(max);
export const actionInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("notify"), title: text(120), body: z.string().max(500).default(""), priority: z.enum(["FYI", "IMPORTANT"]).default("FYI") }),
  z.object({ type: z.literal("create_task"), title: text(200), dueInDays: z.number().int().min(0).max(365).nullable().default(null), priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().default(null) }),
  z.object({ type: z.literal("ask_agent"), prompt: text(2000) }),
]);
export const automationInput = z.object({
  name: text(120),
  enabled: z.boolean().default(true),
  trigger: triggerInput,
  conditions: z.array(conditionInput).max(5).default([]),
  actions: z.array(actionInput).min(1, "Add at least one action.").max(5),
}).superRefine((v, ctx) => {
  if (v.trigger.type === "schedule" && v.conditions.length) ctx.addIssue({ code: "custom", path: ["conditions"], message: "Scheduled automations have no event to filter." });
});
export type AutomationInput = z.infer<typeof automationInput>;
export type Trigger = z.infer<typeof triggerInput>;
export type Condition = z.infer<typeof conditionInput>;
export type Action = z.infer<typeof actionInput>;

export const MAX_RUNS_PER_DAY = 20;
export const SCHEDULE_GRACE_MIN = 30;

export type TriggerEventData = { id: string; type: string; title: string; detail: string; source: string };

/** All conditions must hold; comparisons are case-insensitive. */
export function matches(conditions: Condition[], e: TriggerEventData): boolean {
  return conditions.every((c) => {
    const v = (e[c.field] ?? "").toLowerCase(), want = c.value.toLowerCase();
    return c.op === "equals" ? v === want : v.includes(want);
  });
}

/** `{{event.title}}`, `{{event.detail}}`, `{{event.source}}` placeholders; unknown placeholders stay as written. */
export function fill(template: string, e: TriggerEventData | null): string {
  return template.replace(/\{\{\s*event\.(title|detail|source)\s*\}\}/g, (m, k: "title" | "detail" | "source") => (e ? e[k] : m));
}

/**
 * Trigger ref for a due schedule at Sydney `local`, fired up to SCHEDULE_GRACE_MIN late; otherwise null. Checks today's
 * and yesterday's slot, so 23:50 still fires at 00:05 (as yesterday's run, on yesterday's weekday).
 */
export function scheduleRef(t: Extract<Trigger, { type: "schedule" }>, local: { ymd: string; hm: string; weekday: string }): string | null {
  const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const dayIdx = WEEKDAYS.indexOf(local.weekday as (typeof WEEKDAYS)[number]);
  const yesterday = new Date(Date.parse(`${local.ymd}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  for (const [offset, ymd] of [[0, local.ymd], [1, yesterday]] as const) {
    const weekday = WEEKDAYS[(dayIdx - offset + 7) % 7]!;
    const late = mins(local.hm) + offset * 1440 - mins(t.at);
    if ((t.days as string[]).includes(weekday) && late >= 0 && late <= SCHEDULE_GRACE_MIN) return `schedule:${ymd}T${t.at}`;
  }
  return null;
}

export function describeTrigger(t: Trigger): string {
  if (t.type === "event") return `When: ${TRIGGER_EVENTS[t.eventType]}`;
  const days = t.days.length === 7 ? "every day" : t.days.join(", ");
  return `At ${t.at} Sydney, ${days}`;
}
