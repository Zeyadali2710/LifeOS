"use client";

import { useId } from "react";
import { payloadSchemaFor } from "@/lib/approval-kinds";
import type { ApprovalDTO } from "@/lib/agent-types";
import type { MailReplyPayload } from "@/lib/mail-payload";
import { Badge } from "@/ui/badge";
import { Disclosure } from "@/ui/disclosure";
import { Field, Input, Textarea } from "@/ui/field";
import { Icon } from "@/ui/icon";
import { Fact } from "./event-approval";

// mail_reply approval body (D-30..D-32) and its edit form. Client-safe. All third-party text is rendered as text nodes.
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

// ---- views ----
const mono = "font-code text-[11.5px] break-words";

function Recipients({ p, describedBy }: { p: MailReplyPayload; describedBy?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {([["To", p.to], ["Cc", p.cc]] as const)
        .filter(([, xs]) => xs.length > 0)
        .map(([k, xs]) => (
          <div key={k} className="flex items-start gap-2 text-text-2" aria-describedby={describedBy}>
            <Icon name="lock" size={14} className="mt-0.5 shrink-0 text-text-3" />
            <span className="w-5 shrink-0 text-[12.5px] text-text-3">{k}</span>
            <span className={mono}>{xs.map((x) => (x.name ? `${x.name} <${x.address}>` : x.address)).join(", ")}</span>
          </div>
        ))}
    </div>
  );
}

function Preview({ p, helperId }: { p: MailReplyPayload; helperId?: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-14 border border-white/[.08] bg-white/[.03] p-4">
      <Recipients p={p} describedBy={helperId} />
      <div className="text-[15px] font-medium break-words">{p.subject}</div>
      <p className="text-[14px] leading-[1.65] break-words whitespace-pre-wrap text-text-2">{p.body}</p>
    </div>
  );
}

type BodyProps = { approval: ApprovalDTO; editing: boolean; draft: MailDraft; errors: MailDraftErrors; onDraft: (d: MailDraft) => void; edited?: boolean };

/** Everything between the header and the decision footer for mail_reply. */
export function MailApprovalBody({ approval: a, editing, draft, errors, onDraft, edited }: BodyProps) {
  const helperId = useId();
  const p = mailOf(a);
  const orig = a.original as MailReplyPayload;
  const first = nameOf(p.to?.[0]);
  const others = (p.to?.length ?? 0) - 1;
  const len = editing && a.status === "pending" ? draft.body.length : p.body.length;
  return (
    <>
      <section className="border-b border-[rgba(255,255,255,.06)] px-5 py-5">
        <div role="note" className="rounded-14 border border-[rgba(255,159,10,.30)] bg-[rgba(255,159,10,.06)] p-4">
          <div className="flex items-center gap-2 text-[13.5px]">
            <Icon name="warning" size={18} className="shrink-0 text-amber" />
            Drafted from email content (untrusted)
          </div>
          <p className="mt-1 text-[12.5px] text-text-2">The original email was written by someone else. Check the reply before approving; nothing sends until you do.</p>
        </div>
      </section>
      <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-6 gap-y-[18px] border-b border-[rgba(255,255,255,.06)] px-5 py-5">
        <Fact k="WHAT WILL HAPPEN">
          Sends a reply to {first}
          {others > 0 ? ` and ${others} other${others > 1 ? "s" : ""}` : ""} in the thread &quot;{p.originalSubject}&quot;.
        </Fact>
        <Fact k="WHERE">Gmail</Fact>
        <Fact k="WHEN">Immediately after approval</Fact>
      </section>
      <section className="border-b border-[rgba(255,255,255,.06)] px-5 py-5">
        <div className="mb-3 text-[10px] tracking-[0.14em] text-text-3">WHAT DATA WILL BE SENT</div>
        <ul className="flex flex-col gap-1.5 text-[13px]">
          <li className="flex items-center gap-2">
            <Icon name="check_circle" size={16} className="shrink-0 text-green" />
            Your reply ({len} characters)
          </li>
          <li className="flex items-start gap-2 break-words">
            <Icon name="check_circle" size={16} className="mt-0.5 shrink-0 text-green" />
            <span className={mono}>
              To {list(p.to ?? [])}
              {p.cc?.length ? `, cc ${list(p.cc)}` : ""}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Icon name="shield" size={16} className="shrink-0 text-cyan" />
            Only to people already in this thread
          </li>
          <li className="flex items-center gap-2">
            <Icon name="shield" size={16} className="shrink-0 text-cyan" />
            Sent once, even if a retry happens
          </li>
        </ul>
      </section>
      <section className="border-b border-[rgba(255,255,255,.06)] px-5 py-5">
        <div className="mb-3 flex items-center gap-2 text-[10px] tracking-[0.14em] text-text-3">
          PREVIEW
          {edited && (
            <Badge kind="tag" tone="amber">
              EDITED
            </Badge>
          )}
        </div>
        {editing && a.status === "pending" ? (
          <div className="flex flex-col gap-4">
            <Recipients p={p} describedBy={helperId} />
            <p id={helperId} className="-mt-2 text-[12.5px] text-text-3">
              Recipients are locked to the original thread.
            </p>
            <Field label="Subject" error={errors.subject}>
              <Input value={draft.subject} maxLength={200} required onChange={(e) => onDraft({ ...draft, subject: e.target.value })} />
            </Field>
            <Field label="Body" error={errors.body}>
              <Textarea rows={12} value={draft.body} maxLength={10000} onChange={(e) => onDraft({ ...draft, body: e.target.value })} />
            </Field>
          </div>
        ) : (
          <Preview p={p} />
        )}
        {edited && (
          <div className="mt-3 text-[12.5px] text-text-2">
            <Disclosure summary={<span>View agent&apos;s original</span>}>
              <div className="pt-2">
                <Preview p={orig} />
              </div>
            </Disclosure>
          </div>
        )}
      </section>
    </>
  );
}
