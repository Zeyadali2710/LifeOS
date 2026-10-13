"use client";

import { useState } from "react";
import type { ApprovalDTO } from "@/lib/agent-types";
import { nothingText, payloadSchemaFor, type ApprovalKind } from "@/lib/approval-kinds";
import { isSafeGithubUrl } from "@/lib/safe-url";
import { approveAction, rejectAction } from "@/server/approval-actions";
import { issueOf, UnreadableApproval } from "@/approvals/approval-detail";
import { eventOf, whenText } from "@/approvals/event-approval";
import { projectOf, projectResolved } from "@/approvals/project-approval";
import { draftCounts } from "@/lib/project-payload";
import { sydneyParts, formatHM } from "@/server/time";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";
import { useShell } from "../shell-provider";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const stamp = (iso: string) => {
  const p = sydneyParts(new Date(iso));
  return `${p.weekday} ${p.day} ${MONTHS[p.month - 1]} ${formatHM(new Date(iso))}`;
};

function Resolved({ a }: { a: ApprovalDTO }) {
  const at = formatHM(new Date(a.decidedAt ?? a.createdAt));
  const issue = a.kind === "issue";
  const nothing = nothingText(a.kind);
  const res = a.result as { number?: number; url?: string } | null;
  const repo = issueOf(a)?.current.repo ?? "";
  const proj = a.kind === "project_create" || a.kind === "project_update";
  const pr = proj ? projectResolved(a, at) : null;
  let icon: IconName = "schedule";
  let tone = "text-text-3";
  let text = "";
  switch (a.status) {
    case "approved":
    case "executing":
      icon = "schedule";
      text = issue ? "Creating the issue on GitHub…" : proj ? (a.kind === "project_update" ? "Updating the project…" : "Creating the project…") : "Applying the change…";
      break;
    case "executed":
      icon = "check_circle";
      tone = "text-green";
      text = issue ? `Issue created: ${repo}#${res?.number ?? ""}. Approved at ${at}.` : (pr?.text ?? `Done. Approved at ${at}.`);
      break;
    case "failed":
      icon = "error";
      tone = "text-red";
      text = issue ? `Approved, but GitHub rejected it: ${a.error ?? "unknown error"}. Nothing was created.` : pr ? pr.text : `Approved, but it was rejected: ${a.error ?? "unknown error"}. ${nothing}`;
      break;
    case "rejected":
      icon = "block";
      tone = "text-red";
      text = `Rejected at ${at}. ${nothing} The run was cancelled.`;
      break;
    case "expired":
      text = `Expired ${stamp(a.expiresAt)}. ${nothing} The run was cancelled.`;
      break;
    default:
      icon = "block";
      text = `The run was cancelled before this was decided. ${nothing}`;
  }
  return (
    <div role="status" tabIndex={-1} className="flex animate-[lo-fade_200ms_ease-out] flex-wrap items-center gap-2 rounded-full bg-white/[.06] px-3.5 py-2 text-[12.5px] text-text-2">
      <Icon name={icon} size={16} className={tone} />
      <span className="flex-1">{text}</span>
      {pr?.href && a.status === "executed" && (
        <a href={pr.href} className="text-cyan hover:text-cyan-soft">
          Open project
        </a>
      )}
      {issue && a.status === "executed" && isSafeGithubUrl(res?.url) && (
        <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-cyan hover:text-cyan-soft">
          View on GitHub
        </a>
      )}
    </div>
  );
}

const EV: Record<ApprovalKind, { verb: string; ok: string }> = {
  issue: { verb: "", ok: "CREATE ISSUE" },
  event_create: { verb: "add an event to", ok: "ADD TO CALENDAR" },
  event_update: { verb: "change an event on", ok: "UPDATE EVENT" },
  event_delete: { verb: "delete an event from", ok: "DELETE EVENT" },
  project_create: { verb: "create a project", ok: "CREATE PROJECT" },
  project_update: { verb: "change a project", ok: "UPDATE PROJECT" },
  mail_reply: { verb: "reply to", ok: "SEND REPLY" },
};

export function ApprovalCard({ approval, onDecided }: { approval: ApprovalDTO; onDecided: () => void }) {
  const { toast } = useShell();
  const [local, setLocal] = useState<ApprovalDTO | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  // a local decision shows immediately; any newer server state (live frame) wins once the server says it is not pending
  const a = approval.status === "pending" && local ? local : approval;
  const iss = issueOf(a);
  if (a.kind === "issue" && !iss) return <UnreadableApproval />;
  const isProj = a.kind === "project_create" || a.kind === "project_update";
  if (isProj && !payloadSchemaFor(a.tool).safeParse(projectOf(a)).success) return <UnreadableApproval />;
  const pj = isProj ? projectOf(a) : null;
  const pjName = pj ? ("before" in pj ? pj.before.name : pj.name) : "";
  const pjCounts = pj ? draftCounts(pj) : null;
  const pjMeta = pjCounts ? [pjCounts.milestones && `${pjCounts.milestones} milestones`, pjCounts.tasks && `${pjCounts.tasks} tasks`, pjCounts.links && `${pjCounts.links} links`].filter(Boolean).join(" · ") || "Project only" : "";
  const ev = (a.edited ?? a.original) as { title?: unknown; calendarLabel?: unknown };
  const p = iss?.current ?? { repo: "", title: pj ? pjName : String(ev.title ?? ""), body: pj && "name" in pj ? pj.description : "", labels: [] as string[] };
  const decide = async (kind: "approve" | "reject") => {
    setBusy(kind);
    const r = await (kind === "approve" ? approveAction(a.id) : rejectAction(a.id)).catch(() => ({ ok: false, approval: undefined }));
    setBusy(null);
    if (!r.ok) return toast("Couldn't record that decision. Try again.", "error");
    if (r.approval) setLocal(r.approval);
    toast(kind === "approve" ? (iss ? `Issue created in ${p.repo}` : pj ? (a.kind === "project_update" ? "Project updated" : "Project created") : "Calendar updated") : "Approval rejected");
    onDecided();
  };
  return (
    <div id={`approval-${a.runId}`} className="flex flex-col gap-2.5 rounded-14 border border-[rgba(255,159,10,.30)] bg-[rgba(255,159,10,.10)] p-3.5">
      <div className="flex items-center gap-1.5 text-[10.5px] font-medium tracking-[.12em] text-amber">
        <Icon name="verified_user" size={16} />
        APPROVAL REQUIRED
      </div>
      <p className="text-[13px] text-text-2">
        {iss ? `${a.agentId} wants to create a GitHub issue in ${p.repo}` : pj ? (a.kind === "project_update" ? `Projects agent wants to change "${pjName}"` : "Projects agent wants to create a project") : `Organization agent wants to ${EV[a.kind].verb} ${String(ev.calendarLabel ?? "")}`}
      </p>
      <h4 className="text-[15px] font-medium break-words">{p.title}</h4>
      {pj && <div className="text-[11px] text-text-3">{pjMeta}</div>}
      {pj && pj.sources.length > 0 && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-amber">
          <Icon name="warning" size={14} />
          Drafted from {pj.sources.length} repository files (untrusted)
        </p>
      )}
      {!iss && !pj && (
        <div className="text-[11px] text-text-3">
          {(() => {
            const e = eventOf(a);
            return a.kind === "event_delete" ? `Removes · ${whenText(e.start, e.end, e.allDay)}` : whenText(e.start, e.end, e.allDay);
          })()}
        </div>
      )}
      {p.body && (
        <div>
          <p className={`${open ? "" : "line-clamp-4"} text-[13px] leading-normal break-words whitespace-pre-wrap text-text-2`}>{p.body}</p>
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mt-1 text-[12.5px] text-cyan hover:text-cyan-soft">
            {open ? "Show less" : "Show full preview"}
          </button>
        </div>
      )}
      {p.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {p.labels.map((l) => (
            <Badge key={l} kind="tag" tone="neutral">{l}</Badge>
          ))}
        </div>
      )}
      <div className="text-[11px] text-text-3">
        {iss ? `GitHub · ${p.repo}` : pj ? "LifeOS · Projects" : "Calendar"} · expires {stamp(a.expiresAt)}
      </div>
      {a.status === "pending" && a.targetChanged === true && (
        <p className="text-[12.5px] text-amber">This {pj ? "project" : "event"} changed after the request was prepared, so it can&apos;t be applied. Reject it and ask again.</p>
      )}
      {a.status === "pending" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="inverse" className={`h-8 ${a.kind === "event_delete" ? "bg-red text-on-accent" : ""}`} loading={busy === "approve"} disabled={busy !== null || a.targetChanged === true} onClick={() => void decide("approve")}>
            <Icon name="check" size={15} />
            {EV[a.kind].ok}
          </Button>
          <Button variant="destructive" className="h-8" loading={busy === "reject"} disabled={busy !== null} onClick={() => void decide("reject")}>
            REJECT
          </Button>
          <a href={`/approvals?id=${encodeURIComponent(a.id)}`} className="px-2 text-[12.5px] text-text-2 hover:text-text">
            Review and edit
          </a>
        </div>
      ) : (
        <Resolved a={a} />
      )}
    </div>
  );
}
