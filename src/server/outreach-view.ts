// Read-only Almanac mailboxes. Bodies and connection credentials never leave their existing APIs.
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { MailMessageDTO } from "@/lib/outreach-types";
import type { DB } from "./db/client";
import { approvals, connections, mailMessages as m } from "./db/schema";
import { mailAccounts } from "./mail/accounts";

export async function outreachMailboxes(h: DB, box: string, selectedId: string | null) {
  const live = and(isNull(m.archivedAt), sql`'INBOX' = any(${m.labelIds})`);
  const [accounts, counts, categories] = await Promise.all([
    mailAccounts(h),
    h.select({ id: m.connectionId, unread: sql<number>`count(*) filter (where 'UNREAD' = any(${m.labelIds}))::int`, total: sql<number>`count(*)::int` }).from(m).where(live).groupBy(m.connectionId),
    h.select({ category: m.category, total: sql<number>`count(*)::int` }).from(m).where(live).groupBy(m.category),
  ]);
  const account = accounts.find((a) => a.id === box);
  const filter = box === "archive" || box === "archived" ? isNotNull(m.archivedAt)
    : and(live, account ? eq(m.connectionId, account.id)
      : box === "flagged" ? isNotNull(m.flaggedAt)
      : box === "reply" ? or(sql`lower(coalesce(${m.action}, '')) like '%reply%'`, eq(m.category, "FOLLOW-UP"), sql`exists (select 1 from jsonb_array_elements(${m.actionItems}) item where item->>'text' ~* '^(reply|send|offer|confirm)')`, sql`exists (select 1 from ${approvals} where ${approvals.tool} = 'mail.send_reply' and ${approvals.status} = 'pending' and ${approvals.originalPayload}->>'messageId' = ${m.id}::text)`)
      : box === "untriaged" ? isNull(m.category)
      : ["important", "events", "networking", "opportunities", "follow-up", "other"].includes(box) ? eq(m.category, box.toUpperCase()) : undefined);
  const columns = {
    id: m.id, connectionId: m.connectionId, mailbox: connections.login, threadId: m.threadId,
    fromName: m.fromName, fromAddress: m.fromAddress, to: m.to, cc: m.cc, subject: m.subject,
    receivedAt: m.receivedAt, snippet: m.snippet, bulk: m.bulk, category: m.category, importance: m.importance,
    summary: m.summary, action: m.action, actionItems: m.actionItems, flagged: m.flagged,
    flaggedAt: m.flaggedAt, archivedAt: m.archivedAt, triagedAt: m.triagedAt, labelIds: m.labelIds,
  };
  const rows = await h.select(columns).from(m).leftJoin(connections, eq(m.connectionId, connections.id)).where(filter).orderBy(desc(m.receivedAt)).limit(200);
  // A direct mail link must work even beyond the mailbox's 200-row window.
  if (selectedId && !rows.some((r) => r.id === selectedId)) {
    const [selected] = await h.select(columns).from(m).leftJoin(connections, eq(m.connectionId, connections.id)).where(eq(m.id, selectedId));
    if (selected) rows.unshift(selected);
  }
  const replyId = sql<string>`${approvals.originalPayload}->>'messageId'`;
  const replies = rows.length ? await h.selectDistinctOn([replyId], { mailId: replyId, status: approvals.status }).from(approvals).where(and(eq(approvals.tool, "mail.send_reply"), inArray(replyId, rows.map((r) => r.id)))).orderBy(replyId, desc(approvals.createdAt)) : [];
  return {
    categoryCounts: Object.fromEntries(categories.map((c) => [c.category?.toLowerCase() ?? "untriaged", c.total])),
    accounts: accounts.map((a) => ({ id: a.id, email: a.email, status: a.status, read: a.read, compose: a.compose, lastSyncAt: a.lastSyncAt, lastSyncError: a.lastSyncError, unread: counts.find((c) => c.id === a.id)?.unread ?? 0, total: counts.find((c) => c.id === a.id)?.total ?? 0 })),
    items: rows.map(({ fromName, fromAddress, labelIds, ...r }) => ({ ...r,
      replyState: replies.find((a) => a.mailId === r.id)?.status ?? null,
      from: { name: fromName, address: fromAddress }, unread: labelIds.includes("UNREAD"),
      receivedAt: r.receivedAt.toISOString(), flaggedAt: r.flaggedAt?.toISOString() ?? null,
      archivedAt: r.archivedAt?.toISOString() ?? null, triagedAt: r.triagedAt?.toISOString() ?? null,
      category: r.category as MailMessageDTO["category"], importance: r.importance as MailMessageDTO["importance"],
    })),
  };
}
