"use server";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { mailReplyPayload } from "@/lib/mail-payload";
import { cancelRun } from "./agents/runs";
import { capStatus } from "./agents/spend";
import { googleTokenSource } from "./calendar/google/client";
import { db, type DB } from "./db/client";
import {
  approvals,
  auditLog,
  connections,
  mailMessages,
  tasks,
} from "./db/schema";
import { notifyLive } from "./events";
import { log } from "./log";
import { createGmail, gmailAllowed } from "./mail/client";
import { saveReplyDraft } from "./mail/send";
import { bodyText, type GmailPayload } from "./mail/text";
import { enqueue, QUEUES } from "./queue";
import { requireOwner } from "./session";
import { createTask } from "./tasks";

const uuid = z.uuid();
const FAILED = { ok: false, error: "failed" } as const;
const INVALID = { ok: false, error: "invalid" } as const;
const NOT_FOUND = { ok: false, error: "not_found" } as const;

// Never log subjects, bodies or addresses: only the error object.
async function run<T>(fn: () => Promise<T>): Promise<T | typeof FAILED> {
  try {
    return await fn();
  } catch (err) {
    log.error({ err }, "mail action failed");
    return FAILED;
  }
}

const aud = async (
  action: string,
  target: string,
  metadata: Record<string, unknown>,
) => {
  try {
    await db()
      .insert(auditLog)
      .values({ actor: "owner", action, target, metadata });
  } catch (err) {
    log.error({ err, action }, "audit write failed");
  }
};

/** D-24: fetched live, capped plain text, never stored. */
export async function getMailBodyAction(id: string) {
  await requireOwner();
  const p = uuid.safeParse(id);
  if (!p.success) return INVALID;
  return run(async () => {
    const h = db();
    const [row] = await h
      .select({
        gmailId: mailMessages.gmailId,
        threadId: mailMessages.threadId,
      })
      .from(mailMessages)
      .where(eq(mailMessages.id, p.data));
    if (!row) return NOT_FOUND;
    const [conn] = await h
      .select({ s: connections.scopes })
      .from(connections)
      .where(eq(connections.id, "google_calendar"));
    if (!conn || !gmailAllowed(conn.s, "read"))
      return { ok: false, error: "not_connected" } as const;
    const m = await createGmail({ getToken: googleTokenSource(h) }).getFull(
      row.gmailId,
    );
    const b = bodyText((m.payload ?? {}) as GmailPayload);
    return {
      ok: true,
      text: b.text,
      htmlOnly: b.htmlOnly,
      truncated: b.truncated,
      threadId: row.threadId,
    } as const;
  });
}

/** D-26: LifeOS-local only, Gmail is never called. */
export async function archiveMailAction(id: string, archived: boolean) {
  await requireOwner();
  const p = z
    .object({ id: uuid, archived: z.boolean() })
    .safeParse({ id, archived });
  if (!p.success) return INVALID;
  return run(async () => {
    const now = new Date();
    const r = await db()
      .update(mailMessages)
      .set({ archivedAt: p.data.archived ? now : null, updatedAt: now })
      .where(eq(mailMessages.id, p.data.id))
      .returning({ id: mailMessages.id });
    if (!r.length) return NOT_FOUND;
    await aud("mail.archive", p.data.id, {
      id: p.data.id,
      archived: p.data.archived,
    });
    await notifyLive(db(), "outreach", "mail");
    return { ok: true } as const;
  });
}

export async function flagMailAction(id: string, flagged: boolean) {
  await requireOwner();
  const p = z
    .object({ id: uuid, flagged: z.boolean() })
    .safeParse({ id, flagged });
  if (!p.success) return INVALID;
  return run(async () => {
    const now = new Date();
    const r = await db()
      .update(mailMessages)
      .set({ flaggedAt: p.data.flagged ? now : null, updatedAt: now })
      .where(eq(mailMessages.id, p.data.id))
      .returning({ id: mailMessages.id });
    if (!r.length) return NOT_FOUND;
    await aud("mail.flag", p.data.id, {
      id: p.data.id,
      flagged: p.data.flagged,
    });
    await notifyLive(db(), "outreach", "mail");
    return { ok: true } as const;
  });
}

/** D-27: owner-only; the agent never creates tasks from mail. */
export async function addMailTaskAction(id: string, index: number) {
  await requireOwner();
  const p = z
    .object({ id: uuid, index: z.number().int().min(0).max(4) })
    .safeParse({ id, index });
  if (!p.success) return INVALID;
  return run(async () => {
    const h = db();
    const [m] = await h
      .select()
      .from(mailMessages)
      .where(eq(mailMessages.id, p.data.id));
    const item = m?.actionItems[p.data.index];
    if (!m || !item) return NOT_FOUND;
    const title = item.text.trim().slice(0, 200);
    if (!title) return NOT_FOUND;
    const [open] = await h
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.mailMessageId, m.id),
          eq(tasks.title, title),
          isNull(tasks.completedAt),
        ),
      )
      .limit(1);
    if (open) return { ok: true, taskId: open.id, existed: true } as const;
    const dueDate = item.due?.slice(0, 10) ?? null;
    const notes =
      `From email: ${m.subject} · ${m.fromName || m.fromAddress}`.slice(
        0,
        4000,
      );
    const taskId = await h.transaction(async (tx) => {
      const now = new Date();
      const t = tx as unknown as DB;
      let r = await createTask(t, { title, dueDate, notes }, now);
      if (!r.ok) r = await createTask(t, { title, notes }, now); // unusable model date: keep the task
      if (!r.ok) throw new Error("task rejected");
      await tx
        .update(tasks)
        .set({ mailMessageId: m.id })
        .where(eq(tasks.id, r.task.id));
      return r.task.id;
    });
    await aud("mail.add_task", m.id, { id: m.id, taskId });
    return { ok: true, taskId, existed: false } as const;
  });
}

/** D-25: triage one older mail through the job queue; repeated clicks dedupe on the singleton key. */
export async function triageMailAction(id: string) {
  await requireOwner();
  const p = uuid.safeParse(id);
  if (!p.success) return INVALID;
  return run(async () => {
    if ((await capStatus(db(), new Date())).reached)
      return { ok: false, error: "paused" } as const;
    await enqueue(
      QUEUES.mailTriage,
      { ids: [p.data] },
      { singletonKey: `mail.triage.one:${p.data}` },
    );
    return { ok: true } as const;
  });
}

export async function syncMailNowAction() {
  await requireOwner();
  return run(async () => {
    await enqueue(QUEUES.mailSync, {}, { singletonKey: "mail.sync" });
    return { ok: true } as const;
  });
}

/** D-31: create a real Gmail draft, then claim pending -> rejected; a lost claim deletes the draft again. */
export async function saveReplyToDraftsAction(approvalId: string) {
  await requireOwner();
  const p = uuid.safeParse(approvalId);
  if (!p.success) return INVALID;
  return run(async () => {
    const h = db();
    const [a] = await h
      .select()
      .from(approvals)
      .where(eq(approvals.id, p.data));
    if (!a || a.tool !== "mail.send_reply") return NOT_FOUND;
    if (a.status !== "pending")
      return { ok: false, error: "not_pending" } as const;
    const payload = mailReplyPayload.safeParse(
      a.editedPayload ?? a.originalPayload,
    );
    if (!payload.success) return INVALID;
    const { draftId } = await saveReplyDraft(h, payload.data);
    const now = new Date();
    const [won] = await h
      .update(approvals)
      .set({
        status: "rejected",
        decidedAt: now,
        result: { gmailDraftId: draftId },
      })
      .where(and(eq(approvals.id, p.data), eq(approvals.status, "pending")))
      .returning({ id: approvals.id, runId: approvals.runId });
    if (!won) {
      await createGmail({ getToken: googleTokenSource(h) })
        .deleteDraft(draftId)
        .catch((err) => log.error({ err }, "orphan draft delete failed"));
      return { ok: false, error: "not_pending" } as const;
    }
    await aud("approval.reject", p.data, {
      approvalId: p.data,
      edited: Boolean(a.editedPayload),
      movedToDrafts: true,
    });
    await cancelRun(h, won.runId, now);
    await notifyLive(h, "approval", won.id);
    await notifyLive(h, "run", won.runId);
    return { ok: true, gmailDraftId: draftId } as const;
  });
}
