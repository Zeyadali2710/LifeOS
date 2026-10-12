"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RunDTO, RunStatus } from "@/lib/agent-types";
import { formatDuration, formatTokens, formatUsd } from "@/lib/format";
import { getAgent, modelLabel, modelShort } from "@/server/agents/registry";
import { formatHM } from "@/server/time";
import { Button } from "@/ui/button";
import { EmptyState } from "@/ui/empty-state";

export const shortId = (id: string) => `run_${id.slice(0, 4)}`;

const RESULT: Record<RunStatus, { label: string; dot: string; text: string }> = {
  completed: { label: "COMPLETED", dot: "bg-green", text: "text-green" },
  failed: { label: "FAILED", dot: "bg-red", text: "text-red" },
  running: { label: "RUNNING", dot: "bg-accent", text: "text-cyan" },
  queued: { label: "QUEUED", dot: "border border-text-3", text: "text-text-3" },
  waiting_approval: { label: "WAITING", dot: "border border-amber", text: "text-amber" },
  cancelled: { label: "CANCELLED", dot: "border border-text-3", text: "text-text-3" },
  expired: { label: "EXPIRED", dot: "border border-text-3", text: "text-text-3" },
};

export function Result({ status }: { status: RunStatus }) {
  const r = RESULT[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[.12em] ${r.text}`}>
      <span aria-hidden="true" className={`block size-[7px] rounded-full ${r.dot}`} />
      {r.label}
    </span>
  );
}

const agentName = (id: string) => getAgent(id)?.name ?? id;
const time = (r: RunDTO) => formatHM(new Date(r.startedAt ?? r.endedAt ?? Date.now()));
const tok = (r: RunDTO) => r.tokensIn + r.tokensOut;
const lat = (r: RunDTO) => (r.durationMs === null ? "—" : formatDuration(r.durationMs));
const th = "px-2 py-2 text-left text-[10px] font-medium tracking-[.12em] text-text-3";

export function RunsTable({
  runs,
  compact = false,
  onMore,
}: {
  runs: RunDTO[];
  /** agent detail: hides the AGENT and TOOLS columns */
  compact?: boolean;
  onMore?: () => void;
}) {
  const router = useRouter();
  if (runs.length === 0) {
    return (
      <EmptyState icon="memory" title="No runs yet." body="Ask LifeOS something in the assistant. Each run appears here with its tool calls, tokens and cost." />
    );
  }
  return (
    <>
      <div className="glass-card hidden overflow-x-auto rounded-26 px-2 min-[720px]:block">
        <table role="table" className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th scope="col" className={th}>RUN</th>
              {!compact && <th scope="col" className={th}>AGENT</th>}
              <th scope="col" className={th}>TASK</th>
              {!compact && <th scope="col" className={th}>TOOLS</th>}
              <th scope="col" className={th}>MODEL</th>
              <th scope="col" className={th}>TOKENS</th>
              <th scope="col" className={th}>COST</th>
              <th scope="col" className={th}>LATENCY</th>
              <th scope="col" className={th}>RESULT</th>
              <th scope="col" className={th}>TIME</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} role="row" onClick={() => router.push(`/agents/runs/${r.id}`)} className="cursor-pointer border-b border-white/[.04] hover:bg-white/[.025]">
                <td className="px-2 py-2.5 text-[11.5px] text-text-2">
                  <Link href={`/agents/runs/${r.id}`} className="hover:text-text">
                    {shortId(r.id)}
                  </Link>
                </td>
                {!compact && <td className="px-2 py-2.5 text-text-2">{agentName(r.agentId)}</td>}
                <td className="max-w-[360px] truncate px-2 py-2.5 text-text">{r.prompt}</td>
                {!compact && <td className="px-2 py-2.5 text-[12px] text-text-2">{r.toolCalls}</td>}
                <td className="px-2 py-2.5 text-[10px] tracking-[.12em] text-text-2" title={modelLabel(r.model)}>
                  {modelShort(r.model)}
                </td>
                <td className="px-2 py-2.5 text-[12px] text-text-2" title={`${tok(r).toLocaleString("en-AU")} tokens`}>
                  {formatTokens(tok(r))}
                </td>
                <td className="px-2 py-2.5 text-[12px] text-text-2">{formatUsd(r.costUsd)}</td>
                <td className="px-2 py-2.5 text-[12px] text-text-2">{lat(r)}</td>
                <td className="px-2 py-2.5">
                  <Result status={r.status} />
                </td>
                <td className="px-2 py-2.5 text-[12px] text-text-3">{time(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 min-[720px]:hidden">
        {runs.map((r) => (
          <li key={r.id}>
            <Link href={`/agents/runs/${r.id}`} className="flex min-h-11 flex-col gap-1 glass-card rounded-22 p-3">
              <span className="flex items-center justify-between">
                <span className="text-[13px] font-medium">{agentName(r.agentId)}</span>
                <Result status={r.status} />
              </span>
              <span className="truncate text-[13px] text-text-2">{r.prompt}</span>
              <span className="text-[11px] text-text-3">
                <span title={modelLabel(r.model)}>{modelShort(r.model)}</span> · {r.toolCalls} tools · {formatTokens(tok(r))} · {formatUsd(r.costUsd)} · {lat(r)} · {time(r)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {onMore && (
        <div className="mt-3">
          <Button variant="ghost" onClick={onMore}>
            Show more
          </Button>
        </div>
      )}
    </>
  );
}
