"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ApprovalDTO } from "@/lib/agent-types";
import type { MailReplyPayload } from "@/lib/mail-payload";
import { mailOf, redirectNote, sameMail, toMailDraft, validateMailDraft, type MailDraft, type MailDraftErrors } from "@/approvals/mail-approval";
import { approveAction, rejectAction, saveEditAction } from "@/server/approval-actions";
import { saveReplyToDraftsAction } from "@/server/mail-actions";
import { useLiveEvents } from "@/shell/live-provider";
import { useShell } from "@/shell/shell-provider";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Field, Input, Textarea } from "@/ui/field";
import { Icon } from "@/ui/icon";
import { Skeleton } from "@/ui/skeleton";
import { hhmm } from "./fmt";

type Busy = "approve" | "reject" | "save" | "draft" | null;
type Res = { ok: boolean; approval?: ApprovalDTO; errors?: Record<string, string> };
const TERMINAL = ["completed", "failed", "cancelled", "expired"];
const mono = "font-code text-[11.5px] break-words";

/** Resolved (non-pending) approvals that still show something; anything else falls back to "No reply drafted." */
function resolvedLine(a: ApprovalDTO): { text: string; link: boolean } | null {
  if (a.status === "approved" || a.status === "executing") return { text: "Sending the reply…", link: false };
  if (a.status === "executed") return { text: `Reply sent ${hhmm(a.decidedAt ?? a.createdAt)}.`, link: false };
  if (a.status === "failed") return { text: `Approved, but it couldn't be sent: ${(a.error ?? "unknown error").replace(/\.$/, "")}. Nothing was sent.`, link: false };
  if (a.status === "rejected" && typeof (a.result as { gmailDraftId?: unknown } | null)?.gmailDraftId === "string") return { text: "Moved to Gmail drafts. Finish it in Gmail.", link: true };
  return null;
}

export function DraftReply({
  mailId,
  approval,
  capReached,
  autoDraft,
  onAutoDrafted,
  extraActions,
}: {
  mailId: string;
  approval: ApprovalDTO | null;
  capReached: boolean;
  autoDraft: boolean;
  onAutoDrafted: () => void;
  extraActions: ReactNode;
}) {
  const router = useRouter();
  const { openAI } = useShell();
  // actions return the fresh approval; it wins over the server prop until the prop itself changes
  const [local, setLocal] = useState<ApprovalDTO | null>(null);
  const [seen, setSeen] = useState(approval);
  if (seen !== approval) {
    setSeen(approval);
    setLocal(null);
  }
  const a = local && local.id === approval?.id ? local : approval;
  const [phase, setPhase] = useState<"idle" | "drafting" | "failed" | "cap">("idle");
  // the draft arrived: a later reject/expiry ends the run, which must not read as "the agent didn't draft" (WR-U04)
  if (phase === "drafting" && a?.status === "pending") setPhase("idle");

  useLiveEvents("run", (dto) => {
    if (dto && phase === "drafting" && dto.prompt.includes(mailId) && TERMINAL.includes(dto.status)) {
      setPhase(dto.errorKind === "cap" ? "cap" : "failed");
      router.refresh();
    }
  });

  const start = () => {
    if (capReached) return setPhase("cap");
    setPhase("drafting");
    openAI(`Draft a reply to email ${mailId}`);
  };
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });
  // follow-up link: ?draft=1 starts the draft once, then the param is dropped
  useEffect(() => {
    if (!autoDraft) return;
    onAutoDrafted();
    if (!approval) startRef.current();
    // one-shot per param
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDraft]);

  const live = a && (a.status === "pending" || resolvedLine(a)) ? a : null;
  const drafting = !live && phase === "drafting";

  return (
    <section aria-labelledby={`draft-${mailId}`} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon name="reply" size={16} className="text-text-3" />
        <h3 id={`draft-${mailId}`} className="text-[11px] font-medium tracking-[.14em] text-text-3">
          DRAFT REPLY · OUTREACH AGENT
        </h3>
        <span className="ml-auto">
          <Badge kind="tag" tone="neutral">
            NOT SENT
          </Badge>
        </span>
      </div>
      {live?.status === "pending" ? (
        <Pending key={live.id} a={live} onPatch={setLocal} extraActions={extraActions} />
      ) : (
        <>
          {live ? (
            <Resolved a={live} />
          ) : drafting ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-[92%]" />
              <Skeleton className="h-3.5 w-[96%]" />
              <Skeleton className="h-3.5 w-[60%]" />
              <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-3">
                Outreach agent is drafting… Follow it in the AI panel.
                <button type="button" onClick={() => setPhase("idle")} className="text-cyan">
                  Stop waiting
                </button>
              </p>
            </div>
          ) : (
            <p className="text-[13.5px] text-text-2">
              {phase === "failed" ? "The agent didn't draft a reply. Try again, or ask in chat." : phase === "cap" ? "Drafting is paused: monthly AI cap reached." : "No reply drafted."}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!live && !drafting && (
              <Button size="sm" onClick={start}>
                <Icon name="auto_awesome" size={16} />
                Draft with agent
              </Button>
            )}
            {extraActions}
          </div>
        </>
      )}
      <p className="text-[12.5px] text-text-3">Reply opens an approval. Nothing sends automatically.</p>
    </section>
  );
}

function Resolved({ a }: { a: ApprovalDTO }) {
  const r = resolvedLine(a)!;
  const ok = a.status === "executed";
  return (
    <p className="flex flex-wrap items-center gap-2 text-[13.5px] text-text-2">
      <Icon name={ok ? "check_circle" : a.status === "failed" ? "error" : "mail"} size={16} className={ok ? "text-green" : a.status === "failed" ? "text-red" : "text-text-3"} />
      {r.text}
      {r.link && (
        <a href="https://mail.google.com/mail/u/0/#drafts" target="_blank" rel="noopener noreferrer" className="text-cyan">
          Open Gmail drafts
        </a>
      )}
    </p>
  );
}

function Pending({ a, onPatch, extraActions }: { a: ApprovalDTO; onPatch: (a: ApprovalDTO) => void; extraActions: ReactNode }) {
  const { toast } = useShell();
  const saved = mailOf(a);
  const [draft, setDraft] = useState<MailDraft>(() => toMailDraft(saved));
  // the payload the editor was seeded from; if the approval changes underneath, the edit is refused (CR-U02)
  const [base, setBase] = useState(saved);
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<MailDraftErrors>({});
  const [busy, setBusy] = useState<Busy>(null);
  const edited = a.edited != null && !sameMail(saved, a.original as MailReplyPayload);

  const guard = async (k: NonNullable<Busy>, fn: () => Promise<Res>, done?: string) => {
    setBusy(k);
    const r = await fn().catch(() => ({ ok: false }) as Res);
    setBusy(null);
    if (r.approval) onPatch(r.approval);
    if (r.errors) {
      setErrors(r.errors);
      setEditing(true);
      return false;
    }
    if (!r.ok) {
      toast("Couldn't record that decision. Try again.", "error");
      return false;
    }
    if (done) toast(done);
    return true;
  };
  const startEdit = () => {
    setDraft(toMailDraft(saved));
    setBase(saved);
    setErrors({});
    setEditing(true);
  };
  const check = () => {
    if (!sameMail(base, saved)) {
      startEdit();
      toast("This draft changed while you were editing. Showing the latest version; check it and try again.", "error");
      return null;
    }
    const v = validateMailDraft(a.tool, saved, draft);
    if ("errors" in v) {
      setErrors(v.errors);
      setEditing(true);
      return null;
    }
    setErrors({});
    return v.payload;
  };
  const approve = () => {
    const payload = editing ? check() : saved;
    if (!payload) return;
    void guard("approve", () => approveAction(a.id, editing && !sameMail(payload, saved) ? payload : undefined), "Reply approved · sending");
  };
  const done = async () => {
    const payload = check();
    if (!payload) return;
    if (!sameMail(payload, saved) && !(await guard("save", () => saveEditAction(a.id, payload)))) return;
    setEditing(false);
  };
  // the action returns no approval row: patch the visible one so the resolved state shows at once (live frames confirm it)
  const toDrafts = () =>
    void guard(
      "draft",
      async () => {
        const r = await saveReplyToDraftsAction(a.id);
        return r.ok ? { ok: true, approval: { ...a, status: "rejected" as const, decidedAt: new Date().toISOString(), result: { gmailDraftId: r.gmailDraftId } } } : { ok: false };
      },
      "Saved to Gmail drafts",
    );
  const off = (k: Busy) => busy !== null && busy !== k;

  return (
    <div className="flex flex-col gap-3">
      <div role="note" className="rounded-14 border border-[rgba(255,159,10,.30)] bg-[rgba(255,159,10,.06)] p-4">
        <div className="flex items-center gap-2 text-[13.5px]">
          <Icon name="warning" size={18} className="shrink-0 text-amber" />
          Drafted from email content (untrusted)
        </div>
        <p className="mt-1 text-[12.5px] text-text-2">The original email was written by someone else. Check the reply before approving; nothing sends until you do.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        {(
          [
            ["To", saved.to],
            ["Cc", saved.cc],
          ] as const
        )
          .filter(([, xs]) => xs.length > 0)
          .map(([k, xs]) => (
            <div key={k} className="flex items-start gap-2 text-text-2" aria-describedby={`locked-${a.id}`}>
              <Icon name="lock" size={14} className="mt-0.5 shrink-0 text-text-3" />
              <span className="w-5 shrink-0 text-[12.5px] text-text-3">{k}</span>
              <span className={mono}>{xs.map((x) => (x.name ? `${x.name} <${x.address}>` : x.address)).join(", ")}</span>
            </div>
          ))}
        <p id={`locked-${a.id}`} className="text-[12.5px] text-text-3">
          Replies only go to people already in this thread.
        </p>
        {redirectNote(saved) && <p className="text-[12.5px] break-words text-amber">{redirectNote(saved)}</p>}
      </div>
      {editing ? (
        <div className="flex flex-col gap-4">
          <Field label="Subject" error={errors.subject}>
            <Input value={draft.subject} maxLength={200} required onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </Field>
          <Field label="Body" error={errors.body}>
            <Textarea rows={10} maxLength={10000} aria-label="Edit draft reply" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </Field>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-14 border border-white/[.08] bg-white/[.03] p-4">
          <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium break-words">
            {saved.subject}
            {edited && (
              <Badge kind="tag" tone="amber">
                EDITED
              </Badge>
            )}
          </div>
          <p className="text-[14px] leading-[1.65] break-words whitespace-pre-wrap text-text-2">{saved.body}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={busy === "approve"} disabled={off("approve")} onClick={approve}>
          <Icon name="check" size={16} />
          Send reply
        </Button>
        <Button variant="secondary" size="sm" loading={busy === "save"} disabled={off("save")} onClick={() => (editing ? void done() : startEdit())}>
          {editing ? "Done editing" : "Edit draft"}
        </Button>
        <Button variant="secondary" size="sm" disabled={editing || off("draft")} loading={busy === "draft"} onClick={toDrafts}>
          Save to Gmail drafts
        </Button>
        <Button variant="ghost" size="sm" className="!text-red" loading={busy === "reject"} disabled={off("reject")} onClick={() => void guard("reject", () => rejectAction(a.id), "Draft rejected")}>
          Reject draft
        </Button>
        {extraActions}
      </div>
    </div>
  );
}
