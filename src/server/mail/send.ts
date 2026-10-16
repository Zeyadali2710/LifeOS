// Reply sending (D-30..D-33): a threaded draft is created and checkpointed, then sent. A retry after an ambiguous
// failure adopts whatever already happened (draft, SENT copy, rfc822msgid) before it ever sends again.
import { eq } from "drizzle-orm";
import type { MailReplyPayload } from "@/lib/mail-payload";
import { markCalendarError } from "../calendar/connections";
import { ProviderError } from "../calendar/errors";
import { googleTokenSource } from "../calendar/google/client";
import type { DB } from "../db/client";
import { approvals, connections, mailMessages } from "../db/schema";
import { ToolError } from "../agents/types";
import { createGmail, gmailAllowed } from "./client";
import { buildReplyMime, replyMessageId } from "./mime";

export const RECONNECT = "Gmail isn't allowed. Reconnect Google in Settings → Connections.";

type Opts = { fetch?: typeof fetch; key?: Buffer; now?: () => Date };

async function gmailFor(h: DB, o: Opts, payload: MailReplyPayload) {
  const [message] = await h.select({ connectionId: mailMessages.connectionId, threadId: mailMessages.threadId }).from(mailMessages).where(eq(mailMessages.id, payload.messageId));
  const connectionId = payload.connectionId ?? "google_calendar";
  if (!message || message.connectionId !== connectionId || message.threadId !== payload.threadId) throw new ToolError("not_allowed", "The original mailbox or message is no longer available.");
  const [conn] = await h.select({ s: connections.scopes }).from(connections).where(eq(connections.id, connectionId));
  if (!conn || !gmailAllowed(conn.s, "compose")) throw new ToolError("unavailable", RECONNECT);
  return createGmail({ getToken: googleTokenSource(h, { connectionId, fetch: o.fetch, now: o.now, key: o.key }), fetch: o.fetch });
}

const out = (m: { id: string; threadId: string }) => ({ messageId: m.id, threadId: m.threadId });
const mime = (p: MailReplyPayload, approvalId: string | null) =>
  buildReplyMime({ to: p.to, cc: p.cc, subject: p.subject, body: p.body, inReplyTo: p.inReplyTo, references: p.references, approvalId });

export async function sendReply(
  h: DB,
  { approvalId, payload, adopt, ...o }: { approvalId: string; payload: MailReplyPayload; adopt: boolean } & Opts,
): Promise<{ messageId: string; threadId: string }> {
  const gmail = await gmailFor(h, o, payload);
  const notFound = (e: unknown) => {
    if (!(e instanceof ProviderError && e.kind === "not_found")) throw e;
    return null;
  };
  // A definite send failure deletes the draft (best effort) so a retry never leaves an orphan in Drafts (WR-S03).
  const send = async (draftId: string) => {
    try {
      return out(await gmail.sendDraft(draftId));
    } catch (e) {
      if (e instanceof ProviderError && e.kind !== "unavailable") await gmail.deleteDraft(draftId).catch(() => undefined);
      throw e;
    }
  };
  try {
    const [ap] = await h.select({ r: approvals.result }).from(approvals).where(eq(approvals.id, approvalId));
    const cp = (ap?.r ?? {}) as { draftId?: string; draftMessageId?: string; at?: string };
    // Any checkpoint means an earlier attempt happened, whatever `adopt` says (WR-S03).
    if (adopt || cp.draftId) {
      // (a) the draft still exists: the send never landed.
      if (cp.draftId && (await gmail.getDraft(cp.draftId).catch(notFound))) return await send(cp.draftId);
      // (b) the draft is gone and its message carries SENT: the send landed.
      if (cp.draftMessageId) {
        const m = await gmail.getMetadata(cp.draftMessageId, ["Message-ID"]).catch(notFound);
        if (m?.labelIds?.includes("SENT")) return { messageId: m.id, threadId: m.threadId };
      }
      // (c) Gmail gave the sent copy a new id: find it by our deterministic Message-ID.
      const found = await gmail.findSent(replyMessageId(approvalId));
      if (found) return { messageId: found, threadId: payload.threadId };
      // (c2) Gmail may rewrite Message-ID and search lags: a SENT message in the thread since the checkpoint counts (WR-S02).
      // ponytail: an owner reply sent from Gmail itself in that window also counts; preferred over a double send.
      if (adopt && cp.at) {
        const since = Date.parse(cp.at) - 60_000; // clock-skew margin between the VM and Gmail
        const t = await gmail.getThread(payload.threadId).catch(notFound);
        const m = t?.messages?.find((x) => x.labelIds?.includes("SENT") && Number(x.internalDate) >= since);
        if (m) return { messageId: m.id, threadId: m.threadId };
      }
      // (d) nothing happened: fall through and send once.
    }
    const at = (o.now ?? (() => new Date()))().toISOString();
    const draft = await gmail.createDraft(mime(payload, approvalId), payload.threadId);
    await h.update(approvals).set({ result: { draftId: draft.id, draftMessageId: draft.message?.id ?? null, at } }).where(eq(approvals.id, approvalId));
    return await send(draft.id);
  } catch (e) {
    if (e instanceof ProviderError) {
      if (e.kind === "auth") await markCalendarError(h, payload.connectionId ?? "google_calendar", "Access was rejected.").catch(() => undefined);
      if (e.kind === "scope") throw new ToolError("unavailable", RECONNECT);
    }
    throw e;
  }
}

/** D-31: save a reply as a plain Gmail draft (no deterministic Message-ID; never sent from here). */
export async function saveReplyDraft(h: DB, payload: MailReplyPayload, o: Opts = {}): Promise<{ draftId: string }> {
  const gmail = await gmailFor(h, o, payload);
  try {
    return { draftId: (await gmail.createDraft(mime(payload, null), payload.threadId)).id };
  } catch (e) {
    if (e instanceof ProviderError && e.kind === "auth") await markCalendarError(h, payload.connectionId ?? "google_calendar", "Access was rejected.").catch(() => undefined);
    if (e instanceof ProviderError && e.kind === "scope") throw new ToolError("unavailable", RECONNECT);
    throw e;
  }
}
