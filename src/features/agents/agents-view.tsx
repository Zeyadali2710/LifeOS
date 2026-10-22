"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { ApprovalDTO, RunDTO, RunStatus, StepDTO } from "@/lib/agent-types";
import { formatDuration, formatTokens, formatUsd } from "@/lib/format";
import { agentInspectorAction, runTraceAction } from "@/server/agents-view-actions";
import { cancelRunAction, pauseAgentAction, pauseAllAction, resumeAgentAction, resumeAllAction, retryRunAction, setAgentModelAction } from "@/server/agent-actions";
import { approveAction, rejectAction } from "@/server/approval-actions";
import type { Inspector, RunTrace } from "@/server/agents/view";
import { MODELS, modelShort } from "@/server/agents/registry";
import { clock } from "@/server/time";
import { useAgentStatus, useApprovalCount } from "@/features/shell/agent-status";
import { useLiveEvents } from "@/features/shell/live-provider";
import { useShell } from "@/features/shell/shell-provider";
import { approvalsHref } from "@/features/shell/nav";
import { ApprovalsInbox } from "@/features/approvals/inbox";
import type { WriteFacts } from "@/features/approvals/detail";
import { fullReviewOnly, since, stamp, summarize, TIER_OF } from "@/features/approvals/summary";
import { Button, ButtonLink } from "@/ui/button";
import { CountBadge, AGENT_STATES } from "@/ui/display";
import type { AgentState } from "@/ui/display";
import { ConfirmDialog } from "@/ui/overlay";
import { setMotion, useReducedMotion } from "@/ui/motion";
import { PixelAvatar } from "@/ui/pixel-avatar";
import { layout, LOOKS, mountOffice, PAL } from "@/ui/pixelkit";
import type { OfficeOptions } from "@/ui/pixelkit";
import { officeState, STATE_RANK } from "./model";
import s from "./agents.module.css";

export type AgentsView = "office" | "approvals" | "table" | "runs";
export type OverviewAgent = { id: string; name: string; purpose: string; live: boolean; status: string; currentTask: string | null; stats: { last: RunDTO | null } | null };

const TONE: Record<AgentState, string> = {
  working: "var(--status-working)",
  approval: "var(--status-approval)",
  failed: "var(--status-failed)",
  idle: "var(--ink-2)",
  paused: "var(--ink-2)",
  offline: "var(--ink-2)",
};
const RUN_STATUS: Record<RunStatus, { label: string; color: string; group: string }> = {
  queued: { label: "○ Queued", color: "var(--ink-3)", group: "running" },
  running: { label: "… Running", color: "var(--status-working)", group: "running" },
  waiting_approval: { label: "! Waiting approval", color: "var(--status-approval)", group: "waiting_approval" },
  completed: { label: "✓ Succeeded", color: "var(--ink)", group: "succeeded" },
  failed: { label: "× Failed", color: "var(--status-failed)", group: "failed" },
  cancelled: { label: "– Cancelled", color: "var(--ink-3)", group: "other" },
  expired: { label: "○ Expired", color: "var(--ink-3)", group: "other" },
};
const TIER_COLOR = { READ: "var(--status-working)", PREPARE: "var(--ink-2)", EXECUTE: "var(--ink-2)", APPROVE: "var(--status-approval)", HIGH_RISK: "var(--status-failed)" } as const;
const MODEL_OPTS = [
  ["auto", "Auto"],
  ["free", "Free only"],
  [MODELS.sonnet, "Sonnet"],
  [MODELS.opus, "Opus"],
] as const;

const runWhen = (r: RunDTO) => (r.startedAt ? clock(new Date(r.startedAt)) : "queued");
const runTook = (r: RunDTO) => (r.durationMs !== null ? formatDuration(r.durationMs) : r.status === "running" ? "…" : "—");
const runRoute = (r: RunDTO) => (r.agentId === "automations" ? "—" : modelShort(r.model));

/** "Thu 9:16" when not today. */
function ago(iso: string | null): string {
  if (!iso) return "";
  return since(iso);
}

function Trace({ steps }: { steps: StepDTO[] }) {
  return (
    <div>
      <div className={s.traceHead}>TRACE · TOOL CALLS AND ROUTE STEPS</div>
      {steps.map((st) => {
        const mark = st.state === "done" ? "✓" : st.state === "running" ? "…" : st.state === "waiting" ? "!" : st.state === "failed" ? "×" : st.kind === "route" ? "↗" : "·";
        const color = st.state === "done" ? "var(--status-working)" : st.state === "waiting" ? "var(--status-approval)" : st.state === "failed" ? "var(--status-failed)" : "var(--ink-3)";
        const label = st.kind === "route" ? st.action : st.kind === "delegate" ? `Delegated to ${st.actor}` : (st.tool ?? st.action);
        const meta = st.kind === "route" ? (st.inputSummary ?? st.outputSummary ?? "") : `${st.action}${st.state === "waiting" ? " · suspended, approval created" : st.state === "failed" && st.error ? ` · ${st.error}` : ""}`;
        return (
          <div key={st.id} className={s.traceRow}>
            <span className={s.traceMark} style={{ color }} aria-hidden="true">
              {mark}
            </span>
            <div>
              <div className={s.traceLabel}>{label}</div>
              {meta && <div className={s.traceSub}>{meta}</div>}
              {st.outputSummary && st.kind !== "route" && <pre className={s.io}>{st.outputSummary}</pre>}
            </div>
            <span className={s.monoSm}>{st.durationMs !== null ? formatDuration(st.durationMs) : ""}</span>
          </div>
        );
      })}
      {steps.length === 0 && <p className={s.small} style={{ paddingTop: 10 }}>No tool calls yet.</p>}
    </div>
  );
}

function RunPanel({ trace, back, onBack, onRun, onChange }: { trace: RunTrace; back: string; onBack: () => void; onRun: (id: string) => void; onChange: () => void }) {
  const { toast } = useShell();
  const [busy, setBusy] = useState(false);
  const act = async (retry: boolean) => {
    setBusy(true);
    const result = await (retry ? retryRunAction(trace.run.id) : cancelRunAction(trace.run.id)).catch(() => ({ ok: false }));
    setBusy(false);
    toast(result.ok ? (retry ? "Retry started." : "Cancellation requested.") : "Couldn't do that. Try again.", result.ok ? "success" : "error");
    if (result.ok) {
      if ("runId" in result && result.runId) onRun(result.runId);
      onChange();
    }
  };
  const r = trace.run;
  const st = RUN_STATUS[r.status];
  return (
    <div className={s.panelIn}>
      <button type="button" className={s.linkBtn} onClick={onBack}>
        ← {back}
      </button>
      <div>
        <div className={s.traceMeta}>
          RUN · {runWhen(r)} · {trace.agentName.toUpperCase()}
        </div>
        <div className={s.traceTitle}>{r.prompt}</div>
        <div className={s.traceLine} style={{ color: st.color }}>
          {st.label} · {runTook(r)} · {runRoute(r)} · {formatTokens(r.tokensIn + r.tokensOut)} tokens · {formatUsd(r.costUsd)}
        </div>
      </div>
      {r.error && <p className={s.failText}>{r.error}</p>}
      <div className={s.row}>
        {["queued", "running", "waiting_approval"].includes(r.status) && <Button destructive disabled={busy} onClick={() => void act(false)}>Cancel run</Button>}
        {["failed", "cancelled", "expired"].includes(r.status) && <Button variant="primary" disabled={busy} onClick={() => void act(true)}>Retry</Button>}
      </div>
      <Trace steps={trace.steps} />
      <p className={s.small}>LifeOS stores the execution summary and tool calls only. Hidden reasoning is never stored or shown. Limits per run: 12 tool calls, 60k tokens, 120 s active.</p>
    </div>
  );
}

function AgentPanel({
  agent,
  state,
  ins,
  onRun,
  onDecided,
}: {
  agent: OverviewAgent;
  state: AgentState;
  ins: Inspector | null;
  onRun: (id: string) => void;
  onDecided: () => void;
}) {
  const { toast, openAI } = useShell();
  const { refresh } = useAgentStatus();
  const [busy, setBusy] = useState(false);
  const st = AGENT_STATES[state];
  const last = ins?.latest?.run ?? agent.stats?.last ?? null;
  const live = last && ["running", "waiting_approval", "failed", "queued"].includes(last.status) ? last : null;
  const nowText = agent.currentTask ?? (last ? (live ? last.prompt : `Last: ${last.prompt}`) : state === "offline" ? "Not connected" : "No runs yet");
  const lastStep = ins?.latest?.steps.at(-1);
  const stepText = state === "paused" ? "New runs are rejected until you resume" : lastStep ? `${lastStep.tool ?? lastStep.action} · ${ins?.latest?.steps.length ?? 0} steps` : last ? `${RUN_STATUS[last.status].label.slice(2)} ${last.endedAt ? clock(new Date(last.endedAt)) : ""}` : "";
  const pending = ins?.pending ?? null;
  const sum = pending ? summarize(pending) : null;

  const act = async (fn: () => Promise<{ ok: boolean }>, ok: string, fail = "Couldn't do that. Try again.") => {
    setBusy(true);
    const r = await fn().catch(() => ({ ok: false }));
    setBusy(false);
    toast(r.ok ? ok : fail, r.ok ? "success" : "error");
    if (r.ok) {
      void refresh();
      onDecided();
    }
  };

  return (
    <div className={s.panelIn}>
      <div className={s.who}>
        <PixelAvatar agent={agent.id} state={state} size={56} radius={6} />
        <div style={{ minWidth: 0 }}>
          <div className={s.name}>{agent.name}</div>
          <div className={s.stateLine} style={{ color: TONE[state] }}>
            {st.glyph} {st.label}
            {last?.startedAt ? ` · ${ago(last.startedAt)}` : ""}
            {ins ? ` · ${ins.model}` : ""}
          </div>
        </div>
      </div>
      <p className={s.purpose}>{agent.purpose}</p>
      <div className={s.block}>
        <div className={s.label}>NOW</div>
        <div className={s.now}>{nowText}</div>
        {stepText && <div className={s.step}>{stepText}</div>}
        {live && (
          <button type="button" className={s.linkBtn} onClick={() => onRun(live.id)}>
            Open live trace →
          </button>
        )}
      </div>

      {pending && sum && (
        <div className={s.proposal}>
          <div className={s.propLabel}>
            ! PROPOSED · {pending.tool} · {TIER_OF[pending.kind]}
          </div>
          <div className={s.propTitle}>{sum.title}</div>
          <div className={s.propTarget}>{sum.target}</div>
          {(sum.quote ?? sum.note) && <blockquote className={s.quote}>{sum.quote ?? sum.note}</blockquote>}
          <div className={s.row}>
            {!fullReviewOnly(pending.kind) && <Button variant="primary" size="lg" disabled={busy} onClick={() => void act(() => approveAction(pending.id), "Approved. The run resumes.", "Couldn't approve here. Review it in Approvals.")}>
              Approve
            </Button>}
            <ButtonLink href={approvalsHref(pending.id)} variant={fullReviewOnly(pending.kind) ? "primary" : undefined} size="lg">
              Review in Approvals
            </ButtonLink>
            <Button variant="ghost" size="lg" destructive disabled={busy} onClick={() => void act(() => rejectAction(pending.id), "Rejected. Nothing was sent.")}>
              Reject
            </Button>
          </div>
          <div className={s.monoSm}>Expires {stamp(pending.expiresAt, false)} · the run is suspended until you decide</div>
        </div>
      )}

      {state === "failed" && last?.status === "failed" && (
        <div className={s.fail}>
          <div className={s.failLabel}>× RUN FAILED{last.endedAt ? ` · ${clock(new Date(last.endedAt))}` : ""}</div>
          <div className={s.failText}>{last.error ?? "The run stopped unexpectedly."}</div>
          <div className={s.row}>
            <Button variant="primary" disabled={busy} onClick={() => void act(() => retryRunAction(last.id), "Retry started.", "Couldn't start another run. Try again.")}>
              Retry narrower
            </Button>
            <Button onClick={() => onRun(last.id)}>Open trace</Button>
          </div>
        </div>
      )}

      <div>
        <div className={s.runsHead}>
          <span>RECENT RUNS</span>
          <Link href="/agents?view=runs">ALL RUNS →</Link>
        </div>
        {(ins?.recent ?? []).map((r) => (
          <button key={r.id} type="button" className={s.runRow} onClick={() => onRun(r.id)}>
            <span className={s.ell}>{r.prompt}</span>
            <span className={s.monoSm} style={{ color: RUN_STATUS[r.status].color }}>
              {RUN_STATUS[r.status].label.split(" ").slice(1).join(" ")}
            </span>
            <span className={s.monoSm}>{runTook(r)}</span>
            <span className={`${s.monoSm} ${s.right}`}>{runWhen(r)}</span>
          </button>
        ))}
        {ins && ins.recent.length === 0 && <p className={s.small} style={{ marginTop: 10 }}>No runs in the last 24 hours.</p>}
      </div>

      {ins && (
        <details className={s.settings}>
          <summary>SETTINGS · MODEL AND TOOLS</summary>
          <div className={s.settingsBody}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className={s.small} style={{ color: "var(--ink-2)", fontSize: 13 }}>
                Model
              </span>
              {!ins.system && agent.id !== "orchestrator" ? (
                <>
                  <div role="radiogroup" aria-label="Model" className={s.views} style={{ alignSelf: "flex-start" }}>
                    {(ins.routable ? MODEL_OPTS : [[MODELS.haiku, "Haiku"] as const, ...MODEL_OPTS.filter(([v]) => v !== "auto" && v !== "free")]).map(([v, l]) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        disabled={busy}
                        aria-checked={ins.modelPref === v}
                        style={{ border: 0, borderLeft: v === "auto" ? 0 : "1px solid var(--border)", padding: "6px 11px", fontSize: 13, background: ins.modelPref === v ? "var(--wash)" : "transparent" }}
                        onClick={() => void act(() => setAgentModelAction(agent.id, v), `${agent.name} now uses ${l}.`)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <span className={s.small}>{ins.routable ? "Auto sends simple turns to the free model and reasoning to Sonnet, with one fallback. Private data never goes to a free model." : "Paid models only. Private data never goes to a free model."}</span>
                </>
              ) : (
                <span style={{ fontSize: 14 }}>
                  {ins.model}{" "}
                  <span className={s.small}>
                    · {agent.id === "orchestrator" ? "locked to Opus" : ins.system ? "system agent, runs your rules" : agent.id === "outreach" ? "not routable: mail never reaches a free model" : "paid model only"}
                  </span>
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className={s.small} style={{ color: "var(--ink-2)", fontSize: 13 }}>
                Tools
              </span>
              {ins.tools.map((t) => (
                <div key={t.name} className={s.toolRow}>
                  <span>
                    {t.name}
                    {t.state !== "connected" ? ` · ${t.reason ?? t.state}` : ""}
                  </span>
                  <span style={{ color: TIER_COLOR[t.tier] }}>{t.tier}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      <div className={s.foot}>
        {!ins?.system && (
          <button type="button" className={s.linkBtn} onClick={() => openAI()}>
            Chat with {agent.name}
          </button>
        )}
        {state !== "offline" && (
          <button
            type="button"
            className={s.underline}
            disabled={busy}
            onClick={() =>
              void act(
                () => (state === "paused" ? resumeAgentAction(agent.id) : pauseAgentAction(agent.id)),
                state === "paused" ? `${agent.name} resumed.` : `${agent.name} paused. Running work finishes first.`,
              )
            }
          >
            {state === "paused" ? "Resume" : "Pause"}
          </button>
        )}
      </div>
    </div>
  );
}

function Office({
  agents,
  states,
  sel,
  onSelect,
  size,
  reduced,
}: {
  agents: OverviewAgent[];
  states: Map<string, AgentState>;
  sel: string;
  onSelect: (id: string) => void;
  size: { w: number; h: number; mobile: boolean };
  reduced: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const L = useMemo(() => layout({ count: agents.length }), [agents.length]);
  const scale = size.mobile ? 2 : size.w >= 1140 && size.h >= 820 ? 3 : 2;
  const cw = L.w * scale;
  const ch = L.h * scale;
  const fits = cw <= size.w;
  const cx = size.mobile || !fits ? 0 : Math.round((size.w - cw) / 2);
  const cy = size.mobile ? 0 : Math.max(64, Math.round((size.h - ch) / 2) + 24);
  const scroll = size.mobile || !fits;

  const opts = useRef<(OfficeOptions & { sig: string }) | null>(null);
  const officeAgents = agents.map((a) => ({ id: a.id, look: LOOKS[a.id] ?? LOOKS.orchestrator!, state: states.get(a.id) ?? "idle" }));
  const next = {
    cfg: { count: agents.length },
    palette: "day" as const,
    agents: officeAgents,
    selected: sel,
    hover,
    reduced,
    sig: `${officeAgents.map((a) => a.state).join(",")}|${sel}|${hover}|${reduced}`,
  };
  useEffect(() => {
    opts.current = next;
  });
  useEffect(() => {
    if (!canvas.current) return;
    return mountOffice(canvas.current, () => opts.current);
  }, []);

  // Keep the selected desk in view when the scene scrolls (mobile / narrow).
  useEffect(() => {
    const el = scene.current;
    const k = agents.findIndex((a) => a.id === sel);
    const st = L.stations[k];
    if (!el || !scroll || !st) return;
    el.scrollLeft = Math.max(0, cx + st.fx * scale - el.clientWidth / 2);
  }, [sel, scroll, L, agents, cx, scale]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = agents.findIndex((a) => a.id === sel);
    let n: string | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = agents[(i + 1) % agents.length]?.id;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = agents[(i - 1 + agents.length) % agents.length]?.id;
    if (!n) return;
    e.preventDefault();
    onSelect(n);
    document.querySelector<HTMLButtonElement>(`[data-agent-spot="${n}"]`)?.focus();
  };

  return (
    <div ref={scene} className={[s.scene, scroll && s.scroll].filter(Boolean).join(" ")} onKeyDown={onKey}>
      <div className={s.stage} style={{ width: scroll ? cw + 24 : size.w, height: size.mobile ? ch : Math.max(size.h, cy + ch + 56) }}>
        <canvas ref={canvas} aria-hidden="true" className={s.canvas} style={{ left: cx, top: cy, width: cw, height: ch }} />
        {agents.map((a, k) => {
          const st = L.stations[k];
          if (!st) return null;
          const state = states.get(a.id) ?? "idle";
          const info = AGENT_STATES[state];
          const selected = a.id === sel;
          const showTag = selected || hover === a.id || state === "approval" || state === "failed";
          return (
            <button
              key={a.id}
              type="button"
              data-agent-spot={a.id}
              aria-pressed={selected}
              aria-label={`${a.name}, ${info.label}.${a.currentTask ? ` ${a.currentTask}` : ""}`}
              tabIndex={selected || (!agents.some((a) => a.id === sel) && k === 0) ? 0 : -1}
              className={s.spot}
              style={{ left: Math.round(cx + (st.fx - 9) * scale), top: Math.round(cy + (st.fy - 30) * scale), width: 18 * scale, height: 26 * scale }}
              onClick={() => onSelect(a.id)}
              onFocus={() => onSelect(a.id)}
              onMouseEnter={() => setHover(a.id)}
              onMouseLeave={() => setHover(null)}
            >
              {showTag && (
                <span className={[s.tag, selected && s.selected].filter(Boolean).join(" ")}>
                  {a.name} · {info.short}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AgentsViewScreen({
  view,
  agents,
  runs,
  table,
  spend,
  globalPaused,
  initialSel,
  initialInspector,
  initialTrace,
  approvals,
  write,
}: {
  view: AgentsView;
  agents: OverviewAgent[];
  runs: RunDTO[];
  table: { id: string; runs24: number; cost24: number }[];
  spend: { mtdUsd: number; capUsd: number };
  globalPaused: boolean;
  initialSel: string;
  initialInspector: Inspector | null;
  initialTrace: RunTrace | null;
  approvals: { pending: ApprovalDTO[]; resolved: ApprovalDTO[]; selected: ApprovalDTO | null; missingId: boolean };
  write: WriteFacts;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const approvalN = useApprovalCount();
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800, mobile: false });
  const search = useSearchParams();
  const requestedAgent = view === "approvals" ? null : search.get("id");
  const requestedRun = search.get("run");
  const sel = agents.some((a) => a.id === requestedAgent) ? requestedAgent! : initialSel;
  const [inspectors, setInspectors] = useState<Record<string, Inspector>>(initialInspector ? { [initialInspector.id]: initialInspector } : {});
  const [loadedTrace, setTrace] = useState<RunTrace | null>(initialTrace);
  const trace = loadedTrace?.run.id === requestedRun ? loadedTrace : null;
  const [runFilter, setRunFilter] = useState("all");
  const [confirmPause, setConfirmPause] = useState(false);

  const pendingAgents = new Set(approvals.pending.map((a) => a.agentId));
  const states = new Map(agents.map((a) => [a.id, officeState(a.status, a.live, pendingAgents.has(a.id))]));
  const office = agents.filter((a) => a.live);
  const count = (k: AgentState) => [...states.values()].filter((v) => v === k).length;
  const selAgent = agents.find((a) => a.id === sel) ?? agents[0]!;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const mobile = window.innerWidth < 720;
      const panel = mobile ? 0 : window.innerWidth < 1100 ? 380 : 440;
      setSize({ w: Math.max(320, Math.round(e!.contentRect.width) - (view === "approvals" ? 0 : panel)), h: Math.round(e!.contentRect.height), mobile });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const loadInspector = useCallback(async (id: string) => {
    const ins = await agentInspectorAction(id);
    if (ins) setInspectors((m) => ({ ...m, [id]: ins }));
  }, []);

  const url = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    window.history.replaceState(null, "", `/agents?${q.toString()}`);
  };

  const select = (id: string) => {
    if (id === sel && !trace) return;
    setTrace(null);
    url({ id, run: null });
    if (!inspectors[id]) void loadInspector(id);
  };
  const openRun = (id: string) => url({ run: id });

  useEffect(() => {
    let active = true;
    void agentInspectorAction(sel).then((ins) => {
      if (active && ins) setInspectors((m) => ({ ...m, [sel]: ins }));
    });
    return () => { active = false; };
  }, [sel]);

  useEffect(() => {
    if (!requestedRun) return;
    let active = true;
    void runTraceAction(requestedRun).then((t) => {
      if (!active) return;
      setTrace(t);
      if (!t) toast("That run isn't available.", "error");
    });
    return () => { active = false; };
  }, [requestedRun, toast]);

  // Live: refresh the server data and the open inspector when runs or approvals change.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const later = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      router.refresh();
      void loadInspector(sel);
      if (requestedRun) void runTraceAction(requestedRun).then((t) => setTrace((current) => current?.run.id === requestedRun ? t : current));
    }, 600);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLiveEvents("run", later);
  useLiveEvents("approval", later);

  const pauseAll = async () => {
    setConfirmPause(false);
    const r = await (globalPaused ? resumeAllAction() : pauseAllAction()).catch(() => ({ ok: false }));
    toast(r.ok ? (globalPaused ? "Agents resumed." : "All agents paused. Running work finishes; new runs are rejected.") : "Couldn't change that. Try again.", r.ok ? "success" : "error");
    if (r.ok) router.refresh();
  };

  const views: { v: AgentsView; label: string; badge?: ReactNode }[] = [
    { v: "office", label: "Office" },
    { v: "approvals", label: "Approvals", badge: <CountBadge n={approvalN} label={`${approvalN} waiting`} /> },
    { v: "table", label: "Table" },
    { v: "runs", label: "Runs" },
  ];
  const groupOf = (r: RunDTO) => RUN_STATUS[r.status].group;
  const runCounts = (g: string) => runs.filter((r) => g === "all" || groupOf(r) === g).length;
  const shownRuns = runs.filter((r) => runFilter === "all" || groupOf(r) === runFilter);
  const tableRow = new Map(table.map((t) => [t.id, t]));
  const sorted = [...agents].sort((a, b) => STATE_RANK[states.get(a.id)!] - STATE_RANK[states.get(b.id)!]);

  return (
    <div ref={root} className={s.root} data-view={view} data-screen-label="Agents" style={view === "office" ? { background: PAL.day.bg } : undefined}>
      <div className={s.bar}>
        <div className={s.titleRow}>
          <h1 className={s.h1}>Agents</h1>
          <span className={s.status}>
            <Link href="/agents?view=approvals" className={s.needYou}>
              {approvalN} need you
            </Link>{" "}
            · {count("working")} working · {count("failed")} failed · {count("paused")} paused ·{" "}
            <span className={s.spend}>
              US${spend.mtdUsd.toFixed(2)} of US${spend.capUsd}
            </span>
            {globalPaused && <span style={{ color: "var(--status-failed)" }}> · all paused</span>}
          </span>
        </div>
        <div className={s.barActions}>
          <nav aria-label="View" className={s.views}>
            {views.map((x) => (
              <Link key={x.v} href={`/agents?view=${x.v}`} aria-current={view === x.v ? "page" : undefined} scroll={false}>
                {x.label}
                {x.badge}
              </Link>
            ))}
          </nav>
          <button type="button" className={s.motion} aria-pressed={reduced} onClick={() => setMotion(reduced)}>
            {reduced ? "Motion off" : "Motion on"}
          </button>
          <button type="button" className={s.pauseAll} onClick={() => setConfirmPause(true)}>
            {globalPaused ? "Resume all" : "Pause all"}
          </button>
        </div>
      </div>

      {view === "office" && (
        <>
          <Office agents={office} states={states} sel={sel} onSelect={select} size={size} reduced={reduced} />
          <div className={s.legend} aria-hidden="true">
            <span>… working</span>
            <span>! needs you</span>
            <span>× failed</span>
            <span>II paused</span>
            <span>– idle</span>
            <span>← → move · ↵ select</span>
            {agents.some((a) => !a.live) && <span>Not in the office: {agents.filter((a) => !a.live).map((a) => a.name).join(", ")} (not connected)</span>}
          </div>
        </>
      )}

      {view === "approvals" && (
        <div className={`${s.pane} ${s.flush}`}>
          <ApprovalsInbox
            initialPending={approvals.pending}
            initialResolved={approvals.resolved}
            initialSelected={approvals.selected}
            missingId={approvals.missingId}
            write={write}
          />
        </div>
      )}

      {view === "table" && (
        <div className={s.pane}>
          <div role="grid" aria-label="All agents" className={s.table}>
            <div role="row" className={`${s.thead} ${s.agentCols}`}>
              <span role="columnheader" />
              <span role="columnheader">AGENT</span>
              <span role="columnheader">STATE</span>
              <span role="columnheader">CURRENT / LAST</span>
              <span role="columnheader">MODEL</span>
              <span role="columnheader">RUNS</span>
              <span role="columnheader">COST</span>
              <span role="columnheader" className={s.right}>
                TIME
              </span>
            </div>
            {sorted.map((a) => {
              const state = states.get(a.id)!;
              const info = AGENT_STATES[state];
              const t = tableRow.get(a.id);
              const last = a.stats?.last;
              return (
                <button key={a.id} type="button" role="row" aria-selected={a.id === sel} className={`${s.trow} ${s.agentCols}`} onClick={() => select(a.id)}>
                  <span role="gridcell">
                    <PixelAvatar agent={a.id} state={state} size={28} />
                  </span>
                  <span role="gridcell" style={{ fontWeight: 600 }}>
                    {a.name}
                  </span>
                  <span role="gridcell" className={s.monoSm} style={{ color: TONE[state] }}>
                    {info.glyph} {info.label}
                  </span>
                  <span role="gridcell" className={s.ell} style={{ color: "var(--ink-2)" }}>
                    {a.currentTask ?? last?.prompt ?? (a.live ? "No runs yet" : "Not connected")}
                  </span>
                  <span role="gridcell" style={{ fontSize: 13, color: "var(--ink-2)" }}>
                    {a.id === "automations" ? "No model" : last ? modelShort(last.model) : "—"}
                  </span>
                  <span role="gridcell" className={s.mono}>
                    {t?.runs24 ?? 0}
                  </span>
                  <span role="gridcell" className={s.mono}>
                    {t ? formatUsd(t.cost24).replace("US", "") : "—"}
                  </span>
                  <span role="gridcell" className={`${s.monoSm} ${s.right}`}>
                    {last?.startedAt ? ago(last.startedAt) : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view === "runs" && (
        <div className={s.pane}>
          <div className={s.filters} role="group" aria-label="Filter runs">
            {[
              ["all", "All"],
              ["running", "Running"],
              ["waiting_approval", "Waiting approval"],
              ["failed", "Failed"],
              ["succeeded", "Succeeded"],
            ].map(([k, l]) => (
              <button key={k} type="button" className={s.filter} aria-pressed={runFilter === k} onClick={() => setRunFilter(k!)}>
                {l} <span className={s.filterN}>{runCounts(k!)}</span>
              </button>
            ))}
          </div>
          <div role="grid" aria-label="Runs" className={s.table}>
            <div role="row" className={`${s.thead} ${s.runCols}`}>
              <span role="columnheader">TIME</span>
              <span role="columnheader">AGENT</span>
              <span role="columnheader">SUMMARY</span>
              <span role="columnheader">STATUS</span>
              <span role="columnheader">ROUTE</span>
              <span role="columnheader">TOOLS</span>
              <span role="columnheader" className={s.right}>
                TOOK
              </span>
            </div>
            {shownRuns.map((r) => (
              <button key={r.id} type="button" role="row" aria-selected={trace?.run.id === r.id} className={`${s.trow} ${s.runCols}`} onClick={() => void openRun(r.id)}>
                <span role="gridcell" className={s.monoSm}>
                  {runWhen(r)}
                </span>
                <span role="gridcell" style={{ fontWeight: 600 }}>
                  {agents.find((a) => a.id === r.agentId)?.name ?? r.agentId}
                </span>
                <span role="gridcell" className={s.ell}>
                  {r.prompt}
                </span>
                <span role="gridcell" className={s.monoSm} style={{ color: RUN_STATUS[r.status].color }}>
                  {RUN_STATUS[r.status].label}
                </span>
                <span role="gridcell" className={s.route}>
                  {runRoute(r)}
                </span>
                <span role="gridcell" className={s.monoSm} style={{ color: "var(--ink)" }}>
                  {r.toolCalls}
                </span>
                <span role="gridcell" className={`${s.monoSm} ${s.right}`}>
                  {runTook(r)}
                </span>
              </button>
            ))}
            {shownRuns.length === 0 && <p className={s.tableEmpty}>No runs in the last 24 hours{runFilter !== "all" ? " with this status" : ""}.</p>}
          </div>
        </div>
      )}

      <aside aria-label={trace ? "Run detail" : "Selected agent"} className={s.panel}>
        {trace ? (
          <RunPanel key={trace.run.id} trace={trace} back={selAgent.name} onBack={() => (setTrace(null), url({ run: null }))} onRun={openRun} onChange={later} />
        ) : (
          <AgentPanel agent={selAgent} state={states.get(selAgent.id) ?? "idle"} ins={inspectors[selAgent.id] ?? null} onRun={(id) => void openRun(id)} onDecided={() => { router.refresh(); void loadInspector(selAgent.id); }} />
        )}
      </aside>

      <ConfirmDialog
        open={confirmPause}
        onClose={() => setConfirmPause(false)}
        onConfirm={() => void pauseAll()}
        title={globalPaused ? "Resume all agents?" : "Pause all agents?"}
        body={globalPaused ? "New runs start again. Automations resume on their next tick." : "Running work finishes; new runs are rejected until you resume. Automations stop too."}
        confirmLabel={globalPaused ? "Resume all" : "Pause all"}
        danger={!globalPaused}
      />
    </div>
  );
}
