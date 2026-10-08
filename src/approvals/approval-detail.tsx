"use client";

import { useEffect, useRef, useState } from "react";
import type { ApprovalDTO } from "@/lib/agent-types";
import type { IssuePayload } from "@/lib/issue-payload";
import { isSafeGithubUrl } from "@/lib/safe-url";
import { approveAction, rejectAction, retryApprovalAction, saveEditAction } from "@/server/approval-actions";
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

export type WriteFacts = { connected: boolean; login: string | null; last4: string | null };

const same = (a: IssuePayload, b: IssuePayload) => a.title === b.title && a.body === b.body && a.labels.join("\n") === b.labels.join("\n");

function Preview({ p }: { p: IssuePayload }) {
  return (
    <div className="rounded-10 border border-[rgba(255,255,255,.06)] bg-inset p-4">
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

const Fact = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div>
    <div className="mb-1 font-mono text-[10.5px] tracking-[0.1em] text-text-3">{k}</div>
    <div className="text-[13.5px] leading-normal break-words">{children}</div>
  </div>
);

function Resolved({ a, onRetry, retrying }: { a: ApprovalDTO; onRetry: () => void; retrying: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const at = formatHM(new Date(a.decidedAt ?? a.createdAt));
  const repo = (a.edited ?? a.original).repo;
  let icon: IconName = "block";
  let tone = "text-red";
  let bg = "bg-[rgba(240,122,110,.06)]";
  let text = `Rejected at ${at}. Nothing was created and the run was cancelled.`;
  if (a.status === "approved" || a.status === "executing") {
    icon = "schedule";
    tone = "text-indigo-text";
    bg = "bg-fill-1";
    text = "Creating the issue on GitHub…";
  } else if (a.status === "executed") {
    icon = "check_circle";
    tone = "text-green";
    bg = "bg-[rgba(79,209,161,.06)]";
    text = `Issue created: ${repo}#${a.result?.number ?? ""}. Approved at ${at}.`;
  } else if (a.status === "failed") {
    icon = "error";
    text = `Approved, but GitHub rejected it: ${a.error ?? "unknown error"}. Nothing was created.`;
  } else if (a.status === "expired") {
    icon = "schedule";
    tone = "text-text-3";
    bg = "bg-[rgba(255,255,255,.03)]";
    text = `Expired ${stamp(a.expiresAt)}. Nothing was created and the run was cancelled.`;
  } else if (a.status === "cancelled") {
    tone = "text-text-3";
    bg = "bg-[rgba(255,255,255,.03)]";
    text = "The run was cancelled before this was decided. Nothing was created.";
  }
  return (
    <div ref={ref} role="status" tabIndex={-1} className={`flex animate-[lo-fade_200ms_ease-out] flex-wrap items-center gap-3 px-[22px] py-4 text-[13px] text-text-2 outline-none ${bg}`}>
      <Icon name={icon} size={18} className={tone} />
      <span className="min-w-0 flex-1 break-words">{text}</span>
      {a.status === "executed" && isSafeGithubUrl(a.result?.url) && (
        <a href={a.result.url} target="_blank" rel="noopener noreferrer" className="rounded-6 border border-[rgba(255,255,255,.1)] px-2.5 py-1 text-[12.5px] text-text hover:bg-fill-2">
          View on GitHub
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

export function ApprovalDetail({ approval: a, write, onChange }: { approval: ApprovalDTO; write: WriteFacts; onChange: (a: ApprovalDTO) => void }) {
  const { toast } = useShell();
  const saved = a.edited ?? a.original;
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState<"approve" | "reject" | "save" | "retry" | null>(null);
  const agent = getAgent(a.agentId);
  const current = toPayload(saved.repo, draft);
  const shown: IssuePayload = current;
  const dirty = !same(current, saved);
  const edited = !same(current, a.original);
  const pending = a.status === "pending";
  const canApprove = write.connected;

  const guard = async (kind: NonNullable<typeof busy>, fn: () => Promise<{ ok: boolean; approval?: ApprovalDTO; errors?: Record<string, string> }>, done?: string) => {
    setBusy(kind);
    const r = await fn();
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
    <article aria-label="Approval detail" className="overflow-hidden rounded-16 border border-[rgba(255,255,255,.08)]">
      <header className="border-b border-[rgba(255,255,255,.06)] bg-[linear-gradient(180deg,rgba(232,184,106,.06),transparent)] px-[22px] py-5">
        <div className="mb-2 font-mono text-[10.5px] font-medium tracking-[0.07em]">
          <span className="uppercase" style={{ color: agent?.color }}>
            {agent?.name ?? a.agentId}
          </span>{" "}
          <span className="text-text-3">wants to</span> <span>create a GitHub issue</span>
        </div>
        <h2 className="text-[20px] leading-[1.3] font-medium break-words">{shown.title}</h2>
      </header>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-6 gap-y-[18px] border-b border-[rgba(255,255,255,.06)] px-[22px] py-5">
        <Fact k="WHAT WILL HAPPEN">
          Creates one issue in {saved.repo}. {a.repoPrivate ? "Visible to you and collaborators." : "It is visible to anyone who can see that repository."}
        </Fact>
        {a.reason && <Fact k="WHY">{a.reason}</Fact>}
        <Fact k="WHICH ACCOUNT">
          {write.connected ? `GitHub · @${write.login} · issues-write token ····${write.last4}` : "GitHub · issues-write token not connected"}
        </Fact>
        <Fact k="WHEN">Immediately after approval</Fact>
      </section>

      <section className="border-b border-[rgba(255,255,255,.06)] px-[22px] py-5">
        <div className="mb-3 font-mono text-[10.5px] tracking-[0.1em] text-text-3">WHAT DATA WILL BE SENT</div>
        <ul className="flex flex-col gap-1.5 text-[13px]">
          {[`Issue title (${shown.title.length} characters)`, `Issue body (${shown.body.length} characters)`, ...(shown.labels.length ? [`${shown.labels.length} labels: ${shown.labels.join(", ")}`] : [])].map((t) => (
            <li key={t} className="flex items-center gap-2 break-words">
              <Icon name="check_circle" size={16} className="shrink-0 text-green" />
              {t}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <Icon name="shield" size={16} className="shrink-0 text-blue" />
            No email, calendar or contact data
          </li>
        </ul>
      </section>

      <section className="border-b border-[rgba(255,255,255,.06)] px-[22px] py-5">
        <div className="mb-3 flex items-center gap-2 font-mono text-[10.5px] tracking-[0.1em] text-text-3">
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
                <Preview p={a.original} />
              </div>
            </Disclosure>
          </div>
        )}
      </section>

      {pending ? (
        <footer className="px-[22px] py-4">
          {!canApprove && (
            <p className="mb-3 text-[12.5px] text-amber">
              The issues-write token is missing, so this can&apos;t be created. Add it in Settings → Connections.{" "}
              <a href="/settings?section=connections" className="text-indigo-text hover:text-indigo-soft">
                Open Connections
              </a>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2.5 max-[719px]:flex-col max-[719px]:items-stretch [&_button]:text-[13px] [&_button]:font-semibold [&_button]:tracking-[0.06em] [&_button]:uppercase max-[719px]:[&_button]:h-12">
            <Button className="h-[38px] min-w-[150px] rounded-9 px-[18px]" loading={busy === "approve"} disabled={!canApprove || (busy !== null && busy !== "approve")} onClick={approve}>
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
            <span className="font-mono text-[11px] text-text-3">
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
