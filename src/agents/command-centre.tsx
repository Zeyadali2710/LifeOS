"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { RunDTO } from "@/lib/agent-types";
import { formatDuration } from "@/lib/format";
import { pauseAllAction, resumeAllAction } from "@/server/agent-actions";
import type { agentsOverview } from "@/server/agents/queries";
import { useLiveEvents } from "@/shell/live-provider";
import { useShell } from "@/shell/shell-provider";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";
import { Progress } from "@/ui/progress";
import { SectionHeader } from "@/ui/section-header";
import { AgentCard } from "./agent-card";
import { RunsTable } from "./runs-table";

export type AgentsOverview = Awaited<ReturnType<typeof agentsOverview>>;

const Stat = ({ k, v, sub }: { k: string; v: string; sub?: string }) => (
  <div>
    <div className="text-[11px] text-text-3">{k}</div>
    <div className="font-display text-[29px] leading-none">{v}</div>
    {sub && <div className="font-mono text-[11px] text-text-3">{sub}</div>}
  </div>
);

export function CommandCentre({
  overview: o,
  runs,
  hasMore,
  approvalsWaiting,
  monthLabel,
}: {
  overview: AgentsOverview;
  runs: RunDTO[];
  hasMore: boolean;
  approvalsWaiting: number;
  monthLabel: string;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLiveEvents("run", () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 500);
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  const orch = o.agents.find((a) => a.id === "orchestrator")!;
  const { spend } = o;
  const reached = spend.mtdUsd >= spend.capUsd;
  const toggle = async () => {
    setBusy(true);
    const res = await (o.globalPaused ? resumeAllAction() : pauseAllAction());
    setBusy(false);
    if (!res.ok) return toast("Couldn't save that. Try again.", "error");
    toast(o.globalPaused ? "Runs resumed." : "Runs paused. Running work will finish.");
    router.refresh();
  };
  const meta = [
    `${o.orchestrator.runsToday} runs today`,
    o.orchestrator.medianFirstToolMs === null ? null : `median ${formatDuration(o.orchestrator.medianFirstToolMs)} to first tool call`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 text-[11px] font-medium tracking-[.12em] text-cyan">AGENT COMMAND</div>
          <h1 className="font-display text-[clamp(28px,3vw,40px)] leading-[1.1] font-medium tracking-[-0.025em]">Your autonomous workforce.</h1>
          <p className="mt-3 max-w-[640px] text-[15px] leading-normal text-text-2">
            {o.agents.length} agents · {o.totals.running} running · {o.totals.attention} need attention · nothing sends without your approval.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {approvalsWaiting > 0 && (
            <Link href="/approvals" className="inline-flex h-[34px] items-center gap-2 rounded-full border border-[rgba(255,159,10,.35)] bg-[rgba(255,159,10,.08)] px-3.5 text-[13px] text-amber">
              <Icon name="verified_user" size={16} />
              {approvalsWaiting} approvals waiting
            </Link>
          )}
          <Button variant="secondary" loading={busy} onClick={toggle}>
            <Icon name={o.globalPaused ? "play_circle" : "pause_circle"} size={16} />
            {o.globalPaused ? "Resume runs" : "Pause all runs"}
          </Button>
        </div>
      </header>

      <section aria-label="Orchestrator" className="relative flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-16 border border-[rgba(10,132,255,.25)] bg-white/[.06] p-[22px]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_200px_at_20%_0%,rgba(10,132,255,.14),transparent_70%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:linear-gradient(90deg,#000,transparent_70%)]" />
        <Link href="/agents/orchestrator" className="relative flex min-w-0 flex-1 basis-[320px] items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-14 bg-white/[.06]">
            <span aria-hidden="true" className="size-4 rotate-45 rounded-[3px] bg-accent animate-[lo-pulse_2.4s_ease-out_infinite]" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2.5">
              <span className="text-[13px] font-semibold tracking-[.14em]">ORCHESTRATOR</span>
              <Badge kind="status" tone={orch.status === "WORKING" ? "indigo" : orch.status === "PAUSED" ? "amber" : "green"}>
                {orch.status}
              </Badge>
            </span>
            <span className="mt-1 block truncate text-[15px]">{orch.currentTask ?? "Waiting for your next request."}</span>
            <span className="block font-mono text-[11px] text-text-3">{meta}</span>
          </span>
        </Link>
        <div aria-hidden="true" className="absolute top-1/2 right-[44%] hidden h-px w-10 bg-[rgba(10,132,255,.4)] min-[1100px]:block" />
        <div className="relative flex gap-7">
          <Stat k="ACTIVE" v={String(o.orchestrator.active)} />
          <Stat k="QUEUED" v={String(o.orchestrator.queued)} />
          <Stat k="RUNS TODAY" v={String(o.orchestrator.runsToday)} />
          <Stat k="SPEND MTD" v={`US$${spend.mtdUsd.toFixed(2)}`} sub={`of US$${spend.capUsd} cap`} />
        </div>
      </section>

      <section aria-label="Spend" className="glass-card rounded-22 px-[18px] py-4">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] tracking-[.1em] text-text-3">MONTH TO DATE · {monthLabel.toUpperCase()} · SYDNEY</span>
          <span className="font-mono text-[12px] font-medium">
            US${spend.mtdUsd.toFixed(2)} of US${spend.capUsd.toFixed(2)}
          </span>
          <Link href="/settings?section=ai" className="text-[12.5px] text-text-2 hover:text-text">
            Change cap →
          </Link>
        </div>
        <p className="mb-2 font-mono text-[11.5px] text-text-3">
          {o.routing.free} free · {o.routing.paid} paid runs this month
        </p>
        <Progress value={spend.mtdUsd} max={spend.capUsd} label="Month-to-date AI spend" />
        <p aria-live="polite" className={`text-[12.5px] ${reached ? "mt-2 text-red" : "sr-only"}`}>
          {reached ? "Cap reached. New runs are blocked until the cap is raised or the month rolls over." : ""}
        </p>
      </section>

      <div aria-hidden="true" className="mx-auto h-6 w-px bg-white/[.09]" />

      <section aria-label="Agents" className="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))] gap-3">
        {o.agents.map((a) => (
          <AgentCard key={a.id} a={a} />
        ))}
      </section>

      <section aria-labelledby="runs-h">
        <SectionHeader id="runs-h" label="RECENT RUNS" meta="ALL AGENTS · LAST 24 HOURS" />
        <RunsTable runs={runs} onMore={hasMore ? () => router.push(`/agents?limit=${runs.length + 20}`, { scroll: false }) : undefined} />
      </section>
    </div>
  );
}
