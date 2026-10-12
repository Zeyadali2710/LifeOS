"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDuration, formatTokens, formatUsd } from "@/lib/format";
import { cancelRunAction, retryRunAction } from "@/server/agent-actions";
import type { runDetail } from "@/server/agents/queries";
import { modelLabel, RUN_LIMITS } from "@/server/agents/registry";
import { formatHM } from "@/server/time";
import { useLiveEvents } from "@/shell/live-provider";
import { useShell } from "@/shell/shell-provider";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Disclosure } from "@/ui/disclosure";
import { Icon } from "@/ui/icon";
import { SectionHeader } from "@/ui/section-header";
import { ExecutionTrace } from "./execution-trace";
import { Result, shortId } from "./runs-table";

type Detail = NonNullable<Awaited<ReturnType<typeof runDetail>>>;
/** the page blanks tools and systemPrompt on the registry entry before it reaches the browser */
export type RunDetailProps = Detail;

const TIER_TONE = { READ: "neutral", PREPARE: "blue", APPROVE: "amber", EXECUTE: "amber", HIGH_RISK: "red" } as const;

const pretty = (v: unknown) => JSON.stringify(v ?? null, null, 2) ?? "null";

function Block({ label, value }: { label: string; value: unknown }) {
  const text = pretty(value);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-text-3">
        {label}
        <button
          type="button"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => void navigator.clipboard.writeText(text)}
          className="grid size-11 place-items-center text-text-3 hover:text-text md:size-6"
        >
          <Icon name="content_copy" size={14} />
        </button>
      </div>
      <pre className="max-h-[280px] overflow-auto rounded-14 border border-white/[.08] bg-white/[.03] px-3 py-2.5 font-code text-[11.5px] break-words whitespace-pre-wrap text-text-2">{text}</pre>
    </div>
  );
}

const Fact = ({ k, v }: { k: string; v: string }) => (
  <div>
    <div className="text-[11px] text-text-3">{k}</div>
    <div className="font-mono text-[13px]">{v}</div>
  </div>
);

export function RunDetail({ run, agent, steps, toolCalls }: RunDetailProps) {
  const router = useRouter();
  const { toast } = useShell();
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLiveEvents("run", (dto) => {
    if (dto && dto.id !== run.id) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 500);
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  const cancellable = run.status === "running" || run.status === "waiting_approval" || run.status === "queued";
  const retryable = run.status === "failed" || run.status === "cancelled" || run.status === "expired";
  const act = async (fn: () => Promise<{ ok: boolean; runId?: string }>, done: string, onOk?: (id?: string) => void) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return toast("Couldn't save that. Try again.", "error");
    toast(done);
    if (onOk) onOk(res.runId);
    else router.refresh();
  };
  const active = run.durationMs === null ? 0 : Math.round(run.durationMs / 1000);

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-8">
      <Link href={`/agents/${run.agentId}`} className="inline-flex items-center gap-1.5 text-[13px] text-text-2 hover:text-text">
        <Icon name="arrow_back" size={16} />
        {agent?.name ?? run.agentId}
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] tracking-[0.1em] text-text-3">
            <span>{shortId(run.id)}</span>
            <span>{(agent?.name ?? run.agentId).toUpperCase()}</span>
            <Result status={run.status} />
          </div>
          <h1 className="mt-2 max-w-[760px] text-[15px] leading-[1.4] font-medium break-words">{run.prompt}</h1>
          <div className="mt-2 flex flex-wrap gap-4 text-[12.5px]">
            {run.retryOf && (
              <Link href={`/agents/runs/${run.retryOf}`} className="text-cyan hover:text-cyan-soft">
                Retry of {shortId(run.retryOf)}
              </Link>
            )}
            {run.parentRunId && (
              <Link href={`/agents/runs/${run.parentRunId}`} className="text-cyan hover:text-cyan-soft">
                Delegated from {shortId(run.parentRunId)}
              </Link>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {cancellable && (
            <Button variant="secondary" loading={busy} onClick={() => act(() => cancelRunAction(run.id), "Run cancelled.")}>
              Cancel run
            </Button>
          )}
          {retryable && (
            <Button loading={busy} onClick={() => act(() => retryRunAction(run.id), "Run started.", (id) => id && router.push(`/agents/runs/${id}`))}>
              Retry
            </Button>
          )}
        </div>
      </header>

      <dl className="glass-card m-0 grid [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] gap-4 rounded-24 p-5">
        <Fact k="MODEL" v={`${modelLabel(run.model)}${run.tier ? ` · tag ${run.tier}` : ""}`} />
        <Fact k="STARTED" v={run.startedAt ? formatHM(new Date(run.startedAt)) : "—"} />
        <Fact k="DURATION" v={run.durationMs === null ? "—" : formatDuration(run.durationMs)} />
        <Fact k="TOKENS IN/OUT/CACHE" v={`${formatTokens(run.tokensIn)} / ${formatTokens(run.tokensOut)} / ${formatTokens(run.tokensCache)}`} />
        <Fact k="COST" v={formatUsd(run.costUsd)} />
        <Fact k="TOOL CALLS" v={String(run.toolCalls)} />
        <Fact
          k="LIMITS USED"
          v={`${run.toolCalls}/${RUN_LIMITS.toolCalls} · ${formatTokens(run.tokensIn + run.tokensOut)}/${RUN_LIMITS.tokens / 1000}k · ${active}s/${RUN_LIMITS.activeMs / 1000}s`}
        />
      </dl>

      {run.error && <p className="text-[13px] text-red">{run.error}</p>}

      <section aria-labelledby="trace-h">
        <SectionHeader id="trace-h" label="EXECUTION" />
        {steps.length === 0 ? <p className="text-[13px] text-text-3">No steps recorded.</p> : <ExecutionTrace steps={steps} size="timeline" />}
      </section>

      <section aria-labelledby="calls-h">
        <SectionHeader id="calls-h" label="TOOL CALLS" meta={String(toolCalls.length)} />
        {toolCalls.length === 0 ? (
          <p className="text-[13px] text-text-3">This run made no tool calls.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {toolCalls.map((c) => (
              <li key={c.seq} className="border-t border-white/[.06] py-2.5">
                <Disclosure
                  summary={
                    <span className="grid min-w-0 flex-1 grid-cols-[28px_1fr_auto_auto_auto] items-center gap-3 text-[13px]">
                      <span className="font-mono text-text-3">{c.seq}</span>
                      <span className="truncate font-mono text-[12px]">{c.tool}</span>
                      <Badge kind="tag" tone={TIER_TONE[c.tier as keyof typeof TIER_TONE] ?? "neutral"}>
                        {c.tier}
                      </Badge>
                      <span className="font-mono text-[10.5px] tracking-[0.1em] text-text-2">{c.status.toUpperCase()}</span>
                      <span className="font-mono text-[12px] text-text-3">{c.durationMs === null ? "—" : formatDuration(c.durationMs)}</span>
                    </span>
                  }
                >
                  <div className="mt-2 flex flex-col gap-3">
                    <Block label="INPUT" value={c.input} />
                    <Block label="OUTPUT" value={c.output} />
                  </div>
                </Disclosure>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
