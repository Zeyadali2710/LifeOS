import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { addDays, sydneyYmd } from "@/lib/project-rules";
import { BACKUP_STALE_HOURS, type Digest, type DigestEvent } from "@/lib/digest";
import { effectiveBudgets, summariseFinance, type FinanceCategory } from "@/lib/finance";
import { counts } from "./agents/runs";
import { conflictsIn, listEvents, loadTasks } from "./calendar/queries";
import type { DB } from "./db/client";
import { activityEvents, calendars, financeBudgets, financeCategories, financeTransactions, mailMessages, outreachEvents, settings, tasks, users } from "./db/schema";
import { loadGoals } from "./goals";
import { sydneyInstant } from "./time";

const midnight = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number) as [number, number, number]; return sydneyInstant(y, m, d, 0, 0); };
const ev = (e: { title: string; start: string; end: string; allDay: boolean; calendarName: string; declined: boolean; status: string }): DigestEvent | null =>
  e.declined || e.status === "cancelled" ? null : { title: e.title, start: e.start, end: e.end, allDay: e.allDay, calendar: e.calendarName };

/** One deterministic snapshot of "what matters" from local data. Nothing is sent outside LifeOS. Sources fail soft. */
export async function loadDigest(h: DB, now: Date): Promise<Digest> {
  const today = sydneyYmd(now);
  const start = midnight(today), end = midnight(addDays(today, 1));
  const month = today.slice(0, 7);
  const soft = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

  const [cal, events, conflicts, due, done, runCounts, mail, outreach, goals, budgetRows, cats, spend, ci, upcomingRaw, backupRow, owner] = await Promise.all([
    soft(h.select({ id: calendars.id }).from(calendars).where(eq(calendars.enabled, true)).limit(1), []),
    soft(listEvents(h, today, today), []),
    soft(conflictsIn(h, start, end), []),
    soft(loadTasks(h, "today", now), []),
    soft(h.select({ title: tasks.title }).from(tasks).where(and(gte(tasks.completedAt, start), lt(tasks.completedAt, end))).orderBy(desc(tasks.completedAt)).limit(20), []),
    soft(counts(h), { running: 0, queued: 0, approvalsWaiting: 0 }),
    soft(h.select({ id: mailMessages.id, subject: mailMessages.subject, fromName: mailMessages.fromName, fromAddress: mailMessages.fromAddress }).from(mailMessages)
      .where(and(eq(mailMessages.importance, "HIGH"), isNull(mailMessages.archivedAt), sql`'UNREAD' = any(${mailMessages.labelIds})`, sql`'INBOX' = any(${mailMessages.labelIds})`, gte(mailMessages.receivedAt, new Date(now.getTime() - 2 * 86_400_000))))
      .orderBy(desc(mailMessages.receivedAt)).limit(5), []),
    soft(h.select({ id: outreachEvents.id, title: outreachEvents.title, startAt: outreachEvents.startAt, stage: outreachEvents.stage }).from(outreachEvents)
      .where(and(inArray(outreachEvents.stage, ["SAVED", "INTERESTED", "ATTENDING"]), isNull(outreachEvents.dismissedAt), eq(outreachEvents.isMock, false),
        gte(outreachEvents.startAt, now), lt(outreachEvents.startAt, new Date(now.getTime() + 3 * 86_400_000))))
      .orderBy(outreachEvents.startAt).limit(5), []),
    soft(loadGoals(h, now), null),
    soft(h.select({ category: financeBudgets.category, month: financeBudgets.month, cents: financeBudgets.cents }).from(financeBudgets).where(sql`${financeBudgets.month} <= ${month}`), []),
    soft(h.select({ name: financeCategories.name, group: financeCategories.group, kind: financeCategories.kind }).from(financeCategories), []),
    soft(h.select({ date: financeTransactions.date, amount: financeTransactions.amount, category: financeTransactions.category }).from(financeTransactions)
      .where(and(gte(financeTransactions.date, `${month}-01`), lt(financeTransactions.date, `${addDays(`${month}-01`, 32).slice(0, 7)}-01`))), []),
    soft(h.select({ title: activityEvents.title, at: activityEvents.occurredAt }).from(activityEvents)
      .where(and(eq(activityEvents.type, "github.ci.failed"), gte(activityEvents.occurredAt, new Date(now.getTime() - 86_400_000)))).orderBy(desc(activityEvents.occurredAt)).limit(5), []),
    soft(listEvents(h, addDays(today, 1), addDays(today, 6)), []),
    soft(h.select({ v: settings.value }).from(settings).where(eq(settings.key, "backup.last")), []),
    soft(h.select({ at: users.createdAt }).from(users).orderBy(users.createdAt).limit(1), []),
  ]);

  const spent = summariseFinance(spend, cats as FinanceCategory[], month).categories;
  const limits = effectiveBudgets(budgetRows, month);
  const overBudget = [...limits].flatMap(([category, l]) => {
    const actual = spent.find((s) => s.name === category)?.amount ?? 0;
    return actual > l.cents ? [{ category, over: actual - l.cents }] : [];
  }).sort((a, b) => b.over - a.over);

  const upcoming = Array.from({ length: 6 }, (_, i) => addDays(today, i + 1)).map((day) => ({
    day,
    events: upcomingRaw.filter((e) => (e.allDay ? e.startDate ?? e.start.slice(0, 10) : sydneyYmd(new Date(e.start))) === day).flatMap((e) => ev(e) ?? []),
  }));

  return {
    today, generatedAt: now.toISOString(), calendarConnected: cal.length > 0,
    events: events.flatMap((e) => ev(e) ?? []),
    conflicts: conflicts.map((c) => ({ a: c.aTitle, b: c.bTitle, start: c.start })),
    tasks: due.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, priority: t.priority, overdue: !!t.dueAt && new Date(t.dueAt).getTime() < now.getTime(), projectId: t.projectId })),
    doneToday: done,
    approvalsWaiting: runCounts.approvalsWaiting,
    importantMail: mail.map((m) => ({ id: m.id, subject: m.subject, from: m.fromName || m.fromAddress })),
    outreach: outreach.map((o) => ({ id: o.id, title: o.title, start: o.startAt.toISOString(), stage: o.stage ?? "SAVED" })),
    goals: (goals?.goals ?? []).filter((g) => g.status === "active").flatMap((g) => g.objectives.filter((o) => o.status === "active").map((o) => ({ title: o.title, goal: g.title, neglected: o.neglected, momentum: o.momentum }))),
    overBudget, ciFailures: ci.map((c) => ({ title: c.title, at: c.at.toISOString() })), upcoming,
    // No record at all only alerts once the install is older than the stale window (fresh dev/e2e databases stay quiet).
    backup: backupOf(backupRow[0]?.v) ?? (owner[0] && now.getTime() - owner[0].at.getTime() > BACKUP_STALE_HOURS * 3_600_000 ? { ok: false, at: owner[0].at.toISOString(), never: true } : null),
  };
}

const backupOf = (v: unknown): Digest["backup"] => {
  const b = v as { ok?: unknown; at?: unknown } | undefined;
  return b && typeof b.ok === "boolean" && typeof b.at === "string" && !Number.isNaN(Date.parse(b.at)) ? { ok: b.ok, at: b.at } : null;
};

/** Tasks completed in the Sydney week ending on `sunday` (Mon–Sun). */
export async function completedInWeek(h: DB, sunday: string): Promise<number> {
  const [r] = await h.select({ n: sql<number>`count(*)::int` }).from(tasks)
    .where(and(isNotNull(tasks.completedAt), gte(tasks.completedAt, midnight(addDays(sunday, -6))), lt(tasks.completedAt, midnight(addDays(sunday, 1)))));
  return r?.n ?? 0;
}
