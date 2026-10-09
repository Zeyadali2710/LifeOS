import { busyOf, conflicts, type SchedItem } from "./conflicts";
import { addDaysYmd, freeSlots, SLOT_MIN, type FreeSlot, wakingWindow } from "./free-slots";
import { sydneyInstant, sydneyParts } from "@/server/time";

export type { SchedItem, FreeSlot };
export type PlanTask = {
  id: string;
  title: string;
  dueAt: number | null;
  dueHasTime: boolean;
  priority: 1 | 2 | 3 | null;
  createdAt: number;
  estimateMin?: number;
};
export type Why = {
  key: "due_first_slot" | "priority_due" | "only_block" | "no_slot";
  params: Record<string, string | number>;
};
export type PlanItem =
  | { kind: "task"; taskId: string; start: number; end: number; why: Why }
  | { kind: "conflict"; taskId: string; dueAt: number; why: Why };

const MIN = 60000;
const Q = SLOT_MIN * MIN;
const nul = (n: number | null) => (n === null ? Infinity : n);

export function planDay(a: {
  tasks: PlanTask[];
  slots: FreeSlot[];
  skipped?: Set<string>;
  dayEnd: number;
}): PlanItem[] {
  const skipped = a.skipped ?? new Set<string>();
  const slots = a.slots.map((s) => ({ ...s }));
  const order = a.tasks
    .filter((t) => !skipped.has(t.id))
    .sort(
      (x, y) =>
        nul(x.dueAt) - nul(y.dueAt) ||
        (x.priority ?? 9) - (y.priority ?? 9) ||
        x.createdAt - y.createdAt ||
        (x.id < y.id ? -1 : 1),
    );
  const out: PlanItem[] = [];
  for (const t of order) {
    const len = (t.estimateMin ?? 30) * MIN;
    const fits = (s: FreeSlot) => s.start + len <= s.end && (t.dueAt === null || s.start + len <= t.dueAt);
    const fitting = slots.filter(fits);
    const slot = fitting[0];
    if (!slot) {
      if (t.dueAt !== null && t.dueAt <= a.dayEnd)
        out.push({ kind: "conflict", taskId: t.id, dueAt: t.dueAt, why: { key: "no_slot", params: { due: t.dueAt } } });
      continue;
    }
    const start = slot.start;
    const minutes = Math.round((slot.end - slot.start) / MIN);
    const why: Why =
      t.priority === 1 && t.dueAt !== null
        ? { key: "priority_due", params: { priority: "high", due: t.dueAt } }
        : t.dueAt !== null && fitting.length === 1
          ? { key: "only_block", params: { due: t.dueAt } }
          : { key: "due_first_slot", params: t.dueAt !== null ? { due: t.dueAt, minutes } : { minutes } };
    slot.start = Math.min(slot.end, Math.ceil((start + len) / Q) * Q);
    out.push({ kind: "task", taskId: t.id, start, end: start + len, why });
  }
  return out;
}

export function weekStats(items: SchedItem[], days: string[], _now: number) {
  void _now;
  const [fy, fm, fd] = days[0]!.split("-").map(Number) as [number, number, number];
  const [ly, lm, ld] = addDaysYmd(days[days.length - 1]!, 1).split("-").map(Number) as [number, number, number];
  const from = sydneyInstant(fy, fm, fd, 0).getTime();
  const to = sydneyInstant(ly, lm, ld, 0).getTime();
  const events = items.filter((i) => !i.declined && i.status !== "cancelled" && i.start >= from && i.start < to).length;
  const busy = busyOf(items);
  let free = 0;
  for (const d of days) for (const s of freeSlots(busy, wakingWindow(d))) free += s.end - s.start;
  return { events, freeHours: Math.floor(free / 3600000), conflicts: conflicts(busy).length };
}

const period = (start: number) => {
  const h = sydneyParts(new Date(start)).hour;
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
};
const biggest = (slots: FreeSlot[], after: number) =>
  slots
    .filter((s) => s.end > after && s.end - s.start >= 120 * MIN)
    .sort((x, y) => y.end - y.start - (x.end - x.start) || x.start - y.start)[0];

export function headline(slotsToday: FreeSlot[], slotsTomorrow: FreeSlot[], now: number): string | null {
  const t = biggest(slotsToday, now);
  if (t) return `You're free this ${period(Math.max(t.start, now))}.`;
  const n = biggest(slotsTomorrow, 0);
  return n ? `You're free tomorrow ${period(n.start)}.` : null;
}

export function planSummary(a: { freeMinutes: number; toPlace: number; unplaced: number; afterHours: boolean; open: number }): string {
  const tasks = (n: number) => `${n} ${n === 1 ? "task" : "tasks"}`;
  if (a.afterHours && a.open > 0) return `Today's plan is done. ${tasks(a.open)} ${a.open === 1 ? "is" : "are"} still open.`;
  if (a.toPlace === 0 && a.unplaced === 0) return "All clear. Nothing due today.";
  if (a.toPlace === 0) return `Your day is full. ${tasks(a.unplaced)} ${a.unplaced === 1 ? "has" : "have"} no free slot today.`;
  const h = Math.floor(a.freeMinutes / 60);
  return `${h} ${h === 1 ? "hour" : "hours"} free between now and 22:00. ${tasks(a.toPlace)} to place.`;
}
