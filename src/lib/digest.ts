// Daily digest: deterministic shapes and rules shared by Home and briefings. Client-safe, no I/O.

export type DigestEvent = { title: string; start: string; end: string; allDay: boolean; calendar: string };
export type DigestTask = { id: string; title: string; dueAt: string | null; priority: 1 | 2 | 3 | null; overdue: boolean; projectId: string | null };
export type Digest = {
  today: string; // Sydney YYYY-MM-DD
  generatedAt: string;
  calendarConnected: boolean;
  events: DigestEvent[];
  conflicts: { a: string; b: string; start: string }[];
  tasks: DigestTask[]; // open, due today or overdue
  doneToday: { title: string }[];
  approvalsWaiting: number;
  importantMail: { id: string; subject: string; from: string }[];
  outreach: { id: string; title: string; start: string; stage: string }[];
  goals: { title: string; goal: string; neglected: boolean; momentum: "rising" | "steady" | "slowing" | "quiet" }[];
  overBudget: { category: string; over: number }[]; // AUD cents over the month's limit
  ciFailures: { title: string; at: string }[];
  upcoming: { day: string; events: DigestEvent[] }[]; // next 6 days
  backup: { ok: boolean; at: string; never?: true } | null; // last verified pg_dump (docker/backup.sh); null = not expected yet
};

export const BACKUP_STALE_HOURS = 36;

export type Priority = { key: string; label: string; detail: string; href: string; weight: number; tone: "red" | "amber" | "cyan" | "neutral" };

/** Fixed-weight ranking (no model): what most needs attention right now. Top `limit`. */
export function rankPriorities(d: Digest, limit = 5): Priority[] {
  const out: Priority[] = [];
  for (const t of d.tasks) {
    const base = t.overdue ? 70 : 40;
    const pri = t.priority === 1 ? 25 : t.priority === 2 ? 10 : 0;
    out.push({ key: `task:${t.id}`, label: t.title, detail: t.overdue ? "Overdue task" : "Due today", href: t.projectId ? `/projects/${t.projectId}` : "/organization", weight: base + pri, tone: t.overdue ? "red" : "amber" });
  }
  if (d.approvalsWaiting) out.push({ key: "approvals", label: `${d.approvalsWaiting} approval${d.approvalsWaiting === 1 ? "" : "s"} waiting`, detail: "Agents are paused on your decision", href: "/agents?view=approvals", weight: 80, tone: "amber" });
  for (const m of d.importantMail.slice(0, 3)) out.push({ key: `mail:${m.id}`, label: m.subject || "(no subject)", detail: `Important email · ${m.from}`, href: `/outreach?tab=email&mail=${m.id}`, weight: 60, tone: "cyan" });
  for (const c of d.conflicts.slice(0, 2)) out.push({ key: `conflict:${c.a}:${c.b}`, label: `${c.a} overlaps ${c.b}`, detail: "Calendar conflict today", href: "/organization", weight: 65, tone: "red" });
  for (const f of d.ciFailures.slice(0, 2)) out.push({ key: `ci:${f.at}:${f.title}`, label: f.title, detail: "CI failed", href: "/career", weight: 55, tone: "red" });
  for (const b of d.overBudget.slice(0, 2)) out.push({ key: `budget:${b.category}`, label: `${b.category} is over budget`, detail: `${(b.over / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD" })} over this month`, href: "/finances?tab=budgets", weight: 35, tone: "amber" });
  if (d.backup && (d.backup.never || !d.backup.ok || Date.parse(d.generatedAt) - Date.parse(d.backup.at) > BACKUP_STALE_HOURS * 3_600_000)) {
    const hours = Math.round((Date.parse(d.generatedAt) - Date.parse(d.backup.at)) / 3_600_000);
    out.push({ key: "backup", label: d.backup.never ? "No database backup has been recorded" : d.backup.ok ? `Last backup was ${hours < 48 ? `${hours} hours` : `${Math.round(hours / 24)} days`} ago` : "The last database backup failed",
      detail: "Check the backup container: lc logs backup", href: "/", weight: 75, tone: "red" });
  }
  for (const g of d.goals.filter((x) => x.neglected).slice(0, 2)) out.push({ key: `goal:${g.goal}:${g.title}`, label: g.title, detail: `Neglected objective · ${g.goal}`, href: "/goals", weight: 30, tone: "neutral" });
  return out.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label)).slice(0, limit);
}

export const BRIEFING_KINDS = ["morning", "midday", "evening", "weekly"] as const;
export type BriefingKind = (typeof BRIEFING_KINDS)[number];
export const BRIEFING_LABEL: Record<BriefingKind, string> = { morning: "Morning briefing", midday: "Midday check-in", evening: "Evening wrap-up", weekly: "Weekly review" };
export type BriefingSection = { id: string; label: string; items: { text: string; meta?: string; href?: string }[]; empty: string };
export type BriefingBody = { kind: BriefingKind; period: string; headline: string; sections: BriefingSection[] };

const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });
const eventItem = (e: DigestEvent) => ({ text: e.title, meta: e.allDay ? "All day" : `${hm(e.start)}–${hm(e.end)}` });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Composes one briefing from a digest snapshot. `weekly` adds weekly totals passed by the caller. */
export function composeBriefing(kind: BriefingKind, period: string, d: Digest, week?: { completed: number }): BriefingBody {
  const priorities = rankPriorities(d);
  const sec = (id: string, label: string, items: BriefingSection["items"], empty: string): BriefingSection => ({ id, label, items, empty });
  const prio = sec("priorities", "Priorities", priorities.map((p) => ({ text: p.label, meta: p.detail, href: p.href })), "Nothing urgent.");
  const remaining = d.events.filter((e) => e.allDay || new Date(e.end).getTime() > new Date(d.generatedAt).getTime());
  const tasks = sec("tasks", "Tasks", d.tasks.map((t) => ({ text: t.title, meta: t.overdue ? "overdue" : t.dueAt ? `due ${hm(t.dueAt)}` : "today", href: "/organization" })), "No tasks due.");
  const sydneyEvents = sec("outreach", "Events you saved", d.outreach.map((e) => ({ text: e.title, meta: new Date(e.start).toLocaleString("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }), href: `/outreach/events/${e.id}` })), "No saved events in the next 3 days.");
  const goals = sec("goals", "Goals", d.goals.filter((g) => g.neglected || g.momentum === "slowing").map((g) => ({ text: g.title, meta: g.neglected ? `neglected · ${g.goal}` : `slowing · ${g.goal}`, href: "/goals" })), "All objectives are moving.");
  const calendar = (label: string, list: DigestEvent[], empty: string) => sec("calendar", label, list.map(eventItem), d.calendarConnected ? empty : "No calendar connected.");

  if (kind === "morning") {
    return { kind, period, headline: `${plural(d.events.length, "event")}, ${plural(d.tasks.length, "task")} and ${plural(d.approvalsWaiting, "approval")} today.`,
      sections: [prio, calendar("Today", d.events, "Nothing scheduled today."), tasks, sydneyEvents, goals] };
  }
  if (kind === "midday") {
    return { kind, period, headline: `${plural(remaining.length, "event")} and ${plural(d.tasks.length, "open task")} left today.`,
      sections: [prio, calendar("Rest of today", remaining, "Nothing else scheduled today."), tasks] };
  }
  if (kind === "evening") {
    const tomorrow = d.upcoming[0];
    return { kind, period, headline: `${plural(d.doneToday.length, "task")} done today.`,
      sections: [
        sec("done", "Done today", d.doneToday.map((t) => ({ text: t.title })), "No tasks completed today."),
        sec("carry", "Still open", d.tasks.map((t) => ({ text: t.title, meta: t.overdue ? "overdue" : "due today" })), "Nothing carried over."),
        calendar("Tomorrow", tomorrow?.events ?? [], "Nothing scheduled tomorrow."),
        prio,
      ] };
  }
  const nextWeek = d.upcoming.flatMap((u) => u.events);
  return { kind, period, headline: `${plural(week?.completed ?? 0, "task")} completed this week.`,
    sections: [
      goals,
      sec("budget", "Budgets this month", d.overBudget.map((b) => ({ text: b.category, meta: `${(b.over / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD" })} over`, href: "/finances?tab=budgets" })), "No category is over budget."),
      calendar("Coming up", nextWeek, "Nothing scheduled in the next 6 days."),
      prio,
    ] };
}

/** Sydney period key: the day for daily kinds, the week's Sunday for weekly. */
export function periodKey(kind: BriefingKind, today: string): string {
  if (kind !== "weekly") return today;
  const d = new Date(`${today}T00:00:00Z`);
  return new Date(d.getTime() + ((7 - d.getUTCDay()) % 7) * 86_400_000).toISOString().slice(0, 10);
}

export type BriefingSchedule = Record<BriefingKind, { on: boolean; time: string }>; // time "HH:MM" Sydney; weekly runs on Sundays
export const DEFAULT_SCHEDULE: BriefingSchedule = { morning: { on: true, time: "07:00" }, midday: { on: false, time: "12:30" }, evening: { on: true, time: "18:00" }, weekly: { on: true, time: "18:00" } };

/** Briefings due now: enabled, time passed today (Sydney), weekly only on Sunday. */
export function dueBriefings(s: BriefingSchedule, local: { ymd: string; hm: string; weekday: string }): BriefingKind[] {
  return BRIEFING_KINDS.filter((k) => s[k].on && local.hm >= s[k].time && (k !== "weekly" || local.weekday === "Sun"));
}
