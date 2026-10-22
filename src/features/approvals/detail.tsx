"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ApprovalDTO } from "@/lib/agent-types";
import { nothingText, payloadSchemaFor } from "@/lib/approval-kinds";
import { isSafeGithubUrl } from "@/lib/safe-url";
import { checkVariant } from "@/lib/social-types";
import { approveAction, rejectAction, retryApprovalAction } from "@/server/approval-actions";
import { saveReplyToDraftsAction } from "@/server/mail-actions";
import { socialReviewFacts } from "@/server/socials-actions";
import { getAgent } from "@/server/agents/registry";
import { formatHM } from "@/server/time";
import { useLiveEvents } from "@/features/shell/live-provider";
import { Button } from "@/ui/button";
import { Checkbox, TextField } from "@/ui/controls";
import { Alert } from "@/ui/feedback";
import { useDecide } from "./decide";
import { FinanceBody } from "./finance-body";
import { eventOf, eventResolved, sameEvent, toEventDraft, validateEventDraft, whenText, type EventDraft, type EventDraftErrors, type EventPayload } from "./model/event";
import { issueOf, sameIssue, toDraft, toPayload, validateDraft, type Draft, type DraftErrors } from "./model/issue";
import { mailOf, mailResolved, redirectNote, sameMail, toMailDraft, validateMailDraft, type MailDraft, type MailDraftErrors } from "./model/mail";
import { projectOf } from "./model/project";
import { sameSocial, socialOf, socialResolved, toSocialDraft, validateSocialDraft, type Facts, type SocialDraft } from "./model/social";
import { ProjectBody } from "./project-body";
import { RESOLVED, since, stamp, summarize, TIER_OF } from "./summary";
import s from "./approvals.module.css";

export type WriteFacts = { connected: boolean; login: string | null; last4: string | null };
type Props = { approval: ApprovalDTO; write: WriteFacts; onChange: (a: ApprovalDTO) => void };

const TONE = { working: "var(--status-working)", failed: "var(--status-failed)", idle: "var(--ink-3)", approval: "var(--status-approval)" } as const;

/** The shared header: state line, title, facts. */
function Head({ a, title, target }: { a: ApprovalDTO; title: string; target: ReactNode }) {
  const r = RESOLVED[a.status];
  const at = a.decidedAt ? ` · ${stamp(a.decidedAt)}` : "";
  return (
    <>
      <div className={s.stateLine} style={{ color: TONE[r.tone] }}>
        {r.glyph} {a.status === "pending" ? "AWAITING YOUR APPROVAL" : `${r.label.toUpperCase()}${at}`}
      </div>
      <h2 className={s.title}>{title}</h2>
      <dl className={s.facts}>
        <dt>Requested by</dt>
        <dd>
          {getAgent(a.agentId)?.name ?? a.agentId} agent · {since(a.createdAt)} ago
        </dd>
        <dt>Tool · tier</dt>
        <dd className={s.mono}>
          {a.tool} · {TIER_OF[a.kind]}
        </dd>
        <dt>Target</dt>
        <dd>{target}</dd>
        <dt>Expires</dt>
        <dd>{a.status === "pending" ? `${stamp(a.expiresAt)} · the run is suspended until you decide` : "—"}</dd>
        {a.reason && (
          <>
            <dt>Why</dt>
            <dd>{a.reason}</dd>
          </>
        )}
      </dl>
    </>
  );
}

/** Resolved record: past tense, the content as sent, the outcome, no decision actions. */
function Record({ a, quote, outcome, links, onRetry, retrying }: { a: ApprovalDTO; quote: ReactNode; outcome: string; links?: ReactNode; onRetry: () => void; retrying: boolean }) {
  return (
    <>
      {quote && <blockquote className={s.quote}>{quote}</blockquote>}
      <div role="status" className={s.outcome}>
        <span>{outcome}</span>
        {links}
        {a.status === "failed" && (
          <Button size="sm" disabled={retrying} onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </>
  );
}

function defaultOutcome(a: ApprovalDTO): string {
  const at = formatHM(new Date(a.decidedAt ?? a.createdAt));
  const nothing = nothingText(a.kind);
  switch (a.status) {
    case "approved":
    case "executing":
      return "Approved · running…";
    case "executed":
      return `Done. Approved at ${at}.`;
    case "failed":
      return `Approved, but it failed: ${a.error ?? "unknown error"}. ${nothing}`;
    case "rejected":
      return `Rejected at ${at}. ${nothing} The run was cancelled.`;
    case "expired":
      return `Expired ${stamp(a.expiresAt)}. ${nothing} The run was cancelled.`;
    default:
      return `The run was cancelled before this was decided. ${nothing}`;
  }
}

function Decision({
  approveLabel,
  onApprove,
  onReject,
  busy,
  disabled,
  source,
  next,
  extra,
  danger,
}: {
  approveLabel: string;
  onApprove: () => void;
  onReject: () => void;
  busy: string | null;
  disabled?: boolean;
  source?: { label: string; href: string };
  next: string;
  extra?: ReactNode;
  danger?: boolean;
}) {
  return (
    <>
      <div className={s.actions}>
        <Button variant={danger ? "danger" : "primary"} size="lg" disabled={disabled || busy !== null} onClick={onApprove} data-approve>
          {busy === "approve" ? "Approving…" : approveLabel}
        </Button>
        <Button size="lg" disabled={busy !== null} onClick={onReject} style={{ color: "var(--status-failed)" }}>
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </Button>
        {extra}
        {source && (
          <Link href={source.href} style={{ fontSize: 14, padding: "9px 8px" }}>
            {source.label} →
          </Link>
        )}
      </div>
      <p className={s.next}>{next}</p>
    </>
  );
}

function ContentField({ label, edited, value, onChange, error, rows = 7 }: { label: string; edited: boolean; value: string; onChange: (v: string) => void; error?: string; rows?: number }) {
  return (
    <label className={s.contentLabel}>
      <span className={s.fieldHead}>
        <span>{label.toUpperCase()} · YOU CAN EDIT BEFORE APPROVING</span>
        <span className={s.edited}>{edited ? "EDITED · RE-VALIDATED ON APPROVE" : ""}</span>
      </span>
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className={s.content} aria-invalid={error ? true : undefined} data-edit />
      {error && <span className={s.err}>{error}</span>}
    </label>
  );
}

function Unreadable() {
  return <Alert tone="info">This request can&apos;t be displayed. It expires on its own.</Alert>;
}

// ---- issue ----
function IssueDetail({ approval: a, write, onChange }: Props) {
  const issue = issueOf(a)!;
  const saved = issue.current;
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  const [errors, setErrors] = useState<DraftErrors>({});
  const { busy, guard } = useDecide(onChange, (e) => setErrors(e));
  const current = toPayload(saved.repo, draft);
  const dirty = !sameIssue(current, saved);
  const res = a.result as { number?: number; url?: string } | null;
  const approve = () => {
    const v = validateDraft(saved.repo, draft);
    if ("errors" in v) return setErrors(v.errors);
    setErrors({});
    void guard("approve", () => approveAction(a.id, dirty ? v.payload : undefined), `Issue created in ${saved.repo}`);
  };
  return (
    <>
      <Head a={a} title={`Create issue “${a.status === "pending" ? draft.title : saved.title}”`} target={`${saved.repo}${saved.labels.length ? ` · labels: ${saved.labels.join(", ")}` : ""}${a.repoPrivate === false ? " · public repository" : ""}`} />
      {a.status === "pending" ? (
        <>
          <div className={s.fieldsRow}>
            <TextField label="Issue title" value={draft.title} error={errors.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <TextField label="Labels" help="Comma-separated" value={draft.labels} error={errors.labels} onChange={(e) => setDraft({ ...draft, labels: e.target.value })} />
          </div>
          <ContentField label="Issue body" edited={!sameIssue(current, issue.original)} value={draft.body} error={errors.body} onChange={(body) => setDraft({ ...draft, body })} />
          {!write.connected && (
            <Alert tone="warn" action={<Link href="/settings?section=connections">Open Connections</Link>}>
              The GitHub issues-write token isn&apos;t connected, so this can&apos;t be approved yet.
            </Alert>
          )}
          <Decision
            approveLabel={dirty ? "Approve with edits" : "Approve"}
            onApprove={approve}
            onReject={() => void guard("reject", () => rejectAction(a.id), "Rejected. Nothing was created.")}
            busy={busy}
            disabled={!write.connected}
            source={{ label: "Open repository", href: `/career/${saved.repo}` }}
            next={`Projects creates the issue once${write.connected ? ` as @${write.login}` : ""}, then resumes the run.`}
          />
        </>
      ) : (
        <Record
          a={a}
          quote={saved.body}
          outcome={
            a.status === "executed"
              ? `Issue created: ${saved.repo}#${res?.number ?? ""}.`
              : a.status === "failed"
                ? `Approved, but GitHub rejected it: ${a.error ?? "unknown error"}. Nothing was created.`
                : defaultOutcome(a)
          }
          links={a.status === "executed" && isSafeGithubUrl(res?.url) ? <a href={res.url} target="_blank" rel="noopener noreferrer">View on GitHub</a> : null}
          retrying={busy === "retry"}
          onRetry={() => void guard("retry", () => retryApprovalAction(a.id))}
        />
      )}
    </>
  );
}

// ---- mail reply ----
function MailDetail({ approval: a, onChange }: Props) {
  const saved = mailOf(a);
  const [draft, setDraft] = useState<MailDraft>(() => toMailDraft(saved));
  const [base] = useState(saved);
  const [errors, setErrors] = useState<MailDraftErrors>({});
  const { busy, guard } = useDecide(onChange, (e) => setErrors(e));
  const dirty = draft.subject !== saved.subject || draft.body !== saved.body;
  const at = formatHM(new Date(a.decidedAt ?? a.createdAt));
  const res = mailResolved(a, at);
  const to = saved.to?.[0];
  const approve = () => {
    if (!sameMail(base, saved)) return setErrors({ body: "This draft changed while you were editing. Reload it and check again." });
    const v = validateMailDraft(a.tool, saved, draft);
    if ("errors" in v) return setErrors(v.errors);
    setErrors({});
    void guard("approve", () => approveAction(a.id, dirty ? v.payload : undefined), "Reply approved · sending");
  };
  const toDrafts = () =>
    void guard(
      "draft",
      async () => {
        const r = await saveReplyToDraftsAction(a.id);
        return r.ok ? { ok: true, approval: { ...a, status: "rejected" as const, decidedAt: new Date().toISOString(), result: { gmailDraftId: r.gmailDraftId } } } : { ok: false };
      },
      "Saved to Gmail drafts",
    );
  const recips = (
    <div className={s.recips}>
      {(
        [
          ["To", saved.to],
          ["Cc", saved.cc],
        ] as const
      )
        .filter(([, xs]) => xs.length > 0)
        .map(([k, xs]) => (
          <span key={k}>
            {k} <span className={s.mono}>{xs.map((x) => (x.name ? `${x.name} <${x.address}>` : x.address)).join(", ")}</span>
          </span>
        ))}
      {redirectNote(saved) && <span className={s.warn}>{redirectNote(saved)}</span>}
    </div>
  );
  return (
    <>
      <Head a={a} title={`Send reply to ${to?.name || to?.address || "the sender"}`} target={recips} />
      {a.status === "pending" ? (
        <>
          <TextField label="Subject" value={draft.subject} error={errors.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          <ContentField label="Message" edited={dirty || (a.edited != null && !sameMail(saved, a.original as typeof saved))} value={draft.body} error={errors.body} onChange={(body) => setDraft({ ...draft, body })} rows={9} />
          <Decision
            approveLabel={dirty ? "Approve with edits" : "Approve"}
            onApprove={approve}
            onReject={() => void guard("reject", () => rejectAction(a.id), "Rejected. Nothing was sent.")}
            busy={busy}
            extra={
              <Button size="lg" variant="ghost" disabled={dirty || busy !== null} onClick={toDrafts}>
                Save to Gmail drafts
              </Button>
            }
            source={saved.messageId ? { label: "Open email", href: `/outreach?mail=${saved.messageId}` } : undefined}
            next="Outreach sends this reply once from the receiving account, then records it in Activity."
          />
        </>
      ) : (
        <Record
          a={a}
          quote={saved.body}
          outcome={res?.text ?? defaultOutcome(a)}
          links={
            <>
              {res?.href && <Link href={res.href}>Open email</Link>}
              {res?.reconnect && <Link href="/settings?section=connections">Reconnect Google in Settings</Link>}
            </>
          }
          retrying={busy === "retry"}
          onRetry={() => void guard("retry", () => retryApprovalAction(a.id))}
        />
      )}
    </>
  );
}

// ---- social publish ----
function SocialDetail({ approval: a, onChange }: Props) {
  const saved = socialOf(a);
  const [draft, setDraft] = useState<SocialDraft>(() => toSocialDraft(saved));
  const [facts, setFacts] = useState<Facts>(null);
  const { busy, guard } = useDecide(onChange);
  const load = () => startTransition(async () => setFacts(await socialReviewFacts(a.id).catch(() => null)));
  useEffect(() => {
    let active = true;
    startTransition(async () => {
      const f = await socialReviewFacts(a.id).catch(() => null);
      if (active) setFacts(f);
    });
    return () => {
      active = false;
    };
  }, [a.id, a.status]);
  useLiveEvents("socials", load);
  const validation = validateSocialDraft(saved, draft);
  const dirty = !sameSocial(draft, toSocialDraft(saved));
  const checks = checkVariant(saved.platform, draft);
  const platform = saved.platform === "linkedin" ? "LinkedIn" : "Instagram";
  return (
    <>
      <Head
        a={a}
        title={`Publish on ${platform}`}
        target={`${saved.providerMode === "mock" ? "MOCK · nothing leaves LifeOS" : "Public post"} · ${facts?.destination ?? "checking account…"}`}
      />
      {facts?.draftedFromContent && (
        <div role="note" className={s.untrusted}>
          Drafted from project, event or repository content (untrusted). Check it before approving.
        </div>
      )}
      {a.status === "pending" ? (
        <>
          <ContentField label="Post text" edited={dirty} value={draft.text} onChange={(text) => setDraft({ ...draft, text })} rows={8} />
          <div className={s.fieldsRow}>
            <TextField label="Image URL" type="url" value={draft.imageUrl ?? ""} onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value || null })} />
            <TextField label="Link URL" type="url" value={draft.linkUrl ?? ""} onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value || null })} />
          </div>
          <TextField label="Publish at" help="ISO date with timezone; blank publishes right after approval" value={draft.publishAt ?? ""} onChange={(e) => setDraft({ ...draft, publishAt: e.target.value || null })} />
          {!validation.success && <p role="alert" className={s.err}>{validation.error.issues.map((i) => i.message).join(" ")}</p>}
          {checks.warnings.map((w) => (
            <p key={w} className={s.warn}>
              {w}
            </p>
          ))}
          {facts && !facts.bindingMatches && <Alert tone="warn">The account binding changed after this was requested. Reject it and send the post for approval again.</Alert>}
          <Decision
            approveLabel={dirty ? "Approve with edits" : "Approve"}
            onApprove={() => validation.success && void guard("approve", () => approveAction(a.id, dirty ? validation.data : undefined), "Approved · queued for publishing")}
            onReject={() => void guard("reject", () => rejectAction(a.id), "Rejected. Nothing was posted.")}
            busy={busy}
            disabled={!validation.success || !facts?.bindingMatches}
            source={facts ? { label: "Open in Socials", href: `/socials?post=${facts.postId}` } : undefined}
            next="Publishing uses exactly this text at the time shown."
          />
        </>
      ) : (
        <Record
          a={a}
          quote={saved.text}
          outcome={socialResolved(a, facts)}
          links={
            <>
              {facts && <Link href={`/socials?post=${facts.postId}`}>View in Socials</Link>}
              {facts?.remoteUrl && (
                <a href={facts.remoteUrl} target="_blank" rel="noopener noreferrer">
                  Open post
                </a>
              )}
            </>
          }
          retrying={busy === "retry"}
          onRetry={() => void guard("retry", () => retryApprovalAction(a.id))}
        />
      )}
    </>
  );
}

// ---- calendar events ----
function EventDetail({ approval: a, onChange }: Props) {
  const saved = eventOf(a);
  const [draft, setDraft] = useState<EventDraft>(() => toEventDraft(saved));
  const [errors, setErrors] = useState<EventDraftErrors>({});
  const { busy, guard } = useDecide(onChange, (e) => setErrors(e));
  const del = a.kind === "event_delete";
  const v = del ? null : validateEventDraft(a.tool, saved, draft);
  const dirty = !del && v !== null && "payload" in v && !sameEvent(v.payload, saved);
  const at = formatHM(new Date(a.decidedAt ?? a.createdAt));
  const res = eventResolved(a, at);
  const verb = a.kind === "event_create" ? "Create" : a.kind === "event_update" ? "Change" : "Delete";
  const before = saved.before;
  const approve = () => {
    if (del) return void guard("approve", () => approveAction(a.id), "Event deleted");
    if (!v || "errors" in v) return setErrors(v && "errors" in v ? v.errors : {});
    setErrors({});
    void guard("approve", () => approveAction(a.id, dirty ? v.payload : undefined), "Calendar updated");
  };
  const set = (k: keyof EventDraft, val: string | boolean) => setDraft({ ...draft, [k]: val } as EventDraft);
  return (
    <>
      <Head a={a} title={`${verb} event “${del || a.status !== "pending" ? saved.title : draft.title}”`} target={`${saved.calendarLabel} · ${whenText(saved.start, saved.end, saved.allDay)}`} />
      {a.status === "pending" ? (
        <>
          {a.targetChanged && <Alert tone="warn">This event changed after the request was prepared, so it can&apos;t be applied. Reject it and ask again.</Alert>}
          {before && (
            <div className={s.preview}>
              <span className={s.eyebrow}>Currently</span>
              <span>
                {before.title} · {whenText(before.start, before.end, before.allDay)}
                {before.location ? ` · ${before.location}` : ""}
              </span>
            </div>
          )}
          {del ? (
            <Alert tone="warn">This removes “{saved.title}” from {saved.calendarLabel}. It can&apos;t be undone from LifeOS.</Alert>
          ) : (
            <>
              <TextField label="Title" value={draft.title} error={errors.title} onChange={(e) => set("title", e.target.value)} data-edit />
              <div className={s.fieldsRow}>
                <TextField label="Starts" type="date" value={draft.startDate} error={errors.startDate} onChange={(e) => set("startDate", e.target.value)} />
                {!draft.allDay && <TextField label="Start time" type="time" value={draft.startTime} error={errors.startTime} onChange={(e) => set("startTime", e.target.value)} />}
                <TextField label="Ends" type="date" value={draft.endDate} error={errors.endDate} onChange={(e) => set("endDate", e.target.value)} />
                {!draft.allDay && <TextField label="End time" type="time" value={draft.endTime} error={errors.endTime} onChange={(e) => set("endTime", e.target.value)} />}
              </div>
              <div className={s.fieldsRow}>
                <Checkbox label="All day" checked={draft.allDay} onChange={(e) => set("allDay", e.target.checked)} />
                <Checkbox label="Show as free" checked={draft.showAs === "free"} onChange={(e) => set("showAs", e.target.checked ? "free" : "busy")} />
              </div>
              <TextField label="Location" value={draft.location} error={errors.location} onChange={(e) => set("location", e.target.value)} />
              <ContentField label="Description" edited={dirty} value={draft.description} error={errors.description} onChange={(d) => set("description", d)} rows={4} />
            </>
          )}
          <Decision
            approveLabel={del ? "Delete event" : dirty ? "Approve with edits" : "Approve"}
            danger={del}
            onApprove={approve}
            onReject={() => void guard("reject", () => rejectAction(a.id), "Rejected. The calendar is unchanged.")}
            busy={busy}
            disabled={a.targetChanged === true}
            source={{ label: "Open calendar", href: "/organization" }}
            next={del ? "The event is deleted once you approve; the run then resumes." : "The calendar changes once you approve; the run then resumes."}
          />
        </>
      ) : (
        <Record
          a={a}
          quote={`${saved.title} · ${whenText(saved.start, saved.end, saved.allDay)}${saved.location ? ` · ${saved.location}` : ""}`}
          outcome={res?.text ?? defaultOutcome(a)}
          links={res?.href ? <Link href={res.href}>View in calendar</Link> : null}
          retrying={busy === "retry"}
          onRetry={() => void guard("retry", () => retryApprovalAction(a.id))}
        />
      )}
    </>
  );
}

/** One approval: header, editable content (pending) or the record (resolved). Dispatches on kind. */
export function ApprovalDetail(props: Props) {
  const a = props.approval;
  if (a.kind === "finance_update") return <FinanceBody {...props} />;
  if (a.kind === "issue") return issueOf(a) ? <IssueDetail {...props} /> : <Unreadable />;
  if (a.kind === "project_create" || a.kind === "project_update") return payloadSchemaFor(a.tool).safeParse(projectOf(a)).success ? <ProjectBody {...props} /> : <Unreadable />;
  if (a.kind === "mail_reply") return payloadSchemaFor(a.tool).safeParse(mailOf(a)).success ? <MailDetail {...props} /> : <Unreadable />;
  if (a.kind === "social_publish") return payloadSchemaFor(a.tool).safeParse(socialOf(a)).success && payloadSchemaFor(a.tool).safeParse(a.original).success ? <SocialDetail {...props} /> : <Unreadable />;
  return payloadSchemaFor(a.tool).safeParse(eventOf(a) as EventPayload).success ? <EventDetail {...props} /> : <Unreadable />;
}

/** Title for list rows; never throws on a malformed payload. */
export function rowTitle(a: ApprovalDTO): string {
  try {
    return summarize(a).title;
  } catch {
    return a.tool;
  }
}

