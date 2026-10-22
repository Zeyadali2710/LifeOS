// Moved from the pre-Almanac approval UI: logic only, unchanged.
import { payloadSchemaFor } from "@/lib/approval-kinds";
import type { ApprovalDTO } from "@/lib/agent-types";
import type { MailReplyPayload } from "@/lib/mail-payload";

type Addr = { name: string; address: string };

export const mailOf = (a: Pick<ApprovalDTO, "edited" | "original">) => (a.edited ?? a.original) as MailReplyPayload;

export type MailDraft = { subject: string; body: string };
export type MailDraftErrors = Partial<Record<keyof MailDraft, string>>;

export const toMailDraft = (p: MailReplyPayload): MailDraft => ({ subject: p.subject, body: p.body });

/** Same schema the server re-runs on approve. Recipients, thread and headers always come from `base`. */
export function validateMailDraft(tool: string, base: MailReplyPayload, d: MailDraft): { payload: MailReplyPayload } | { errors: MailDraftErrors } {
  const r = payloadSchemaFor(tool).safeParse({ ...base, subject: d.subject, body: d.body });
  if (r.success) return { payload: r.data as MailReplyPayload };
  const errors: MailDraftErrors = {};
  for (const i of r.error.issues) {
    const k = i.path[0];
    if (k === "subject" || k === "body") errors[k] ??= i.message;
  }
  if (!Object.keys(errors).length) errors.body = "Check the reply.";
  return { errors };
}

export const sameMail = (a: MailReplyPayload, b: MailReplyPayload) => a.subject === b.subject && a.body === b.body;

/** Set when the reply goes to a Reply-To address that isn't the email's sender (WR-U06). */
export function redirectNote(p: MailReplyPayload): string | null {
  const to = p.to?.[0]?.address;
  return p.from && to && p.from.address.toLowerCase() !== to.toLowerCase() ? `Replies go to ${to} (the email's Reply-To), not the sender ${p.from.address}.` : null;
}

const nameOf = (a?: Addr) => a?.name || a?.address || "the sender";
const list = (xs: Addr[]) => xs.map((x) => x.address).join(", ");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- resolved texts (UI-SPEC) ----
export function mailResolved(a: ApprovalDTO, at: string): { text: string; href: string | null; reconnect: boolean } | null {
  const p = mailOf(a);
  const name = nameOf(p.to?.[0]);
  if (a.status === "approved" || a.status === "executing") return { text: "Sending the reply…", href: null, reconnect: false };
  if (a.status === "executed") {
    // the link target is the local mail row (validated), never anything from the Gmail result
    return { text: `Reply sent to ${name}. Approved at ${at}.`, href: UUID.test(p.messageId ?? "") ? `/outreach?tab=email&mail=${p.messageId}` : null, reconnect: false };
  }
  if (a.status === "failed") {
    const err = (a.error ?? "unknown error").replace(/\.$/, "");
    return { text: `Approved, but it couldn't be sent: ${err}. Nothing was sent.`, href: null, reconnect: /Reconnect Google/.test(err) };
  }
  if (a.status === "rejected" && typeof (a.result as { gmailDraftId?: unknown } | null)?.gmailDraftId === "string") {
    return { text: "Moved to Gmail drafts. Finish it in Gmail.", href: null, reconnect: false };
  }
  return null;
}
