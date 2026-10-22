"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ApprovalDTO } from "@/lib/agent-types";
import type { MailMessageDTO } from "@/lib/outreach-types";
import { addMailTaskAction, archiveMailAction, flagMailAction, getMailBodyAction, triageMailAction } from "@/server/mail-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Badge } from "@/legacy-ui/badge";
import { Button } from "@/legacy-ui/button";
import { Icon } from "@/legacy-ui/icon";
import { InlineError } from "@/legacy-ui/inline-error";
import { Skeleton } from "@/legacy-ui/skeleton";
import { IMPORTANCE_TONE, senderOf } from "./email-card";
import { DraftReply } from "./draft-reply";
import { dateShort, hhmm } from "./fmt";

type Body = { st: "loading" } | { st: "error" } | { st: "ok"; text: string; htmlOnly: boolean; truncated: boolean; threadId: string };
const eyebrow = "text-[11px] font-medium tracking-[.14em] text-text-3";
const names = (xs: { name: string; address: string }[]) => xs.map((x) => x.name || x.address).join(", ");
const THREAD = /^[A-Za-z0-9]+$/;

/** Rendered with key={mail.id}: all local state belongs to one message. */
export function EmailDetail({
  mail: m,
  approval,
  paused,
  nextId,
  autoDraft,
  onAutoDrafted,
  onSelect,
}: {
  mail: MailMessageDTO;
  approval: ApprovalDTO | null;
  paused: boolean;
  /** mail to select after this one leaves the list (archive/unarchive) */
  nextId: string | null;
  autoDraft: boolean;
  onAutoDrafted: () => void;
  onSelect: (id: string | null) => void;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const [body, setBody] = useState<Body>({ st: "loading" });
  const [tries, setTries] = useState(0);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState<number | null>(null);
  const [flag, setFlag] = useState(m.flaggedAt !== null);
  const [triaging, setTriaging] = useState(false);
  const archived = m.archivedAt !== null;

  useEffect(() => {
    let live = true;
    void getMailBodyAction(m.id)
      .then((r) => {
        if (!live) return;
        setBody(r.ok && "text" in r ? { st: "ok", text: r.text, htmlOnly: r.htmlOnly, truncated: r.truncated, threadId: r.threadId } : { st: "error" });
      })
      .catch(() => live && setBody({ st: "error" }));
    return () => {
      live = false;
    };
  }, [m.id, tries]);

  const retry = () => {
    setBody({ st: "loading" });
    setTries((n) => n + 1);
  };

  const addTask = async (i: number) => {
    setAdding(i);
    const r = await addMailTaskAction(m.id, i).catch(() => ({ ok: false }) as const);
    setAdding(null);
    if (!r.ok) return toast("Couldn't save that. Try again.", "error");
    setAdded((s) => new Set(s).add(i));
    toast("Task added");
    router.refresh();
  };

  const archive = async () => {
    const next = !archived;
    onSelect(nextId); // optimistic: the row leaves this list
    const r = await archiveMailAction(m.id, next).catch(() => ({ ok: false }) as const);
    if (!r.ok) {
      onSelect(m.id);
      return toast("Couldn't save that. Try again.", "error");
    }
    toast(next ? "Archived in LifeOS. Gmail is unchanged." : "Moved back to inbox");
    router.refresh();
  };

  const toggleFlag = async () => {
    const next = !flag;
    setFlag(next);
    const r = await flagMailAction(m.id, next).catch(() => ({ ok: false }) as const);
    if (!r.ok) {
      setFlag(!next);
      return toast("Couldn't save that. Try again.", "error");
    }
    toast(next ? "Flagged" : "Unflagged");
    router.refresh();
  };

  const triage = async () => {
    setTriaging(true);
    const r = await triageMailAction(m.id).catch(() => ({ ok: false }) as const);
    setTriaging(false);
    toast(r.ok ? "Triage started" : "Couldn't save that. Try again.", r.ok ? "success" : "error");
  };

  const extra = (
    <>
      <Button variant="secondary" size="sm" onClick={() => void archive()}>
        <Icon name={archived ? "unarchive" : "archive"} size={16} />
        {archived ? "Unarchive" : "Archive"}
      </Button>
      <Button variant="secondary" size="sm" aria-pressed={flag} onClick={() => void toggleFlag()}>
        <Icon name="flag" size={16} fill={flag} />
        {flag ? "Unflag" : "Flag"}
      </Button>
    </>
  );

  return (
    <article aria-labelledby={`mail-${m.id}`} className="glass-card flex flex-col gap-6 rounded-24 p-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start gap-3">
          <h2 id={`mail-${m.id}`} className="min-w-0 flex-1 font-display text-[26px] leading-[1.12] font-medium break-words">
            {m.subject || "(no subject)"}
          </h2>
          {m.importance && !m.bulk && (
            <Badge kind="status" tone={IMPORTANCE_TONE[m.importance]}>
              {m.importance}
            </Badge>
          )}
        </div>
        <p className="text-[13.5px] break-words text-text">
          {senderOf(m)} {m.from.name && <span className="text-[12.5px] text-text-3">{`<${m.from.address}>`}</span>}
          <span className="text-[12.5px] text-text-3">{` · ${dateShort(m.receivedAt)}, ${hhmm(m.receivedAt)}`}</span>
        </p>
        <p className="text-[12.5px] break-words text-text-3">
          {`To ${names(m.to) || "me"}`}
          {m.cc.length > 0 && `, cc ${names(m.cc)}`}
        </p>
      </header>

      <section aria-labelledby={`sum-${m.id}`} className="flex flex-col gap-2">
        <h3 id={`sum-${m.id}`} className={eyebrow}>
          AI SUMMARY
        </h3>
        {m.bulk ? (
          <p className="text-[13.5px] text-text-2">Bulk or promotional mail. Not sent to the AI.</p>
        ) : m.triagedAt && m.summary ? (
          <p className="text-[14px] leading-normal break-words text-text">{m.summary}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[13.5px] text-text-2">Not triaged yet.</p>
            <Button variant="secondary" size="xs" loading={triaging} disabled={paused} onClick={() => void triage()} aria-describedby={paused ? `paused-${m.id}` : undefined}>
              <Icon name="auto_awesome" size={14} />
              Triage
            </Button>
            {paused && (
              <span id={`paused-${m.id}`} className="text-[12.5px] text-text-3">
                Triage is paused at the monthly AI cap.
              </span>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby={`act-${m.id}`} className="flex flex-col gap-2">
        <h3 id={`act-${m.id}`} className={eyebrow}>
          ACTION ITEMS
        </h3>
        {m.actionItems.length === 0 ? (
          <p className="text-[13.5px] text-text-2">No action items.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {m.actionItems.map((it, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <Icon name={added.has(i) ? "task_alt" : "radio_button_unchecked"} size={16} className={added.has(i) ? "text-green" : "text-text-3"} />
                <span className="min-w-0 flex-1 text-[13.5px] break-words">
                  {it.text}
                  {it.due && <span className="ml-2 text-[12.5px] text-text-3">{`due ${it.due}`}</span>}
                </span>
                {added.has(i) ? (
                  <span className="text-[12.5px] text-text-3">Task added</span>
                ) : (
                  <Button variant="ghost" size="xs" loading={adding === i} disabled={adding !== null && adding !== i} aria-label={`Add ${it.text} as a task`} onClick={() => void addTask(i)}>
                    <Icon name="add" size={14} />
                    Add as task
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`msg-${m.id}`} className="flex flex-col gap-2">
        <h3 id={`msg-${m.id}`} className={eyebrow}>
          MESSAGE
        </h3>
        {body.st === "loading" && (
          <div className="flex flex-col gap-2 rounded-14 border border-white/[.08] bg-white/[.03] p-4">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-[94%]" />
            <Skeleton className="h-3.5 w-[88%]" />
            <Skeleton className="h-3.5 w-[55%]" />
          </div>
        )}
        {body.st === "error" && (
          <InlineError label="ERROR · MESSAGE" title="Couldn't load the message. Try again." what="The message body could not be fetched from Gmail." why="Gmail may be unreachable or access may have changed." fix="Try again, or check the connection in Settings." action={{ label: "Try again", onClick: retry }} />
        )}
        {body.st === "ok" && (
          <>
            {/* plain text node only: mail text is untrusted, no HTML and no remote images */}
            <div role="region" aria-label="Message body" tabIndex={0} className="max-h-[480px] overflow-auto rounded-14 border border-white/[.08] bg-white/[.03] p-4 text-[14px] leading-[1.65] break-words whitespace-pre-wrap text-text-2">
              {body.text || m.snippet}
            </div>
            {body.htmlOnly && <p className="text-[12.5px] text-text-3">Shown as plain text. Images and formatting are not loaded.</p>}
            {body.truncated && (
              <p className="text-[12.5px] text-text-3">
                Message is long; showing the first part.{" "}
                {THREAD.test(body.threadId) && (
                  <a href={`https://mail.google.com/mail/${m.mailbox ? `?authuser=${encodeURIComponent(m.mailbox)}` : "u/0/"}#inbox/${body.threadId}`} target="_blank" rel="noopener noreferrer" className="text-cyan">
                    Open in Gmail
                  </a>
                )}
              </p>
            )}
          </>
        )}
      </section>

      <DraftReply mailId={m.id} approval={approval} capReached={paused} autoDraft={autoDraft} onAutoDrafted={onAutoDrafted} extraActions={extra} />
    </article>
  );
}
