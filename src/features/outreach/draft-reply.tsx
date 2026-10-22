"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ApprovalDTO } from "@/lib/agent-types";
import type { MailReplyPayload } from "@/lib/mail-payload";
import { mailOf, redirectNote, sameMail, toMailDraft, validateMailDraft, type MailDraftErrors } from "@/features/approvals/model/mail";
import { approveAction, rejectAction, saveEditAction } from "@/server/approval-actions";
import { saveReplyToDraftsAction } from "@/server/mail-actions";
import { useLiveEvents } from "@/features/shell/live-provider";
import { approvalsHref } from "@/features/shell/nav";
import { useShell } from "@/features/shell/shell-provider";
import { Button, ButtonLink } from "@/ui/button";
import { TextArea, TextField } from "@/ui/controls";
import { Status } from "@/ui/display";
import { Alert } from "@/ui/feedback";
import { hhmm } from "./fmt";
import s from "./outreach.module.css";

export function DraftReply({ mailId, approval, capReached, disabled, autoDraft, onAutoDrafted }: { mailId: string; approval: ApprovalDTO | null; capReached: boolean; disabled: boolean; autoDraft: boolean; onAutoDrafted: () => void }) {
  const router = useRouter();
  const { openAI } = useShell();
  const [phase, setPhase] = useState<"idle" | "drafting" | "failed" | "cap">("idle");
  const [local, setLocal] = useState<ApprovalDTO | null>(null);
  const [seen, setSeen] = useState(approval);
  if (seen !== approval) { setSeen(approval); setLocal(null); }
  const a = local && local.id === approval?.id ? local : approval;
  if (phase === "drafting" && a?.status === "pending") setPhase("idle");
  useLiveEvents("run", (dto) => {
    if (dto && phase === "drafting" && dto.prompt.includes(mailId) && ["completed", "failed", "cancelled", "expired"].includes(dto.status)) {
      setPhase(dto.errorKind === "cap" ? "cap" : "failed"); router.refresh();
    }
  });
  const start = () => {
    if (disabled) return;
    if (capReached) return setPhase("cap");
    setPhase("drafting"); openAI(`Draft a reply to email ${mailId}`);
  };
  const startRef = useRef(start);
  useEffect(() => { startRef.current = start; });
  useEffect(() => {
    if (!autoDraft) return;
    onAutoDrafted();
    if (!approval) startRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- consume this URL command once for this exact message
  }, [autoDraft]);
  const moved = a?.status === "rejected" && typeof (a.result as { gmailDraftId?: unknown } | null)?.gmailDraftId === "string";
  const pending = a?.status === "pending";
  return <div className={s.draft}>
    {pending ? <Pending key={a.id} a={a} onPatch={setLocal} disabled={disabled} /> : <div className={s.stack}>
      {a?.status === "executed" ? <Status tone="working" glyph="✓">Reply sent {hhmm(a.decidedAt ?? a.createdAt)} · Approved by you</Status>
        : a?.status === "approved" || a?.status === "executing" ? <Status tone="approval" glyph="…">Sending the approved reply…</Status>
        : a?.status === "failed" ? <Alert>Approved, but it couldn&apos;t be sent: {a.error ?? "unknown error"}. Nothing was sent.</Alert>
        : moved ? <Status tone="idle" glyph="–">Moved to Gmail drafts. Finish it in Gmail.</Status>
        : a?.status === "rejected" ? <Status tone="idle" glyph="–">Draft rejected</Status>
        : a?.status === "expired" ? <Status tone="idle" glyph="–">Draft expired</Status> : null}
      {phase === "drafting" ? <div role="status">Outreach is drafting. The reply will wait in Approvals. <Button variant="text" onClick={() => setPhase("idle")}>Stop waiting</Button></div> : <>
        {phase === "failed" && <Alert>The agent didn&apos;t draft a reply. Try again, or ask in chat.</Alert>}
        {phase === "cap" && <Alert tone="warn">Drafting is paused: monthly AI cap reached.</Alert>}
        <div className={s.actions}><Button icon="auto_awesome" disabled={disabled} onClick={start}>Ask Outreach to draft</Button><ButtonLink href={approvalsHref(a?.id)} variant="text">Open Approvals</ButtonLink></div>
      </>}
    </div>}
    <p className={s.meta}>Replies only send after your approval.</p>
  </div>;
}

function Pending({ a, onPatch, disabled }: { a: ApprovalDTO; onPatch: (a: ApprovalDTO) => void; disabled: boolean }) {
  const { toast } = useShell();
  const saved = mailOf(a);
  const [draft, setDraft] = useState(() => toMailDraft(saved));
  const [base, setBase] = useState(saved);
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<MailDraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const edited = a.edited != null && !sameMail(saved, a.original as MailReplyPayload);
  const startEdit = () => { setDraft(toMailDraft(saved)); setBase(saved); setErrors({}); setEditing(true); };
  const check = () => {
    if (!sameMail(base, saved)) { startEdit(); toast("This draft changed while you were editing. Showing the latest version; check it and try again.", "error"); return null; }
    const r = validateMailDraft(a.tool, saved, draft);
    if ("errors" in r) { setErrors(r.errors); setEditing(true); return null; }
    setErrors({}); return r.payload;
  };
  const run = async (fn: () => Promise<{ ok: boolean; approval?: ApprovalDTO; errors?: Record<string, string> }>, done: string) => {
    if (busy) return false;
    setBusy(true); setError("");
    const r = await fn().catch(() => ({ ok: false })); setBusy(false);
    if ("approval" in r && r.approval) onPatch(r.approval);
    if ("errors" in r && r.errors) { setErrors(r.errors); setEditing(true); return false; }
    if (!r.ok) { setError("Couldn't record that decision. Try again."); return false; }
    toast(done); return true;
  };
  const approve = () => { const payload = editing ? check() : saved; if (payload) void run(() => approveAction(a.id, editing && !sameMail(payload, saved) ? payload : undefined), "Reply approved · sending"); };
  const done = async () => { const payload = check(); if (!payload) return; if (!sameMail(payload, saved) && !(await run(() => saveEditAction(a.id, payload), "Draft saved"))) return; setEditing(false); };
  const toDrafts = () => void run(async () => {
    const r = await saveReplyToDraftsAction(a.id);
    return r.ok ? { ok: true, approval: { ...a, status: "rejected" as const, decidedAt: new Date().toISOString(), result: { gmailDraftId: r.gmailDraftId } } } : { ok: false };
  }, "Saved to Gmail drafts");
  return <div className={s.stack}>
    <Status tone="approval" glyph="!" mono>Reply drafted by Outreach · Awaiting your approval{edited ? " · Edited" : ""}</Status>
    <Alert tone="warn" role="note">Drafted from untrusted email content. Check it before approving. Replies only go to people already in this thread.</Alert>
    <div className={s.meta}>To {saved.to.map((x) => x.name ? `${x.name} <${x.address}>` : x.address).join(", ")}{saved.cc.length > 0 && ` · Cc ${saved.cc.map((x) => x.address).join(", ")}`}</div>
    {redirectNote(saved) && <Alert tone="warn">{redirectNote(saved)}</Alert>}
    {editing ? <><TextField label="Subject" value={draft.subject} error={errors.subject} maxLength={200} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /><TextArea label="Edit draft reply" value={draft.body} error={errors.body} rows={10} maxLength={10000} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></> : <><strong>{saved.subject}</strong><p className={s.draftBody}>{saved.body}</p></>}
    {Object.keys(errors).length > 0 && <Alert>Check the draft fields before saving.</Alert>}{error && <Alert>{error}</Alert>}
    <div className={s.actions}><Button variant="primary" disabled={busy || disabled} onClick={approve}>{editing ? "Approve with edits & send" : "Approve & send"}</Button><Button disabled={busy} onClick={() => editing ? void done() : startEdit()}>{editing ? "Done editing" : "Edit draft"}</Button><Button disabled={busy || editing || disabled} onClick={toDrafts}>Save to Gmail drafts</Button><Button variant="text" destructive disabled={busy} onClick={() => void run(() => rejectAction(a.id), "Draft rejected")}>Reject draft</Button><ButtonLink href={approvalsHref(a.id)} variant="text">Review in Approvals</ButtonLink></div>
  </div>;
}
