"use client";

import { useEffect, useRef, useState } from "react";
import type { ApprovalDTO } from "@/lib/agent-types";
import { nothingText, payloadSchemaFor, type ApprovalKind } from "@/lib/approval-kinds";
import { issuePayloadSchema, type IssuePayload } from "@/lib/issue-payload";
import type { MailReplyPayload } from "@/lib/mail-payload";
import { isSafeGithubUrl } from "@/lib/safe-url";
import { approveAction, rejectAction, retryApprovalAction, saveEditAction } from "@/server/approval-actions";
import { saveReplyToDraftsAction } from "@/server/mail-actions";
import { getAgent } from "@/server/agents/registry";
import { formatHM } from "@/server/time";
import { useShell } from "@/shell/shell-provider";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Disclosure } from "@/ui/disclosure";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";
import { ApprovalEditForm, toDraft, toPayload, validateDraft, type Draft, type DraftErrors } from "./approval-edit-form";
import { stamp } from "./approval-list";
import { ProjectApprovalBody, projectOf, projectResolved, sameProject, toProjectDraft, validateProjectDraft, type ProjectDraft, type ProjectErrors, type ProjectPayload } from "./project-approval";
import { MailApprovalBody, mailOf, mailResolved, sameMail, toMailDraft, validateMailDraft, type MailDraft, type MailDraftErrors } from "./mail-approval";
import { EventApprovalBody, Fact, eventOf, eventResolved, sameEvent, toEventDraft, validateEventDraft, type EventDraft, type EventDraftErrors, type EventPayload } from "./event-approval";

export type WriteFacts = { connected: boolean; login: string | null; last4: string | null };

/** Narrow a kind-tagged approval to its issue payloads (null for event kinds, and for an issue row whose payload doesn't parse). */
export function issueOf(a: { kind: ApprovalKind; edited: unknown; original: unknown }): { original: IssuePayload; current: IssuePayload } | null {
  if (a.kind !== "issue") return null;
  // safeParse: one malformed row must not throw during render and take the whole list or transcript down (WR-B10)
  const original = issuePayloadSchema.safeParse(a.original);
  const current = a.edited == null ? original : issuePayloadSchema.safeParse(a.edited);
  return original.success && current.success ? { original: original.data, current: current.data } : null;
}

/** Shown instead of a request whose stored payload can't be read. */
export function UnreadableApproval() {
  return <p className="rounded-14 border border-white/[.08] bg-white/[.03] p-4 text-[13.5px] text-text-2">This request can&apos;t be displayed. It expires on its own.</p>;
}

const same = (a: IssuePayload, b: IssuePayload) => a.title === b.title && a.body === b.body && a.labels.join("\n") === b.labels.join("\n");

function Preview({ p }: { p: IssuePayload }) {
  return (
    <div className="rounded-14 border border-white/[.08] bg-white/[.03] p-4">
      <div className="text-[15px] font-medium break-words">{p.title}</div>
      {p.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.labels.map((l) => (
            <Badge key={l} kind="tag" tone="neutral">
              {l}
            </Badge>
          ))}
        </div>
      )}
      {p.body && <p className="mt-3 text-[14px] leading-[1.65] break-words whitespace-pre-wrap text-text-2">{p.body}</p>}
    </div>
  );
}


function Resolved({ a, onRetry, retrying }: { a: ApprovalDTO; onRetry: () => void; retrying: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const at = formatHM(new Date(a.decidedAt ?? a.createdAt));
  const issue = a.kind === "issue";
  const nothing = nothingText(a.kind);
  const res = a.result as { number?: number; url?: string } | null;
  const repo = issue ? ((a.edited ?? a.original) as { repo: string }).repo : "";
  const proj = a.kind === "project_create" || a.kind === "project_update";
  const upd = a.kind === "project_update";
  const mail = a.kind === "mail_reply";
  const ev = issue ? null : proj ? projectResolved(a, at) : mail ? mailResolved(a, at) : eventResolved(a, at);
  let icon: IconName = "block";
  let tone = "text-red";
  let bg = "bg-[rgba(240,122,110,.06)]";
  let text = `Rejected at ${at}. ${nothing} The run was cancelled.`;
  if (a.status === "approved" || a.status === "executing") {
    icon = "schedule";
    tone = "text-cyan";
    bg = "bg-fill-1";
    text = issue ? "Creating the issue on GitHub…" : proj ? (upd ? "Updating the project…" : "Creating the project…") : mail ? "Sending the reply…" : "Applying the change…";
  } else if (a.status === "executed") {
    icon = "check_circle";
    tone = "text-green";
    bg = "bg-[rgba(79,209,161,.06)]";
    text = issue ? `Issue created: ${repo}#${res?.number ?? ""}. Approved at ${at}.` : (ev?.text ?? `Done. Approved at ${at}.`);
  } else if (a.status === "failed") {
    icon = "error";
    text = issue ? `Approved, but GitHub rejected it: ${a.error ?? "unknown error"}. Nothing was created.` : (ev?.text ?? `Approved, but it was rejected: ${a.error ?? "unknown error"}. ${nothing}`);
  } else if (a.status === "expired") {
    icon = "schedule";
    tone = "text-text-3";
    bg = "bg-[rgba(255,255,255,.03)]";
    text = `Expired ${stamp(a.expiresAt)}. ${nothing} The run was cancelled.`;
  } else if (a.status === "cancelled") {
    tone = "text-text-3";
    bg = "bg-[rgba(255,255,255,.03)]";
    text = `The run was cancelled before this was decided. ${nothing}`;
  }
  if (mail && a.status === "rejected" && ev) {
    icon = "mail";
    tone = "text-cyan";
    bg = "bg-fill-1";
    text = ev.text;
  }
  return (
    <div ref={ref} role="status" tabIndex={-1} className={`flex animate-[lo-fade_200ms_ease-out] flex-wrap items-center gap-3 px-5 py-4 text-[13px] text-text-2 outline-none ${bg}`}>
      <Icon name={icon} size={18} className={tone} />
      <span className="min-w-0 flex-1 break-words">{text}</span>
      {issue && a.status === "executed" && isSafeGithubUrl(res?.url) && (
        <a href={res.url} target="_blank" rel="noopener noreferrer" className="rounded-6 border border-[rgba(255,255,255,.1)] px-2.5 py-1 text-[12.5px] text-text hover:bg-fill-2">
          View on GitHub
        </a>
      )}
      {ev?.href && (
        <a href={ev.href} className="rounded-6 border border-[rgba(255,255,255,.1)] px-2.5 py-1 text-[12.5px] text-text hover:bg-fill-2">
          {proj ? "Open project" : mail ? "Open email" : "View in calendar"}
        </a>
      )}
      {mail && a.status === "failed" && mailResolved(a, at)?.reconnect === true && (
        <a href="/settings?section=connections" className="text-[12.5px] text-cyan hover:text-cyan-soft">
          Reconnect Google in Settings
        </a>
      )}
      {a.status === "failed" && (
        <Button size="xs" loading={retrying} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

type DetailProps = { approval: ApprovalDTO; write: WriteFacts; onChange: (a: ApprovalDTO) => void };

/** Dispatches on kind; the GitHub issue view is IssueApprovalBody, unchanged from Phase 3. */
export function ApprovalDetail(props: DetailProps) {
  const issue = issueOf(props.approval);
  if (issue) return <IssueApprovalBody {...props} issue={issue} />;
  if (props.approval.kind === "issue") return <UnreadableApproval />;
  if (props.approval.kind === "project_create" || props.approval.kind === "project_update") {
    // safeParse: a malformed stored payload must not throw during render
    return payloadSchemaFor(props.approval.tool).safeParse(projectOf(props.approval)).success ? <ProjectApprovalShell {...props} /> : <UnreadableApproval />;
  }
  if (props.approval.kind === "mail_reply") {
    return payloadSchemaFor(props.approval.tool).safeParse(mailOf(props.approval)).success ? <MailApprovalShell {...props} /> : <UnreadableApproval />;
  }
  if (props.approval.kind === "social_publish") return <UnreadableApproval />;
  return <EventApprovalShell {...props} />;
}

const EVENT_VERB: Record<ApprovalKind, string> = {
  issue: "",
  event_create: "add a calendar event",
  event_update: "change a calendar event",
  event_delete: "delete a calendar event",
  project_create: "create a project",
  project_update: "change a project",
  mail_reply: "send an email reply",
  social_publish: "publish a social post",
};
const EVENT_OK: Record<ApprovalKind, string> = { issue: "", event_create: "ADD TO CALENDAR", event_update: "UPDATE EVENT", event_delete: "DELETE EVENT", project_create: "CREATE PROJECT", project_update: "UPDATE PROJECT", mail_reply: "SEND REPLY", social_publish: "PUBLISH" };

// Event kinds: shared header, reason, expiry and decisions around EventApprovalBody.
function EventApprovalShell({ approval: a, onChange }: DetailProps) {
  const { toast } = useShell();
  const [busy, setBusy] = useState<"approve" | "reject" | "save" | "retry" | null>(null);
  const saved = eventOf(a);
  const [draft, setDraft] = useState<EventDraft>(() => toEventDraft(saved));
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<EventDraftErrors>({});
  const agent = getAgent(a.agentId);
  const del = a.kind === "event_delete";
  const pending = a.status === "pending";
  const edited = a.edited != null && !sameEvent(saved, a.original as EventPayload);
  const stale = a.targetChanged === true;
  const guard = async (k: NonNullable<typeof busy>, fn: () => Promise<{ ok: boolean; approval?: ApprovalDTO; errors?: Record<string, string> }>, done?: string) => {
    setBusy(k);
    const r = await fn().catch(() => ({ ok: false }) as { ok: boolean; approval?: ApprovalDTO; errors?: Record<string, string> });
    setBusy(null);
    if (r.approval) onChange(r.approval);
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
  const check = () => {
    const v = validateEventDraft(a.tool, saved, draft);
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
    void guard("approve", () => approveAction(a.id, editing && !sameEvent(payload, saved) ? payload : undefined), "Calendar updated");
  };
  const done = async () => {
    const payload = check();
    if (!payload) return;
    if (!sameEvent(payload, saved) && !(await guard("save", () => saveEditAction(a.id, payload)))) return;
    setEditing(false);
  };
  return (
    <article aria-label="Approval detail" className={`glass-card overflow-hidden rounded-24 ${del ? "!border-[rgba(255,69,58,.4)]" : ""}`}>
      <header className="border-b border-[rgba(255,255,255,.06)] bg-[linear-gradient(180deg,rgba(232,184,106,.06),transparent)] px-5 py-5">
        <div className="mb-2 text-[11px] font-medium tracking-[0.12em]">
          <span className="uppercase" style={{ color: agent?.color }}>
            {agent?.name ?? a.agentId}
          </span>{" "}
          <span className="text-text-3">wants to</span> <span>{EVENT_VERB[a.kind]}</span>
        </div>
        <h2 className="font-display text-[26px] leading-[1.12] font-medium break-words">{editing ? draft.title : saved.title}</h2>
      </header>
      {a.reason && (
        <section className="border-b border-[rgba(255,255,255,.06)] px-5 py-5">
          <Fact k="WHY">{a.reason}</Fact>
        </section>
      )}
      <EventApprovalBody approval={a} editing={editing} draft={draft} errors={errors} onDraft={setDraft} edited={edited} />
      {pending ? (
        <footer className="px-5 py-4">
          {stale && <p className="mb-3 text-[12.5px] text-amber">This event changed after the request was prepared, so it can&apos;t be applied. Reject it and ask again.</p>}
          <div className="flex flex-wrap items-center gap-2.5 max-[719px]:flex-col max-[719px]:items-stretch [&_button]:text-[13px] [&_button]:font-semibold [&_button]:tracking-[0.06em] [&_button]:uppercase max-[719px]:[&_button]:h-12">
            <Button
              className={`h-[38px] min-w-[150px] rounded-full px-[18px] ${del ? "bg-red text-on-accent hover:bg-red" : ""}`}
              loading={busy === "approve"}
              disabled={stale || (busy !== null && busy !== "approve")}
              onClick={approve}
            >
              <Icon name="check" size={16} />
              {EVENT_OK[a.kind]}
            </Button>
            {!del && (
              <Button variant="secondary" className="h-[38px]" loading={busy === "save"} disabled={busy !== null && busy !== "save"} onClick={() => (editing ? void done() : (setDraft(toEventDraft(saved)), setErrors({}), setEditing(true)))}>
                {editing ? "DONE" : "EDIT"}
              </Button>
            )}
            <Button variant="destructive" className="h-[38px]" autoFocus={del} loading={busy === "reject"} disabled={busy !== null && busy !== "reject"} onClick={() => void guard("reject", () => rejectAction(a.id), "Approval rejected")}>
              REJECT
            </Button>
            <span className="flex-1" />
            <span className="text-[11px] text-text-3">
              requested {formatHM(new Date(a.createdAt))} · expires {stamp(a.expiresAt)}
            </span>
          </div>
        </footer>
      ) : (
        <Resolved a={a} retrying={busy === "retry"} onRetry={() => void guard("retry", () => retryApprovalAction(a.id))} />
      )}
    </article>
  );
}

// mail_reply: same shell as events around MailApprovalBody, plus SAVE TO GMAIL DRAFTS (D-31).
function MailApprovalShell({ approval: a, onChange }: DetailProps) {
  const { toast } = useShell();
  const [busy, setBusy] = useState<"approve" | "reject" | "save" | "retry" | "draft" | null>(null);
  const saved = mailOf(a);
  const [draft, setDraft] = useState<MailDraft>(() => toMailDraft(saved));
  // the payload the editor was seeded from; if the approval changes underneath, the edit is refused (CR-U02)
  const [base, setBase] = useState(saved);
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<MailDraftErrors>({});
  const pending = a.status === "pending";
  const edited = a.edited != null && !sameMail(saved, a.original as MailReplyPayload);
  const guard = async (k: NonNullable<typeof busy>, fn: () => Promise<{ ok: boolean; approval?: ApprovalDTO; errors?: Record<string, string> }>, done?: string) => {
    setBusy(k);
    const r = await fn().catch(() => ({ ok: false }) as { ok: boolean; approval?: ApprovalDTO; errors?: Record<string, string> });
    setBusy(null);
    if (r.approval) onChange(r.approval);
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
  // The action returns no approval row: patch the visible one so the resolved state shows at once (live frames confirm it).
  const toDrafts = () =>
    void guard(
      "draft",
      async () => {
        const r = await saveReplyToDraftsAction(a.id);
        return r.ok ? { ok: true, approval: { ...a, status: "rejected" as const, decidedAt: new Date().toISOString(), result: { gmailDraftId: r.gmailDraftId } } } : { ok: false };
      },
      "Saved to Gmail drafts",
    );
  return (
    <article aria-label="Approval detail" className="glass-card overflow-hidden rounded-24">
      <header className="border-b border-[rgba(255,255,255,.06)] bg-[linear-gradient(180deg,rgba(232,184,106,.06),transparent)] px-5 py-5">
        <div className="mb-2 text-[11px] font-medium tracking-[0.12em]">
          <span className="text-cyan uppercase">Outreach</span> <span className="text-text-3">wants to</span> <span>{EVENT_VERB[a.kind]}</span>
        </div>
        <h2 className="font-display text-[26px] leading-[1.12] font-medium break-words">{editing ? draft.subject : saved.subject}</h2>
      </header>
      {a.reason && (
        <section className="border-b border-[rgba(255,255,255,.06)] px-5 py-5">
          <Fact k="WHY">{a.reason}</Fact>
        </section>
      )}
      <MailApprovalBody approval={a} editing={editing} draft={draft} errors={errors} onDraft={setDraft} edited={edited} />
      {pending ? (
        <footer className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-2.5 max-[719px]:flex-col max-[719px]:items-stretch [&_button]:text-[13px] [&_button]:font-semibold [&_button]:tracking-[0.06em] [&_button]:uppercase max-[719px]:[&_button]:h-12">
            <Button className="h-[38px] min-w-[150px] rounded-full px-[18px]" loading={busy === "approve"} disabled={busy !== null && busy !== "approve"} onClick={approve}>
              <Icon name="check" size={16} />
              {EVENT_OK[a.kind]}
            </Button>
            <Button variant="secondary" className="h-[38px]" loading={busy === "save"} disabled={busy !== null && busy !== "save"} onClick={() => (editing ? void done() : startEdit())}>
              {editing ? "DONE" : "EDIT"}
            </Button>
            <Button variant="secondary" className="h-[38px]" loading={busy === "draft"} disabled={editing || (busy !== null && busy !== "draft")} onClick={toDrafts}>
              SAVE TO GMAIL DRAFTS
            </Button>
            <Button variant="destructive" className="h-[38px]" loading={busy === "reject"} disabled={busy !== null && busy !== "reject"} onClick={() => void guard("reject", () => rejectAction(a.id), "Approval rejected")}>
              REJECT
            </Button>
            <span className="flex-1" />
            <span className="text-[11px] text-text-3">
              requested {formatHM(new Date(a.createdAt))} · expires {stamp(a.expiresAt)}
            </span>
          </div>
        </footer>
      ) : (
        <Resolved a={a} retrying={busy === "retry"} onRetry={() => void guard("retry", () => retryApprovalAction(a.id))} />
      )}
    </article>
  );
}

// Project kinds: same shell as events around ProjectApprovalBody.
function ProjectApprovalShell({ approval: a, onChange }: DetailProps) {
  const { toast } = useShell();
  const [busy, setBusy] = useState<"approve" | "reject" | "save" | "retry" | null>(null);
  const saved = projectOf(a);
  const [draft, setDraft] = useState<ProjectDraft>(() => toProjectDraft(saved));
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<ProjectErrors>({});
  const agent = getAgent(a.agentId);
  const upd = a.kind === "project_update";
  const pending = a.status === "pending";
  const edited = a.edited != null && !sameProject(saved, a.original as ProjectPayload);
  const stale = a.targetChanged === true;
  const title = editing && !upd ? draft.name : "before" in saved ? saved.before.name : saved.name;
  const guard = async (k: NonNullable<typeof busy>, fn: () => Promise<{ ok: boolean; approval?: ApprovalDTO; errors?: Record<string, string> }>, done?: string) => {
    setBusy(k);
    const r = await fn().catch(() => ({ ok: false }) as { ok: boolean; approval?: ApprovalDTO; errors?: Record<string, string> });
    setBusy(null);
    if (r.approval) onChange(r.approval);
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
  const check = () => {
    const v = validateProjectDraft(a.tool, saved, draft);
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
    void guard("approve", () => approveAction(a.id, editing && !sameProject(payload, saved) ? payload : undefined), upd ? "Project updated" : "Project created");
  };
  const done = async () => {
    const payload = check();
    if (!payload) return;
    if (!sameProject(payload, saved) && !(await guard("save", () => saveEditAction(a.id, payload)))) return;
    setEditing(false);
  };
  return (
    <article aria-label="Approval detail" className="glass-card overflow-hidden rounded-24">
      <header className="border-b border-[rgba(255,255,255,.06)] bg-[linear-gradient(180deg,rgba(232,184,106,.06),transparent)] px-5 py-5">
        <div className="mb-2 text-[11px] font-medium tracking-[0.12em]">
          <span className="uppercase" style={{ color: agent?.color }}>
            {agent?.name ?? a.agentId}
          </span>{" "}
          <span className="text-text-3">wants to</span> <span>{EVENT_VERB[a.kind]}</span>
        </div>
        <h2 className="font-display text-[26px] leading-[1.12] font-medium break-words">{title}</h2>
      </header>
      {a.reason && (
        <section className="border-b border-[rgba(255,255,255,.06)] px-5 py-5">
          <Fact k="WHY">{a.reason}</Fact>
        </section>
      )}
      <ProjectApprovalBody approval={a} editing={editing} draft={draft} errors={errors} onDraft={setDraft} edited={edited} />
      {pending ? (
        <footer className="px-5 py-4">
          {stale && <p className="mb-3 text-[12.5px] text-amber">This project changed after the request was prepared, so it can&apos;t be applied. Reject it and ask again.</p>}
          <div className="flex flex-wrap items-center gap-2.5 max-[719px]:flex-col max-[719px]:items-stretch [&_button]:text-[13px] [&_button]:font-semibold [&_button]:tracking-[0.06em] [&_button]:uppercase max-[719px]:[&_button]:h-12">
            <Button className="h-[38px] min-w-[150px] rounded-full px-[18px]" loading={busy === "approve"} disabled={stale || (busy !== null && busy !== "approve")} onClick={approve}>
              <Icon name="check" size={16} />
              {EVENT_OK[a.kind]}
            </Button>
            <Button variant="secondary" className="h-[38px]" loading={busy === "save"} disabled={busy !== null && busy !== "save"} onClick={() => (editing ? void done() : (setDraft(toProjectDraft(saved)), setErrors({}), setEditing(true)))}>
              {editing ? "DONE" : "EDIT"}
            </Button>
            <Button variant="destructive" className="h-[38px]" loading={busy === "reject"} disabled={busy !== null && busy !== "reject"} onClick={() => void guard("reject", () => rejectAction(a.id), "Approval rejected")}>
              REJECT
            </Button>
            <span className="flex-1" />
            <span className="text-[11px] text-text-3">
              requested {formatHM(new Date(a.createdAt))} · expires {stamp(a.expiresAt)}
            </span>
          </div>
        </footer>
      ) : (
        <Resolved a={a} retrying={busy === "retry"} onRetry={() => void guard("retry", () => retryApprovalAction(a.id))} />
      )}
    </article>
  );
}

function IssueApprovalBody({ approval: a, write, onChange, issue }: DetailProps & { issue: { original: IssuePayload; current: IssuePayload } }) {
  const { toast } = useShell();
  const saved = issue.current;
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState<"approve" | "reject" | "save" | "retry" | null>(null);
  const agent = getAgent(a.agentId);
  const current = toPayload(saved.repo, draft);
  const shown: IssuePayload = current;
  const dirty = !same(current, saved);
  const edited = !same(current, issue.original);
  const pending = a.status === "pending";
  const canApprove = write.connected;

  const guard = async (kind: NonNullable<typeof busy>, fn: () => Promise<{ ok: boolean; approval?: ApprovalDTO; errors?: Record<string, string> }>, done?: string) => {
    setBusy(kind);
    const r = await fn().catch(() => ({ ok: false }) as { ok: boolean; approval?: ApprovalDTO; errors?: Record<string, string> });
    setBusy(null);
    if (r.approval) onChange(r.approval);
    if (r.errors) {
      setErrors(r.errors);
      setEditing(true);
      return;
    }
    if (!r.ok) return toast("Couldn't record that decision. Try again.", "error");
    if (done) toast(done);
    return true;
  };

  const approve = () => {
    const v = validateDraft(saved.repo, draft);
    if ("errors" in v) {
      setErrors(v.errors);
      setEditing(true);
      return;
    }
    setErrors({});
    void guard("approve", () => approveAction(a.id, dirty ? v.payload : undefined), `Issue created in ${saved.repo}`);
  };
  const done = async () => {
    const v = validateDraft(saved.repo, draft);
    if ("errors" in v) return setErrors(v.errors);
    setErrors({});
    if (dirty && !(await guard("save", () => saveEditAction(a.id, v.payload)))) return;
    setEditing(false);
  };

  return (
    <article aria-label="Approval detail" className="glass-card overflow-hidden rounded-24">
      <header className="border-b border-[rgba(255,255,255,.06)] bg-[linear-gradient(180deg,rgba(232,184,106,.06),transparent)] px-5 py-5">
        <div className="mb-2 text-[11px] font-medium tracking-[0.12em]">
          <span className="uppercase" style={{ color: agent?.color }}>
            {agent?.name ?? a.agentId}
          </span>{" "}
          <span className="text-text-3">wants to</span> <span>create a GitHub issue</span>
        </div>
        <h2 className="font-display text-[26px] leading-[1.12] font-medium break-words">{shown.title}</h2>
      </header>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-6 gap-y-[18px] border-b border-[rgba(255,255,255,.06)] px-5 py-5">
        <Fact k="WHAT WILL HAPPEN">
          Creates one issue in {saved.repo}. {a.repoPrivate ? "Visible to you and collaborators." : "It is visible to anyone who can see that repository."}
        </Fact>
        {a.reason && <Fact k="WHY">{a.reason}</Fact>}
        <Fact k="WHICH ACCOUNT">
          {write.connected ? `GitHub · @${write.login} · issues-write token ····${write.last4}` : "GitHub · issues-write token not connected"}
        </Fact>
        <Fact k="WHEN">Immediately after approval</Fact>
      </section>

      <section className="border-b border-[rgba(255,255,255,.06)] px-5 py-5">
        <div className="mb-3 text-[10px] tracking-[0.14em] text-text-3">WHAT DATA WILL BE SENT</div>
        <ul className="flex flex-col gap-1.5 text-[13px]">
          {[`Issue title (${shown.title.length} characters)`, `Issue body (${shown.body.length} characters)`, ...(shown.labels.length ? [`${shown.labels.length} labels: ${shown.labels.join(", ")}`] : [])].map((t) => (
            <li key={t} className="flex items-center gap-2 break-words">
              <Icon name="check_circle" size={16} className="shrink-0 text-green" />
              {t}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <Icon name="shield" size={16} className="shrink-0 text-cyan" />
            No email, calendar or contact data
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
          <span className="flex-1" />
          <span>{shown.title.length + shown.body.length} chars</span>
        </div>
        {editing && pending ? <ApprovalEditForm repo={saved.repo} draft={draft} errors={errors} onChange={setDraft} /> : <Preview p={shown} />}
        {edited && (
          <div className="mt-3 text-[12.5px] text-text-2">
            <Disclosure summary={<span>View agent&apos;s original</span>}>
              <div className="pt-2">
                <Preview p={issue.original} />
              </div>
            </Disclosure>
          </div>
        )}
      </section>

      {pending ? (
        <footer className="px-5 py-4">
          {!canApprove && (
            <p className="mb-3 text-[12.5px] text-amber">
              The issues-write token is missing, so this can&apos;t be created. Add it in Settings → Connections.{" "}
              <a href="/settings?section=connections" className="text-cyan hover:text-cyan-soft">
                Open Connections
              </a>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2.5 max-[719px]:flex-col max-[719px]:items-stretch [&_button]:text-[13px] [&_button]:font-semibold [&_button]:tracking-[0.06em] [&_button]:uppercase max-[719px]:[&_button]:h-12">
            <Button className="h-[38px] min-w-[150px] rounded-full px-[18px]" loading={busy === "approve"} disabled={!canApprove || (busy !== null && busy !== "approve")} onClick={approve}>
              <Icon name="check" size={16} />
              CREATE ISSUE
            </Button>
            <Button variant="secondary" className="h-[38px]" loading={busy === "save"} disabled={busy !== null && busy !== "save"} onClick={() => (editing ? void done() : setEditing(true))}>
              {editing ? "DONE" : "EDIT"}
            </Button>
            <Button variant="destructive" className="h-[38px]" loading={busy === "reject"} disabled={busy !== null && busy !== "reject"} onClick={() => void guard("reject", () => rejectAction(a.id), "Approval rejected")}>
              REJECT
            </Button>
            <span className="flex-1" />
            <span className="text-[11px] text-text-3">
              requested {formatHM(new Date(a.createdAt))} · expires {stamp(a.expiresAt)}
            </span>
          </div>
        </footer>
      ) : (
        <Resolved a={a} retrying={busy === "retry"} onRetry={() => void guard("retry", () => retryApprovalAction(a.id))} />
      )}
    </article>
  );
}
