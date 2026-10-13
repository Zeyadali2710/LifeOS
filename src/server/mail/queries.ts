// Mail + follow-up read model (server only). Explicit columns: bodies are never stored, so none are selected.
import { and, asc, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { MAIL_CATEGORIES, type FollowUpDTO, type MailCat, type MailCategory, type MailCounts, type MailMessageDTO, type MailStatus } from "../../lib/outreach-types";
import type { ApprovalDTO } from "../../lib/agent-types";
import { toApprovalDTO } from "../agents/dto";
import { hasGmail } from "../calendar/connections";
import type { DB } from "../db/client";
import { approvals, connections, mailMessages, outreachEvents, settings, tasks } from "../db/schema";
import { mailSyncState } from "./sync";
import { TRIAGE_PAUSED_KEY } from "./triage";

const DAY = 86_400_000;
const inbox = sql`'INBOX' = any(${mailMessages.labelIds})`;

export async function mailStatus(h: DB): Promise<MailStatus> {
  const [[conn], st, [p], [n]] = await Promise.all([
    h.select({ status: connections.status, scopes: connections.scopes }).from(connections).where(eq(connections.id, "google_calendar")),
    mailSyncState(h),
    h.select({ v: settings.value }).from(settings).where(eq(settings.key, TRIAGE_PAUSED_KEY)),
    h.select({ n: sql<number>`count(*)::int` }).from(mailMessages),
  ]);
  const state = !conn ? "not_connected" : conn.status === "error" ? "reconnect" : !hasGmail(conn.scopes, "read") ? "scope_missing" : st.full === "pending" && !n?.n ? "first_sync" : "ok";
  return { state, lastSyncAt: st.lastSyncAt, lastSyncError: st.lastSyncError, triagePaused: p?.v === true };
}

const COLS = {
  id: mailMessages.id, threadId: mailMessages.threadId, fromName: mailMessages.fromName, fromAddress: mailMessages.fromAddress, to: mailMessages.to, cc: mailMessages.cc,
  subject: mailMessages.subject, receivedAt: mailMessages.receivedAt, snippet: mailMessages.snippet, bulk: mailMessages.bulk,
  category: mailMessages.category, importance: mailMessages.importance, summary: mailMessages.summary, action: mailMessages.action,
  actionItems: mailMessages.actionItems, flagged: mailMessages.flagged, flaggedAt: mailMessages.flaggedAt, triagedAt: mailMessages.triagedAt, archivedAt: mailMessages.archivedAt,
};

const toDTO = ({ fromName, fromAddress, ...r }: { [K in keyof typeof COLS]: (typeof mailMessages.$inferSelect)[K] }): MailMessageDTO => ({
  ...r,
  from: { name: fromName, address: fromAddress },
  receivedAt: r.receivedAt.toISOString(),
  flaggedAt: r.flaggedAt?.toISOString() ?? null,
  triagedAt: r.triagedAt?.toISOString() ?? null,
  archivedAt: r.archivedAt?.toISOString() ?? null,
  category: r.category as MailMessageDTO["category"],
  importance: r.importance as MailMessageDTO["importance"],
});

export async function loadMailView(h: DB, o: { cat: MailCat }): Promise<{ counts: MailCounts; items: MailMessageDTO[]; inboxCount: number }> {
  const live = and(isNull(mailMessages.archivedAt), inbox);
  const [grp, [ar], [un], [ib]] = await Promise.all([
    h.select({ c: mailMessages.category, n: sql<number>`count(*)::int` }).from(mailMessages).where(and(live, isNotNull(mailMessages.category))).groupBy(mailMessages.category),
    h.select({ n: sql<number>`count(*)::int` }).from(mailMessages).where(isNotNull(mailMessages.archivedAt)),
    h.select({ n: sql<number>`count(*)::int` }).from(mailMessages).where(and(live, isNull(mailMessages.category))),
    h.select({ n: sql<number>`count(*)::int` }).from(mailMessages).where(live),
  ]);
  const counts = { UNTRIAGED: un?.n ?? 0, ARCHIVED: ar?.n ?? 0 } as MailCounts;
  for (const c of MAIL_CATEGORIES) counts[c] = grp.find((g) => g.c === c)?.n ?? 0;
  const where =
    o.cat === "archived" ? isNotNull(mailMessages.archivedAt) : o.cat === "untriaged" ? and(live, isNull(mailMessages.category)) : and(live, eq(mailMessages.category, o.cat.toUpperCase() as MailCategory));
  const rows = await h.select(COLS).from(mailMessages).where(where).orderBy(desc(mailMessages.receivedAt)).limit(200);
  return { counts, items: rows.map(toDTO), inboxCount: ib?.n ?? 0 };
}

/** Newest send_reply approval for this message: pending, or resolved within the last day. */
export async function pendingReplyFor(h: DB, mailId: string): Promise<ApprovalDTO | null> {
  const [r] = await h
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.tool, "mail.send_reply"),
        sql`${approvals.originalPayload}->>'messageId' = ${mailId}`,
        or(eq(approvals.status, "pending"), sql`${approvals.updatedAt} > ${new Date(Date.now() - DAY)}`),
      ),
    )
    .orderBy(desc(approvals.createdAt))
    .limit(1);
  try {
    return r ? toApprovalDTO(r) : null;
  } catch {
    return null; // unreadable stored payload: treat as no draft
  }
}

const openLinked = and(isNull(tasks.completedAt), or(isNotNull(tasks.outreachEventId), isNotNull(tasks.mailMessageId)));

export async function followUpCount(h: DB): Promise<number> {
  const [r] = await h.select({ n: sql<number>`count(*)::int` }).from(tasks).where(openLinked);
  return r?.n ?? 0;
}

export async function listFollowUps(h: DB): Promise<FollowUpDTO[]> {
  const rows = await h
    .select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate, eid: tasks.outreachEventId, et: outreachEvents.title, mid: tasks.mailMessageId, subject: mailMessages.subject, fromName: mailMessages.fromName, fromAddress: mailMessages.fromAddress })
    .from(tasks)
    .leftJoin(outreachEvents, eq(outreachEvents.id, tasks.outreachEventId))
    .leftJoin(mailMessages, eq(mailMessages.id, tasks.mailMessageId))
    .where(openLinked)
    .orderBy(sql`${tasks.dueDate} asc nulls last`, asc(tasks.createdAt));
  return rows.flatMap((r): FollowUpDTO[] =>
    r.eid ? [{ id: r.id, title: r.title, dueDate: r.dueDate, context: { kind: "event", id: r.eid, title: r.et ?? "" } }]
    : r.mid ? [{ id: r.id, title: r.title, dueDate: r.dueDate, context: { kind: "email", id: r.mid, subject: r.subject ?? "", sender: r.fromName || r.fromAddress || "" } }]
    : [],
  );
}
