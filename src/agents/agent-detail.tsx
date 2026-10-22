"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MODEL_LABELS, MODELS } from "@/server/agents/registry";
import { pauseAgentAction, resumeAgentAction, setAgentModelAction } from "@/server/agent-actions";
import type { agentDetail } from "@/server/agents/queries";
import { formatDuration } from "@/lib/format";
import { useLiveEvents } from "@/features/shell/live-provider";
import { useShell } from "@/features/shell/shell-provider";
import { Badge } from "@/legacy-ui/badge";
import { Button } from "@/legacy-ui/button";
import { EmptyState } from "@/legacy-ui/empty-state";
import { Icon } from "@/legacy-ui/icon";
import type { IconName } from "@/legacy-ui/icon-names";
import { Select } from "@/legacy-ui/field";
import { SectionHeader } from "@/legacy-ui/section-header";
import { StatusDot } from "@/legacy-ui/status-dot";
import { DOT } from "./agent-card";
import { ExecutionTrace } from "./execution-trace";
import { RunsTable, shortId } from "./runs-table";

type Detail = NonNullable<Awaited<ReturnType<typeof agentDetail>>>;
/** the page strips tools and systemPrompt from the registry entry before it reaches the browser */
export type AgentDetailProps = Omit<Detail, "agent"> & { agent: Omit<Detail["agent"], "tools" | "systemPrompt"> };

const PERM: Record<string, { label: string; tone: "neutral" | "blue" | "amber" | "red" }> = {
  READ: { label: "READ", tone: "neutral" },
  PREPARE: { label: "PREPARE", tone: "blue" },
  APPROVE: { label: "ASK FIRST", tone: "amber" },
  EXECUTE: { label: "ASK FIRST", tone: "amber" },
  HIGH_RISK: { label: "NEVER", tone: "red" },
};

const Card = ({ label, children }: { label: string; children: ReactNode }) => (
  <section aria-label={label} className="glass-card flex flex-col gap-3 rounded-24 p-4">
    <h2 className="text-[11px] font-medium tracking-[.12em] text-text-3">{label}</h2>
    {children}
  </section>
);

const Value = ({ k, v }: { k: string; v: string }) => (
  <div>
    <div className="text-[11px] text-text-3">{k}</div>
    <div className="text-[15px] font-medium">{v}</div>
  </div>
);

const TOOL_TONE = { connected: "text-green", "not connected": "text-red", unavailable: "text-red" } as const;

export function AgentDetail(d: AgentDetailProps) {
  const { agent, config, tools, permissions, latestRun, queue, recentRuns, health } = d;
  const router = useRouter();
  const { toast } = useShell();
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState(config.model);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLiveEvents("run", (dto) => {
    if (dto && dto.agentId !== agent.id) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 500);
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  const run = latestRun?.run ?? null;
  const active = run?.status === "running" || run?.status === "waiting_approval";
  const status = !agent.live
    ? "NOT CONNECTED"
    : config.paused
      ? "PAUSED"
      : active
        ? "WORKING"
        : run?.status === "failed"
          ? "ATTENTION"
          : agent.id === "orchestrator"
            ? "ONLINE"
            : "READY";
  const tone = status === "WORKING" ? "indigo" : status === "ATTENTION" ? "red" : status === "PAUSED" ? "amber" : status === "NOT CONNECTED" ? "neutral" : "green";

  const toggle = async () => {
    setBusy(true);
    const res = await (config.paused ? resumeAgentAction(agent.id) : pauseAgentAction(agent.id));
    setBusy(false);
    if (!res.ok) return toast("Couldn't save that. Try again.", "error");
    toast(config.paused ? "Runs resumed." : "Runs paused. Running work will finish.");
    router.refresh();
  };
  const changeModel = async (next: string) => {
    const prev = model;
    setModel(next);
    const res = await setAgentModelAction(agent.id, next);
    if (!res.ok) {
      setModel(prev);
      return toast("Couldn't save that. Try again.", "error");
    }
    toast(`Model changed to ${{ auto: "Auto", free: "Free only" }[next] ?? MODEL_LABELS[next] ?? next}`);
    router.refresh();
  };

  const steps = latestRun?.steps ?? [];
  const doneSteps = steps.filter((s) => s.state === "done").length;
  const needsReconnect = tools.some((t) => t.state === "not connected");

  const permissionsCard = (
    <Card label="PERMISSIONS">
      {permissions.length === 0 ? (
        <p className="text-[13px] text-text-3">None yet.</p>
      ) : (
        permissions.map((p) => (
          <div key={p.tier} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-mono text-[11.5px] text-text-2">{p.tools.join(", ")}</span>
            <Badge kind="tag" tone={(PERM[p.tier] ?? PERM.READ!).tone}>
              {(PERM[p.tier] ?? PERM.READ!).label}
            </Badge>
          </div>
        ))
      )}
    </Card>
  );
  const capabilitiesCard = (
    <Card label="CAPABILITIES">
      {tools.length === 0 ? (
        <p className="text-[13px] text-text-3">None yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tools.map((t) => (
            <Badge key={t.name} kind="tag" tone="neutral">
              {t.name.replace("github.", "").replaceAll("_", " ")}
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-8">
      <Link href="/agents" className="inline-flex items-center gap-1.5 text-[13px] text-text-2 hover:text-text">
        <Icon name="arrow_back" size={16} />
        Agent command
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-16 bg-white/[.06]" style={{ color: agent.color }}>
            <Icon name={agent.icon as IconName} size={28} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[22px] leading-[1.2] font-semibold tracking-[.1em] uppercase">{agent.name}</h1>
              <Badge kind="status" tone={tone}>
                <span className="inline-flex items-center gap-1.5">
                  <StatusDot state={DOT[status]} pulse={status === "WORKING"} />
                  {status}
                </span>
              </Badge>
            </div>
            <p className="mt-2 max-w-[640px] text-[15px] text-text-2">{agent.purpose}</p>
          </div>
        </div>
        {agent.live && (
          <Button variant="secondary" loading={busy} onClick={toggle}>
            <Icon name={config.paused ? "play_circle" : "pause_circle"} size={16} />
            {config.paused ? "Resume" : "Pause"}
          </Button>
        )}
      </header>

      {!agent.live ? (
        <>
          <EmptyState
            icon="memory"
            title={`${agent.name} isn't connected yet.`}
            body={`${agent.purpose} ${agent.arrival ? `It arrives in ${agent.arrival}.` : "It is planned."} Until then it has no runs, cost or activity.`}
          />
          <div className="grid gap-4 min-[720px]:grid-cols-2">
            {permissionsCard}
            {capabilitiesCard}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-6">
          <div className="flex min-w-0 flex-[1.6_1_560px] flex-col gap-6">
            {run && (
              <Card label={active ? "CURRENT TASK" : "LAST RUN"}>
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-text-3">
                  <Link href={`/agents/runs/${run.id}`} className="hover:text-text">
                    {shortId(run.id)}
                  </Link>
                  <span>{active ? "RUNNING" : steps.length > 0 ? `${doneSteps} of ${steps.length} steps` : run.status.toUpperCase()}</span>
                </div>
                <p className="text-[15px]">{run.prompt}</p>
                {steps.length > 0 && <ExecutionTrace steps={steps} size="timeline" runHref={`/agents/runs/${run.id}`} />}
              </Card>
            )}
            <section aria-labelledby="queue-h">
              <SectionHeader id="queue-h" label="QUEUE" meta={`${queue.length} WAITING`} />
              {queue.length === 0 ? (
                <p className="text-[13px] text-text-3">Queue is empty. This agent picks up work when the orchestrator delegates to it.</p>
              ) : (
                <ol className="m-0 flex list-none flex-col gap-1 p-0">
                  {queue.map((q, i) => (
                    <li key={q.id} className="flex gap-3 text-[13px]">
                      <span className="font-mono text-text-3">{String(i + 1).padStart(2, "0")}</span>
                      <span className="truncate">{q.prompt}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section aria-labelledby="recent-h">
              <SectionHeader id="recent-h" label="RECENT RUNS" meta="LAST 24 HOURS" />
              <RunsTable runs={recentRuns} compact />
            </section>
          </div>

          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
            {run?.status === "failed" && (
              <section aria-label="Error" className="flex flex-col gap-2 glass-card rounded-24 !border-[rgba(255,105,97,.35)] p-4">
                <div className="text-[11px] tracking-[.12em] text-red">LAST RUN FAILED</div>
                <p className="text-[13px] text-text-2">{run.error ?? "The run stopped before it finished."}</p>
                <div className="flex gap-3 text-[12.5px]">
                  <Link href={`/agents/runs/${run.id}`} className="text-cyan hover:text-cyan-soft">
                    View run
                  </Link>
                  {needsReconnect && (
                    <Link href="/settings?section=connections" className="text-cyan hover:text-cyan-soft">
                      Reconnect
                    </Link>
                  )}
                </div>
              </section>
            )}
            <Card label="HEALTH">
              <div className="grid grid-cols-3 gap-2">
                <Value k="SUCCESS" v={health.success === null ? "—" : `${health.success}%`} />
                <Value k="RUNS · 7D" v={String(health.runs7d)} />
                <Value k="AVG RUN" v={health.avgRunMs === null ? "—" : formatDuration(health.avgRunMs)} />
              </div>
            </Card>
            {capabilitiesCard}
            {permissionsCard}
            <Card label="TOOLS">
              {tools.map((t) => (
                <div key={t.name} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[12px]">{t.name}</span>
                  <span className={`text-right text-[12px] ${TOOL_TONE[t.state]}`}>{t.reason ? `${t.state} · ${t.reason}` : t.state}</span>
                </div>
              ))}
            </Card>
            <Card label="CONFIGURATION">
              <label className="flex flex-col gap-1.5 text-[12.5px] text-text-2">
                Model
                <Select value={model} disabled={agent.id === "orchestrator"} onChange={(e) => void changeModel(e.target.value)}>
                  {agent.id === "orchestrator" ? (
                    <option value={MODELS.opus}>Claude Opus 5.5 (always)</option>
                  ) : config.routable ? (
                    <>
                      <option value="auto" disabled={!config.freeAvailable}>Auto (free when simple)</option>
                      <option value="free" disabled={!config.freeAvailable}>Free only</option>
                      <option value={MODELS.sonnet}>Claude Sonnet 5.5</option>
                      <option value={MODELS.opus}>Claude Opus 5.5</option>
                      {![ "auto", "free", MODELS.sonnet, MODELS.opus ].includes(model) && <option value={model}>{MODEL_LABELS[model] ?? model}</option>}
                    </>
                  ) : (
                    Object.values(MODELS).map((m) => (
                      <option key={m} value={m}>
                        {MODEL_LABELS[m]}
                        {m === config.defaultModel ? " (default)" : ""}
                      </option>
                    ))
                  )}
                </Select>
                {config.routable && !config.freeAvailable && (
                  <span className="text-[12px] text-text-3">Add an OpenRouter key in Settings → Connections to use free models.</span>
                )}
              </label>
              <dl className="m-0 flex flex-col gap-1 font-mono text-[12px] text-text-2">
                <div className="flex justify-between"><dt>Max tool calls</dt><dd className="m-0">{config.limits.toolCalls}</dd></div>
                <div className="flex justify-between"><dt>Max tokens</dt><dd className="m-0">{config.limits.tokens / 1000}k</dd></div>
                <div className="flex justify-between"><dt>Max wall time</dt><dd className="m-0">{config.limits.activeMs / 1000}s</dd></div>
              </dl>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
