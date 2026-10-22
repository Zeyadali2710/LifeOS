"use client";

import { useId, useState } from "react";
import type { StepDTO } from "@/lib/agent-types";
import { formatDuration } from "@/lib/format";
import { getAgent } from "@/server/agents/registry";
import { formatHM } from "@/server/time";
import { Icon } from "@/legacy-ui/icon";

type Tone = "text-3" | "indigo" | "amber" | "red";

export function stepView(s: StepDTO): { label: string; tone: Tone; expandable: boolean; showOutput: boolean } {
  const expandable = s.inputSummary !== null || s.outputSummary !== null;
  const showOutput = s.state !== "running";
  if (s.kind === "route") return s.state === "failed" ? { label: "FAILED", tone: "red", expandable: false, showOutput: false } : { label: "ROUTE", tone: "indigo", expandable: false, showOutput: false };
  switch (s.state) {
    case "queued": return { label: "QUEUED", tone: "text-3", expandable, showOutput };
    case "running": return { label: "RUNNING", tone: "indigo", expandable, showOutput };
    case "done": return { label: s.durationMs === null ? "DONE" : formatDuration(s.durationMs), tone: "text-3", expandable, showOutput };
    case "waiting": return { label: "WAITING", tone: "amber", expandable, showOutput };
    case "failed": return { label: "FAILED", tone: "red", expandable, showOutput };
    case "cancelled": return { label: "CANCELLED", tone: "text-3", expandable, showOutput };
  }
}

export function actorLabel(actor: string): string {
  return actor === "orchestrator" ? "LIFEOS" : `${actor.toUpperCase()} AGENT`;
}

const TONE_TEXT: Record<Tone, string> = { "text-3": "text-text-3", indigo: "text-cyan", amber: "text-amber", red: "text-red" };

function Dot({ s }: { s: StepDTO }) {
  const c =
    s.state === "done" ? "bg-[#30d158]"
    : s.state === "running" ? "bg-accent animate-[lo-pulse_2s_ease-out_infinite]"
    : s.state === "failed" ? "bg-[#ff6961]"
    : s.state === "waiting" ? "border border-amber"
    : s.state === "cancelled" ? "border border-text-3"
    : "bg-white/25";
  return <span aria-hidden="true" className={`block size-[9px] rounded-full ${c}`} />;
}

function Io({ label, text, runHref }: { label: string; text: string; runHref?: string }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-text-3">{label}</div>
      <pre className="max-h-40 overflow-auto rounded-14 border border-white/[.08] bg-white/[.03] px-3 py-2.5 font-code text-[11.5px] break-words whitespace-pre-wrap text-text-2">{text}</pre>
      {text.endsWith("…") && runHref && (
        <a href={runHref} className="mt-1 inline-block text-[12px] text-cyan hover:text-cyan-soft">
          full detail in the run
        </a>
      )}
    </div>
  );
}

function Head({ s, size }: { s: StepDTO; size: "panel" | "timeline" }) {
  const v = stepView(s);
  const agent = getAgent(s.actor);
  return (
    <>
      {size === "timeline" && (
        <span className="text-[11px] text-text-3">{s.startedAt ? <time dateTime={s.startedAt}>{formatHM(new Date(s.startedAt))}</time> : null}</span>
      )}
      <span className={`flex justify-center ${s.state === "queued" ? "opacity-40" : ""}`}>
        <Dot s={s} />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-[10.5px] font-medium tracking-[.11em]" style={{ color: agent?.color ?? "#64d2ff" }}>
          {actorLabel(s.actor)}
        </span>
        <span className="block text-[13.5px] text-text">{s.action}</span>
        {s.tool && <span className="block text-[11px] text-text-3"><span className="text-text-4">→</span> {s.tool}</span>}
      </span>
      <span className={`text-[10.5px] font-medium tracking-[.1em] ${TONE_TEXT[v.tone]}`}>{v.label}</span>
    </>
  );
}

function Step({ s, size, runHref }: { s: StepDTO; size: "panel" | "timeline"; runHref?: string }) {
  const [open, setOpen] = useState(false);
  const rid = useId();
  const v = stepView(s);
  const cols = size === "panel" ? "grid-cols-[18px_1fr_auto]" : "grid-cols-[52px_20px_1fr_auto]";
  const row = `grid w-full items-start gap-x-2 ${cols}`;
  return (
    <li role="listitem" className={`relative animate-[lo-fade_.2s_ease-out] py-2 [&:not(:last-child)]:after:absolute [&:not(:last-child)]:after:top-[22px] [&:not(:last-child)]:after:bottom-[-6px] [&:not(:last-child)]:after:w-px [&:not(:last-child)]:after:bg-white/[.09] [&:not(:last-child)]:after:content-[''] ${size === "panel" ? "after:left-[8px]" : "after:left-[69px]"}`}>
      {v.expandable ? (
        <button type="button" aria-expanded={open} aria-controls={rid} onClick={() => setOpen(!open)} className={`${row} min-h-11 md:min-h-0`}>
          <Head s={s} size={size} />
          <span className={`absolute right-0 bottom-1 text-text-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`}>
            <Icon name="expand_more" size={16} />
          </span>
        </button>
      ) : (
        <div className={row}>
          <Head s={s} size={size} />
        </div>
      )}
      {s.state === "failed" && s.error && <p className="mt-1 pl-7 text-[12.5px] text-text-2">{s.error}</p>}
      {s.state === "waiting" && size === "panel" && (
        <a href={`#approval-${s.runId}`} className="mt-1 inline-block pl-7 text-[12.5px] text-amber">
          Review approval
        </a>
      )}
      {v.expandable && open && (
        <div id={rid} className="mt-2 flex animate-[lo-fade_.15s_ease-out] flex-col gap-2 pl-7">
          {s.inputSummary !== null && <Io label="INPUT" text={s.inputSummary} runHref={runHref} />}
          {v.showOutput && s.outputSummary !== null && <Io label="OUTPUT" text={s.outputSummary} runHref={runHref} />}
        </div>
      )}
      {s.state === "running" && (
        <div
          aria-hidden="true"
          className="mt-1.5 h-0.5 animate-[lo-scan_1.4s_linear_infinite] rounded-full bg-[linear-gradient(90deg,transparent,#0a84ff,transparent),linear-gradient(rgba(255,255,255,.05),rgba(255,255,255,.05))] bg-[length:38%_100%,100%_100%] bg-no-repeat"
        />
      )}
    </li>
  );
}

export function ExecutionTrace({ steps, size, runHref }: { steps: StepDTO[]; size: "panel" | "timeline"; runHref?: string }) {
  return (
    <ul role="list" aria-label="Execution trace" className="m-0 flex list-none flex-col p-0">
      {steps.map((s) => (
        <Step key={s.id} s={s} size={size} runHref={runHref} />
      ))}
    </ul>
  );
}
