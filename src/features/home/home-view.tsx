"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { KeyboardEvent } from "react";
import { aud } from "@/lib/finance";
import { HEALTH_LABEL } from "@/lib/project-types";
import { retryRunAction } from "@/server/agent-actions";
import { approveAction, rejectAction } from "@/server/approval-actions";
import type { HomeData } from "@/server/home";
import { clock } from "@/server/time";
import { officeState } from "@/features/agents/model";
import { approvalsHref } from "@/features/shell/nav";
import { useAgentStatus } from "@/features/shell/agent-status";
import { useShell } from "@/features/shell/shell-provider";
import { fullReviewOnly, since, stamp, summarize } from "@/features/approvals/summary";
import { Button, ButtonLink } from "@/ui/button";
import { AGENT_STATES } from "@/ui/display";
import type { AgentState } from "@/ui/display";
import { Page, Section } from "@/ui/layout";
import { PixelAvatar } from "@/ui/pixel-avatar";
import s from "./home.module.css";

const WHERE: [string, string, string][] = [
  ["task:", "Organization · task", "Open"],
  ["approvals", "Agents · approvals", "Review"],
  ["mail:", "Outreach · important mail", "Read"],
  ["conflict:", "Organization · calendar", "Resolve"],
  ["ci:", "Career · CI", "Open"],
  ["budget:", "Finances · budget", "Review"],
  ["goal:", "Goals · objective", "Open"],
  ["backup", "Settings · backups", "Check"],
];
const whereOf = (key: string) => WHERE.find(([p]) => key.startsWith(p)) ?? ["", "LifeOS", "Open"];

const TONE_COLOR: Record<AgentState, string> = {
  working: "var(--status-working)",
  approval: "var(--status-approval)",
  failed: "var(--status-failed)",
  idle: "var(--ink-3)",
  paused: "var(--ink-3)",
  offline: "var(--ink-3)",
};
const HEALTH_COLOR = { on_track: "var(--status-working)", at_risk: "var(--status-approval)", behind: "var(--status-failed)" } as const;

type InboxItem = {
  id: string;
  agentId: string;
  title: string;
  meta: string;
  failed: boolean;
  quote: string | null;
  note: string | null;
  expires: string;
  primaryLabel: string;
  primary: () => Promise<void>;
  rejectLabel: string;
  reject: () => Promise<void>;
  openLabel: string;
  openHref: string;
};

function NeedsYou({ data }: { data: HomeData }) {
  const router = useRouter();
  const { toast } = useShell();
  const { refresh } = useAgentStatus();
  const [focus, setFocus] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [listFocused, setListFocused] = useState(false);
  const names = new Map(data.agents.map((a) => [a.id, a.name]));

  const done = async (p: Promise<{ ok: boolean }>, ok: string, fail: string) => {
    setBusy(true);
    const r = await p.catch(() => ({ ok: false }));
    setBusy(false);
    toast(r.ok ? ok : fail, r.ok ? "success" : "error");
    if (r.ok) {
      void refresh();
      router.refresh();
    }
  };

  const items: InboxItem[] = [
    ...data.approvals.map((a): InboxItem => {
      const sum = summarize(a);
      return {
        id: a.id,
        agentId: a.agentId,
        title: sum.title,
        meta: `${names.get(a.agentId) ?? a.agentId} · ${a.tool} · ${since(a.createdAt)}`,
        failed: false,
        quote: sum.quote,
        note: sum.note,
        expires: `Expires ${stamp(a.expiresAt, false)}`,
        ...(fullReviewOnly(a.kind)
          ? { primaryLabel: "Review", primary: async () => router.push(approvalsHref(a.id)) }
          : { primaryLabel: "Approve", primary: () => done(approveAction(a.id), "Approved. It runs now and is recorded in Activity.", "Couldn't approve. Open it in Approvals to check the content.") }),
        rejectLabel: "Reject",
        reject: () => done(rejectAction(a.id), "Rejected. Nothing was sent.", "Couldn't reject. Try again."),
        openLabel: "Open in Approvals",
        openHref: approvalsHref(a.id),
      };
    }),
    ...data.agents
      .filter((a) => a.status === "ATTENTION" && a.lastRun?.status === "failed" && !dismissed.includes(a.id))
      .map((a): InboxItem => {
        const run = a.lastRun!;
        return {
          id: `f-${a.id}`,
          agentId: a.id,
          title: `${a.name} failed: ${run.prompt.slice(0, 90)}`,
          meta: `× ${run.errorKind?.startsWith("limit:") ? "Stopped at a run limit" : "Run failed"} · ${since(run.endedAt ?? run.startedAt ?? new Date().toISOString())}`,
          failed: true,
          quote: run.error,
          note: null,
          expires: "Failed run · kept in history",
          primaryLabel: "Retry",
          primary: () => done(retryRunAction(run.id), "Retry started.", "Couldn't start another run. Try again."),
          rejectLabel: "Dismiss",
          reject: async () => {
            setDismissed((d) => [...d, a.id]);
            toast("Dismissed. The failed run stays in history.");
          },
          openLabel: "Open run",
          openHref: `/agents?view=runs&run=${run.id}`,
        };
      }),
  ];
  const fi = Math.min(focus, Math.max(0, items.length - 1));
  const moveTo = (i: number) => {
    setFocus(i);
    document.querySelector<HTMLButtonElement>(`[data-ny="${items[i]?.id}"]`)?.focus();
  };

  // Roving focus: arrows move between rows; A / R act on the focused row; Enter toggles it natively.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!items.length || e.metaKey || e.ctrlKey || e.altKey) return;
    const cur = items[fi]!;
    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      moveTo(Math.min(items.length - 1, fi + 1));
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      moveTo(Math.max(0, fi - 1));
    } else if ((e.key === "a" || e.key === "A") && !busy) {
      e.preventDefault();
      void cur.primary();
    } else if ((e.key === "r" || e.key === "R") && !busy) {
      e.preventDefault();
      void cur.reject();
    }
  };

  return (
    <Section id="h-wait" label={`Needs you · ${items.length}`} meta={<span className={s.keys}>↑↓ MOVE · ↵ EXPAND · A APPROVE · R REJECT</span>}>
      {items.length === 0 ? <p className={s.quiet}>Nothing needs you. Approved work is recorded in Activity.</p> : <div
        role="list"
        className={s.inbox}
        onKeyDown={onKey}
        onFocus={() => setListFocused(true)}
        onBlur={() => setListFocused(false)}
        aria-label="Needs you. Use arrow keys to move, Enter to expand, A to approve, R to reject."
      >
        {items.map((it, i) => {
          const open = expanded === it.id;
          return (
            <div key={it.id} role="listitem" className={[s.item, open && s.open, i === fi && listFocused && s.focused].filter(Boolean).join(" ")}>
              <div className={s.itemRow}>
                <PixelAvatar agent={it.agentId} state={it.failed ? "failed" : "approval"} size={28} />
                <button
                  type="button"
                  data-ny={it.id}
                  tabIndex={i === fi ? 0 : -1}
                  className={s.itemToggle}
                  aria-expanded={open}
                  onClick={() => {
                    setExpanded(open ? null : it.id);
                    setFocus(i);
                  }}
                >
                  <div className={s.itemTitle}>{it.title}</div>
                  <div className={[s.itemMeta, it.failed && s.failed].filter(Boolean).join(" ")}>{it.meta}</div>
                </button>
                <Button variant="primary" disabled={busy} onClick={() => void it.primary()}>
                  {it.primaryLabel}
                </Button>
              </div>
              {open && (
                <div className={s.itemMore}>
                  {(it.quote || it.note) && <div className={s.quote}>{it.quote ?? it.note}</div>}
                  <div className={s.itemActions}>
                    <ButtonLink href={it.openHref} size="sm">
                      {it.openLabel}
                    </ButtonLink>
                    <Button variant="ghost" size="sm" destructive disabled={busy} onClick={() => void it.reject()}>
                      {it.rejectLabel}
                    </Button>
                    <span className={s.expires}>{it.expires}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>}
    </Section>
  );
}

function Today({ data }: { data: HomeData }) {
  const now = Date.parse(data.digest.generatedAt);
  type Row = { key: string; t: string; title: string; where: string; at: number; deadline: boolean };
  const rows: Row[] = [
    ...data.digest.events.map((e, i) => ({
      key: `e${i}`,
      t: e.allDay ? "All day" : clock(new Date(e.start)),
      title: e.title,
      where: e.calendar,
      at: e.allDay ? 0 : Date.parse(e.start),
      deadline: false,
    })),
    ...data.digest.tasks
      .filter((t) => t.dueAt)
      .map((t) => ({ key: `t${t.id}`, t: clock(new Date(t.dueAt!)), title: t.title, where: t.overdue ? "Overdue task" : "Due today", at: Date.parse(t.dueAt!), deadline: true })),
  ].sort((a, b) => a.at - b.at);
  const nowAt = rows.findIndex((r) => r.at > now);
  const nowLine = (
    <div key="now" className={s.nowLine} aria-label={`Now, ${clock(new Date(now))}`}>
      <span className={s.nowTime}>{clock(new Date(now))}</span>
      <span className={s.nowRule} />
    </div>
  );
  return (
    <Section id="h-today" label="Today" meta={<Link href="/organization" className={s.link}>Calendar →</Link>}>
      <div>
        {rows.length === 0 && (
          <p className={s.quiet}>{data.digest.calendarConnected ? "Nothing scheduled today." : "No calendar connected."}</p>
        )}
        {rows.map((r, i) => (
          <div key={r.key}>
            {i === nowAt && nowLine}
            <div className={[s.ev, r.deadline && s.deadline].filter(Boolean).join(" ")}>
              <span className={s.evTime}>{r.t}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span className={s.evTitle}>{r.title}</span>
                <span className={s.evWhere}>{r.where}</span>
              </div>
            </div>
          </div>
        ))}
        {rows.length > 0 && nowAt === -1 && nowLine}
      </div>
    </Section>
  );
}

function Office({ data, pending }: { data: HomeData; pending: Set<string> }) {
  const roll = data.agents
    .filter((a) => a.live)
    .map((a) => ({ ...a, state: officeState(a.status, a.live, pending.has(a.id)) }));
  return (
    <Section id="h-office" label="The office" meta={<Link href="/agents" className={s.link}>Enter the office →</Link>}>
      <div>
        <div className={s.roll}>
          {roll.map((a) => {
            const st = AGENT_STATES[a.state];
            return (
              <Link key={a.id} href={`/agents?id=${a.id}`} className={s.rollBtn} aria-label={`${a.name}, ${st.label}`} title={`${a.name} · ${st.label}`}>
                <PixelAvatar agent={a.id} state={a.state} size={42} bg="#ebe4d6" />
                <span className={s.rollGlyph} style={{ color: TONE_COLOR[a.state] }} aria-hidden="true">
                  {st.glyph}
                </span>
              </Link>
            );
          })}
        </div>
        <div className={s.legend} aria-hidden="true">
          <span>… working</span>
          <span>! needs you</span>
          <span>× failed</span>
          <span>II paused</span>
          <span>– idle</span>
        </div>
        <ul role="list" aria-label="Agent activity" className={s.log} style={{ padding: 0, margin: "12px 0 0" }}>
          {data.activity.map((ev) => (
            <li key={ev.id} className={s.logRow}>
              <span className={s.logTime}>{clock(new Date(ev.at))}</span>
              <span>{ev.title}</span>
            </li>
          ))}
          {data.activity.length === 0 && <li className={s.logRow}><span /><span>No agent activity yet today.</span></li>}
        </ul>
      </div>
    </Section>
  );
}

function Across({ data, states }: { data: HomeData; states: Map<string, AgentState> }) {
  const f = data.finance;
  const monthName = new Date(`${f?.month ?? "2026-01"}-15T00:00:00Z`).toLocaleString("en-AU", { month: "long", timeZone: "UTC" });
  const o = data.outreach;
  return (
    <Section id="h-across" label="Across LifeOS" meta="Finances figures come from imported CSVs" className={s.across}>
        <div className={s.cards}>
          <article aria-labelledby="c-fin" className={s.card}>
            <div className={s.cardHead}>
              <h3 id="c-fin" className={s.cardTitle}>
                Finances · {monthName}
              </h3>
              <PixelAvatar agent="finance" state={states.get("finance") ?? "idle"} size={28} bg="#ebe4d6" />
            </div>
            {f?.hasData ? (
              <>
                <div className={s.figs}>
                  <div>
                    <div className={s.fig}>{aud(f.spent)}</div>
                    <div className={s.figKey}>spent</div>
                  </div>
                  <div>
                    <div className={`${s.fig} ${f.net >= 0 ? s.pos : s.neg}`}>
                      {f.net >= 0 ? "+" : "−"}
                      {aud(Math.abs(f.net))}
                    </div>
                    <div className={s.figKey}>net cash flow</div>
                  </div>
                </div>
                {f.over && (
                  <div>
                    <div className={s.budgetRow}>
                      <span>{f.over.category}</span>
                      <span className={s.budgetFig}>
                        {aud(f.over.actual)} / {aud(f.over.limit)} · over {aud(f.over.actual - f.over.limit)}
                      </span>
                    </div>
                    <div className={s.bar} role="img" aria-label={`${f.over.category}: ${aud(f.over.actual)} of ${aud(f.over.limit)} budget`}>
                      <div className={s.barFill} style={{ width: "100%" }} />
                      <div className={s.barMark} style={{ left: `${Math.round((f.over.limit / f.over.actual) * 100)}%` }} />
                    </div>
                  </div>
                )}
                <p className={s.cardText}>{f.uncategorised ? `${f.uncategorised} transactions uncategorised` : "Every transaction is categorised"}</p>
              </>
            ) : (
              <p className={s.cardText}>No transactions imported for {monthName}. Import a CSV to see spending and budgets.</p>
            )}
            <Link href="/finances" className={s.cardFoot}>
              Review in Finances →
            </Link>
          </article>

          <article aria-labelledby="c-proj" className={s.card}>
            <div className={s.cardHead}>
              <h3 id="c-proj" className={s.cardTitle}>
                Projects · {data.projects.length} active
              </h3>
              <PixelAvatar agent="projects" state={states.get("projects") ?? "idle"} size={28} bg="#ebe4d6" />
            </div>
            {data.projects.slice(0, 3).map((p) => {
              const color = p.health ? HEALTH_COLOR[p.health] : "var(--ink)";
              return (
                <Link key={p.project.id} href={`/projects/${p.project.id}`} className={s.projBtn}>
                  <span className={s.projTop}>
                    <span className={s.projName}>{p.project.name}</span>
                    <span className={s.projHealth} style={{ color }}>
                      {p.health ? HEALTH_LABEL[p.health] : "No health yet"}
                    </span>
                  </span>
                  <span className={s.projBar}>
                    <span className={s.projFill} style={{ width: `${p.progress.pct ?? 0}%`, background: color }} />
                  </span>
                  <span className={s.projMeta}>
                    {p.progress.done}/{p.progress.total} {p.progress.basis === "milestones" ? "milestones" : "tasks"}
                    {p.nextTask ? ` · next: ${p.nextTask.title}` : ""}
                  </span>
                </Link>
              );
            })}
            {data.projects.length === 0 && <p className={s.cardText}>No active projects.</p>}
            <Link href="/projects" className={s.cardFoot}>
              All projects →
            </Link>
          </article>

          <article aria-labelledby="c-out" className={s.card}>
            <div className={s.cardHead}>
              <h3 id="c-out" className={s.cardTitle}>
                Outreach · {o.important} important
              </h3>
              <PixelAvatar agent="outreach" state={states.get("outreach") ?? "idle"} size={28} bg="#ebe4d6" />
            </div>
            {o.mails.map((m) => (
              <Link key={m.id} href={`/outreach?mail=${m.id}`} className={s.mailBtn}>
                <span className={s.mailFrom}>{m.from}</span>
                <span className={s.mailTime}>{clock(new Date(m.at))}</span>
                <span className={s.mailSubj}>{m.subject}</span>
              </Link>
            ))}
            {o.mails.length === 0 && <p className={s.cardText}>No unread important mail.</p>}
            <p className={s.outFoot}>
              {o.tonight ? (
                <>
                  Tonight: <strong>{o.tonight.title}</strong> · {o.tonight.stage === "ATTENDING" ? "Attending" : "Interested"} · {clock(new Date(o.tonight.start))}
                </>
              ) : (
                "No saved events tonight."
              )}
              <br />
              {o.followUps.n ? `${o.followUps.n} follow-up${o.followUps.n === 1 ? "" : "s"} due${o.followUps.first ? `, ${o.followUps.first}` : ""}` : "No follow-ups due."}
            </p>
            <Link href="/outreach" className={s.cardFoot}>
              Open Outreach →
            </Link>
          </article>
        </div>
    </Section>
  );
}

export function HomeView({ data }: { data: HomeData }) {
  const { status } = useAgentStatus();
  const pending = new Set(data.approvals.map((a) => a.agentId));
  const states = new Map(data.agents.map((a) => [a.id, officeState(a.status, a.live, pending.has(a.id))]));
  const working = [...states.values()].filter((st) => st === "working").length;
  const failed = data.agents.filter((a) => states.get(a.id) === "failed");
  const waiting = status?.approvalsWaiting ?? data.approvals.length;

  return (
    <Page home label="Home">
      <div className={s.dateLine}>
        {data.dateLine}
        {data.briefing && (
          <>
            {" · "}
            <Link href={`/briefings?id=${data.briefing.id}`} className={s.briefLink}>
              BRIEFING {data.briefing.at}
            </Link>
          </>
        )}
      </div>
      <h1 className={s.h1}>
        {data.greeting} {data.headline}
      </h1>
      <p className={s.counts}>
        {waiting} waiting on you · {working} agent{working === 1 ? "" : "s"} working ·{" "}
        {failed.length ? `${failed.map((a) => a.name).join(", ")} failed on the last run` : "no failed runs"}
      </p>

      <div className={s.row}>
        <div className={s.main}>
          <Section id="h-matters" label="What matters" meta="Ranked by weight, no model">
            <div>
              {data.priorities.map((p, i) => {
                const [, where, action] = whereOf(p.key);
                return (
                  <div key={p.key} className={s.prio}>
                    <div className={s.prioN} aria-hidden="true">
                      {i + 1}
                    </div>
                    <div className={s.prioBody}>
                      <div className={s.prioTitle}>{p.label}</div>
                      <div className={s.prioWhy}>{p.detail}</div>
                      <div className={s.prioWhere}>{where}</div>
                    </div>
                    <ButtonLink href={p.href} variant="secondary">
                      {action} →
                    </ButtonLink>
                  </div>
                );
              })}
              {data.priorities.length === 0 && <p className={s.quiet}>Nothing is pressing. Today is yours.</p>}
            </div>
          </Section>
        </div>
        <div className={s.side}>
          <Today data={data} />
        </div>
      </div>

      <div className={s.row}>
        <div className={s.main}>
          <NeedsYou data={data} />
        </div>
        <div className={s.side}>
          <Office data={data} pending={pending} />
        </div>
      </div>

      <Across data={data} states={states} />
    </Page>
  );
}
