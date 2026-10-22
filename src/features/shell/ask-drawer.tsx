"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { ApprovalDTO, ChatBlockCode, StepDTO, TurnDTO } from "@/lib/agent-types";
import { approvalSummary } from "@/lib/approval-kinds";
import { isSafeGithubUrl } from "@/lib/safe-url";
import { retryRunAction } from "@/server/agent-actions";
import { Button, IconButton } from "@/ui/button";
import { Alert } from "@/ui/feedback";
import { Icon } from "@/ui/icon";
import { Drawer } from "@/ui/overlay";
import { PixelAvatar } from "@/ui/pixel-avatar";
import { useAgentStatus } from "./agent-status";
import { parseAnswer } from "./answer";
import type { Inline } from "./answer";
import { approvalsHref } from "./nav";
import { useShell } from "./shell-provider";
import { useChat } from "./use-chat";
import s from "./shell.module.css";

const SUB = { ready: "ONLINE", working: "WORKING", paused: "PAUSED", cap: "SPEND CAP REACHED", no_key: "NOT CONNECTED" } as const;
const LIMIT_KIND: Record<string, string> = { "limit:tool_calls": "tool-call", "limit:tokens": "token", "limit:time": "time" };
const EXAMPLES = ["What needs me today?", "What's left before the next milestone?", "When am I free on Thursday?", "Which pull requests need my review?"];

const secs = (ms: number | null) => (ms === null ? "" : `${(ms / 1000).toFixed(1)}s`);

function traceRows(t: TurnDTO): { label: string; dur: string; mark: string; tone?: "ok" | "bad" | "wait" }[] {
  const rows: { label: string; dur: string; mark: string; tone?: "ok" | "bad" | "wait" }[] = t.steps.map((st: StepDTO) => {
    const label = st.kind === "route" ? st.action : st.kind === "delegate" ? `Delegated to ${st.actor} · ${st.action}` : `${st.tool ?? st.action}${st.inputSummary ? ` · ${st.inputSummary}` : ""}`;
    const mark = st.state === "done" ? "·" : st.state === "running" ? "…" : st.state === "queued" ? "○" : st.state === "waiting" ? "!" : st.state === "failed" ? "×" : "–";
    return { label, dur: secs(st.durationMs), mark, tone: st.state === "failed" ? "bad" : st.state === "waiting" ? "wait" : undefined };
  });
  const r = t.run;
  if (!r) rows.unshift({ label: "Queued", dur: "", mark: "○" });
  else if (r.status === "completed") rows.push({ label: `Done · ${r.tier === "simple" ? "FREE" : r.model.toUpperCase()}`, dur: secs(r.durationMs), mark: "✓", tone: "ok" });
  else if (r.status === "failed") rows.push({ label: "Failed", dur: secs(r.durationMs), mark: "×", tone: "bad" });
  else if (r.status === "waiting_approval") rows.push({ label: "Waiting on your approval", dur: "", mark: "!", tone: "wait" });
  else if (r.status === "cancelled") rows.push({ label: "Stopped", dur: secs(r.durationMs), mark: "–" });
  return rows;
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) =>
        n.t === "text" ? (
          n.text
        ) : n.t === "code" ? (
          <code key={i}>{n.text}</code>
        ) : isSafeGithubUrl(n.url) ? (
          <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className={s.cite}>
            {n.ref}
          </a>
        ) : (
          n.ref
        ),
      )}
    </>
  );
}

function Answer({ text, live }: { text: string; live: boolean }) {
  return (
    <div className={s.answer}>
      {parseAnswer(text).map((b, i) =>
        b.t === "p" ? (
          <p key={i} style={{ whiteSpace: "pre-wrap" }}>
            <Inlines nodes={b.inline} />
          </p>
        ) : b.t === "ul" ? (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>
                <Inlines nodes={it} />
              </li>
            ))}
          </ul>
        ) : (
          <pre key={i}>{b.text}</pre>
        ),
      )}
      {live && <span className={s.caret} aria-hidden="true" />}
    </div>
  );
}

function Proposal({ a, onNavigate }: { a: ApprovalDTO; onNavigate: () => void }) {
  const sum = approvalSummary(a.tool, a.edited ?? a.original, new Date(a.expiresAt));
  const title = sum.title.replace(/^Approval waiting: /, "") || a.tool;
  const pending = a.status === "pending";
  return (
    <div className={s.entities}>
      <div className={s.entity} style={{ flexDirection: "column", gap: 4 }}>
        <span className={s.entityMeta} style={{ color: pending ? "var(--status-approval)" : "var(--ink-3)" }}>
          {pending ? `! AWAITING YOUR APPROVAL · ${a.tool}` : `${a.status.toUpperCase()} · ${a.tool}`}
        </span>
        <span>{title}</span>
        {sum.body && <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{sum.body}</span>}
      </div>
      {pending && (
        <Link href={approvalsHref(a.id)} className={s.entity} onClick={onNavigate}>
          Review in Approvals
          <Icon name="arrow_forward" size={16} />
        </Link>
      )}
    </div>
  );
}

function Turn({ t, live, onNavigate, onRetried }: { t: TurnDTO; live: boolean; onNavigate: () => void; onRetried: () => void }) {
  const { toast } = useShell();
  const [retrying, setRetrying] = useState(false);
  const run = t.run;
  const streaming = live && (!run || run.status === "queued" || run.status === "running");
  const items = [...t.steps].reverse().find((st) => st.items && st.items.length > 0);
  const limit = run?.errorKind ? LIMIT_KIND[run.errorKind] : undefined;
  const follow = [
    ...(items?.items ?? []).slice(0, 2).map((it) => ({ label: `Open ${it.title}`, href: it.href })),
    ...(run && run.status !== "queued" ? [{ label: "Open run trace", href: `/agents?view=runs&run=${run.id}` }] : []),
  ];
  const retry = async () => {
    if (!run || retrying) return;
    setRetrying(true);
    const r = await retryRunAction(run.id);
    setRetrying(false);
    if (r.ok) onRetried();
    else toast("Couldn't start another run. Try again.", "error");
  };
  return (
    <>
      <div className={s.userMsg}>{t.prompt}</div>
      <div className={s.bot} aria-busy={streaming}>
        <div className={s.trace}>
          {traceRows(t).map((r, i) => (
            <div key={i} className={[s.traceRow, r.tone && s[r.tone]].filter(Boolean).join(" ")}>
              <span>
                {r.mark} {r.label}
              </span>
              <span>{r.dur}</span>
            </div>
          ))}
        </div>
        {(run?.answer || streaming) && <Answer text={run?.answer ?? ""} live={streaming} />}
        {items?.items && (
          <div className={s.entities}>
            {items.items.map((it, i) => (
              <Link key={`${it.href}-${i}`} href={it.href} className={s.entity} onClick={onNavigate}>
                <span>{it.title}</span>
                <span className={s.entityMeta}>{it.subtitle}</span>
              </Link>
            ))}
            {items.itemsMore > 0 && (
              <Link href="/organization" className={s.entity} onClick={onNavigate}>
                Show {items.itemsMore} more
              </Link>
            )}
          </div>
        )}
        {t.approvals.map((a) => (
          <Proposal key={a.id} a={a} onNavigate={onNavigate} />
        ))}
        {run?.status === "failed" && run.errorKind !== "no_key" && (
          <Alert action={limit ? undefined : <Button variant="text" size="sm" onClick={() => void retry()} disabled={retrying}>{retrying ? "Trying…" : "Try again"}</Button>}>
            {limit ? `That run stopped at its ${limit} limit. Ask a narrower question, or open the run to see what finished.` : (run.error ?? "That run didn't finish.")}
          </Alert>
        )}
        {!streaming && follow.length > 0 && (
          <div className={s.chips}>
            {follow.map((f) => (
              <Link key={f.label} href={f.href} className={s.chip} onClick={onNavigate}>
                {f.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function AskDrawer() {
  const { aiOpen, aiPrompt, closeAI, consumeAIPrompt, toast } = useShell();
  const { status } = useAgentStatus();
  const chat = useChat();
  const { turns, streaming, send, loadThreads } = chat;
  const [draft, setDraft] = useState("");
  const [recent, setRecent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const assistant = status?.assistant ?? "ready";
  const block: ChatBlockCode | null = chat.block ?? (assistant === "cap" || assistant === "no_key" || assistant === "paused" ? assistant : null);
  const blocked = block === "cap" || block === "no_key" || block === "paused";

  const submit = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || blocked || streaming) return;
    setDraft("");
    setRecent(false);
    const ok = await send(prompt);
    if (!ok) setDraft((d) => d || text);
  };

  useEffect(() => {
    // Wait for status so a blocked assistant never POSTs; a prompt sent while a run streams waits for it.
    if (!aiOpen || !status || !aiPrompt || streaming) return;
    const t = setTimeout(() => {
      const p = consumeAIPrompt();
      if (!p) return;
      if (blocked) setDraft(p);
      else void submit(p);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- submit is recreated each render; consume on open and on every new prompt
  }, [aiOpen, aiPrompt, status === null, streaming, consumeAIPrompt]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [turns]);

  useEffect(() => {
    if (chat.block === "rate_limited") toast("Too many requests. Wait a moment, then try again.", "error");
    else if (chat.block === "invalid") toast("That request couldn't be sent. Try again.", "error");
  }, [chat.block, toast]);

  const activeRunId = streaming ? [...turns].reverse().find((t) => t.run)?.run?.id : undefined;
  const onNavigate = () => {
    if (window.matchMedia("(max-width: 719px)").matches) closeAI();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit(draft);
    }
  };
  const refetch = () => void (chat.threadId && chat.openThread(chat.threadId));

  return (
    <Drawer
      open={aiOpen}
      onClose={closeAI}
      label="Ask LifeOS"
      head={
        <span className={s.agentHead}>
          <PixelAvatar agent="orchestrator" state={streaming ? "working" : "idle"} size={28} bg="#ebe4d6" />
          <span>
            <span className={s.agentName} style={{ display: "block" }}>
              Ask LifeOS
            </span>
            <span className={s.agentSub}>ORCHESTRATOR · {streaming ? "WORKING" : SUB[assistant]}</span>
          </span>
        </span>
      }
      actions={
        <>
        <IconButton
            icon="edit_square"
            label="New conversation"
            small
            size={18}
            onClick={() => {
              chat.newThread();
              setRecent(false);
              inputRef.current?.focus();
            }}
          />
          <IconButton
            icon="history"
            label="Recent conversations"
            small
            size={18}
            aria-expanded={recent}
            onClick={() => {
              if (!recent) void loadThreads();
              setRecent(!recent);
            }}
          />
        </>
      }
    >
      <div role="log" aria-live="polite" className={s.log}>
        {recent ? (
          <div className={s.threads}>
            {chat.threads.length === 0 && <p className={s.introText}>No conversations yet.</p>}
            {chat.threads.map((th) => (
              <button
                key={th.id}
                type="button"
                className={s.thread}
                aria-current={th.id === chat.threadId}
                onClick={() => {
                  void chat.openThread(th.id);
                  setRecent(false);
                }}
              >
                <span>{th.title}</span>
                <span className={s.entityMeta}>{th.messageCount}</span>
              </button>
            ))}
          </div>
        ) : turns.length === 0 ? (
          <div className={s.intro}>
            <p className={s.introTitle}>What should we look at?</p>
            <p className={s.introText}>Ask about your day, projects, mail or repositories. Anything that writes outside LifeOS is proposed, then waits for you in Approvals.</p>
            <div className={s.examples}>
              {EXAMPLES.map((e) => (
                <button key={e} type="button" className={s.example} disabled={blocked || streaming} onClick={() => void submit(e)}>
                  <Icon name="auto_awesome" size={17} />
                  {e}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t, i) => <Turn key={t.id} t={t} live={streaming && i === turns.length - 1} onNavigate={onNavigate} onRetried={refetch} />)
        )}
        {!recent && blocked && (
          <Alert
            action={
              block === "no_key" ? undefined : (
                <Link href={block === "cap" ? "/settings?section=ai" : "/agents?view=table"} onClick={onNavigate}>
                  {block === "cap" ? "Open Settings" : "Open Agents"}
                </Link>
              )
            }
          >
            {block === "cap"
              ? `Your request wasn't sent: this month's AI spend reached the US$${chat.capUsd ?? status?.capUsd ?? 0} cap.`
              : block === "no_key"
                ? "LifeOS can't answer yet: add an Anthropic API key on the server and restart."
                : "New runs are paused. Running work will finish."}
          </Alert>
        )}
        <div ref={endRef} />
      </div>
      <div className={s.compose}>
        <div className={s.composeRow}>
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={blocked ? "New runs are unavailable" : "Ask about your day, projects, mail…"}
            aria-label="Message"
            aria-disabled={blocked || undefined}
            className={s.composeInput}
          />
          {streaming ? (
            <Button variant="secondary" style={{ height: 40 }} disabled={!activeRunId} onClick={() => activeRunId && void chat.stop(activeRunId)}>
              Stop
            </Button>
          ) : (
            <Button variant="primary" style={{ height: 40, padding: "0 14px", fontSize: 14 }} disabled={!draft.trim() || blocked} onClick={() => void submit(draft)}>
              Send
            </Button>
          )}
        </div>
        <p className={s.note}>Anything that writes outside LifeOS is proposed, then waits in Approvals.</p>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {chat.announce}
      </div>
    </Drawer>
  );
}
