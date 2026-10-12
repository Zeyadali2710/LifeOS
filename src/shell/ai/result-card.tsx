"use client";

import Link from "next/link";
import { useState } from "react";
import { CATEGORY, isCategory } from "@/lib/calendar-categories";
import type { ResultItemDTO, TurnDTO } from "@/lib/agent-types";
import { retryRunAction } from "@/server/agent-actions";
import { formatHM } from "@/server/time";
import { InlineError } from "@/ui/inline-error";
import { useShell } from "../shell-provider";
import { AnswerText } from "./answer-text";

const LIMIT_KIND: Record<string, string> = { "limit:tool_calls": "tool-call", "limit:tokens": "token", "limit:time": "time" };

const KEY_COLOR = { FREE: "text-green", TASK: "text-cyan", EVENT: "text-text-2" } as const;

function Items({ items, more, onNavigate }: { items: ResultItemDTO[]; more: number; onNavigate: () => void }) {
  return (
    <div className="flex flex-col gap-1 rounded-16 border border-white/[.10] bg-white/[.06] p-1.5">
      {items.map((it, i) => (
        <Link key={`${it.key}|${it.href}|${it.title}|${it.subtitle}|${i}`} href={it.href} onClick={onNavigate} className="flex min-h-11 items-start gap-2.5 rounded-8 px-2.5 py-2 hover:bg-white/[.06] tab:min-h-0">
          <span
            className={`mt-0.5 w-9 shrink-0 text-[10.5px] font-medium tracking-[.12em] ${KEY_COLOR[it.key]}`}
            style={it.key === "EVENT" && isCategory(it.category) ? { color: CATEGORY[it.category].color } : undefined}
          >
            {it.key}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] break-words">{it.title}</span>
            <span className="block text-[12.5px] text-text-2">{it.subtitle}</span>
          </span>
        </Link>
      ))}
      {more > 0 && (
        <Link href="/organization" onClick={onNavigate} className="px-2.5 py-1.5 text-[12.5px] text-cyan hover:text-cyan-soft">
          Show {more} more
        </Link>
      )}
    </div>
  );
}

export function ResultCard({ turn, streaming, onRetried }: { turn: TurnDTO; streaming: boolean; onRetried: () => void }) {
  const { toast, closeAI } = useShell();
  const [retrying, setRetrying] = useState(false);
  const run = turn.run;
  const live = streaming && (!run || run.status === "queued" || run.status === "running");
  const answer = run?.answer ?? "";
  const retry = async () => {
    if (!run || retrying) return;
    setRetrying(true);
    const r = await retryRunAction(run.id);
    setRetrying(false);
    if (r.ok) onRetried();
    else toast("Couldn't start another run. Try again.", "error");
  };
  const withItems = [...turn.steps].reverse().find((s) => s.items && s.items.length > 0);
  const noCalendar = /no calendar is connected/i.test(answer);
  // The panel covers the page on small screens: close it after following a link.
  const onNavigate = () => {
    if (window.matchMedia("(max-width: 719px)").matches) closeAI();
  };
  const limit = run?.errorKind ? LIMIT_KIND[run.errorKind] : undefined;
  const calls = run?.toolCalls ?? 0;
  return (
    <div className="flex flex-col gap-2.5" aria-busy={live}>
      {withItems?.items && <Items items={withItems.items} more={withItems.itemsMore} onNavigate={onNavigate} />}
      {(answer || live) && (
        <div className="flex flex-col gap-2 rounded-14 border border-white/[.12] bg-white/[.06] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.10)] animate-[lo-rise_.25s_ease-out]">
          <div className="text-[10px] font-medium tracking-[.12em] text-cyan">RESULT</div>
          <AnswerText text={answer} streaming={live} />
          {noCalendar && (
            <Link href="/settings?section=connections" onClick={onNavigate} className="self-start rounded-6 px-2 py-1 text-[12.5px] text-text-2 hover:bg-white/[.06] hover:text-text">
              Open Connections
            </Link>
          )}
          {run?.status === "cancelled" && run.endedAt && (
            <div className="text-[11px] text-text-3">Stopped at {formatHM(new Date(run.endedAt))}.</div>
          )}
        </div>
      )}
      {run?.status === "failed" && run.errorKind !== "no_key" &&
        (limit ? (
          <InlineError
            label="ERROR · RUN"
            title="That run stopped at its limit."
            what={`The run reached its ${limit} limit.`}
            why="Limits keep a single run from spending too much."
            fix="Ask a narrower question, or open the run to see what finished."
          />
        ) : (
          <InlineError
            label="ERROR · RUN"
            title="That run didn't finish."
            what={run.error ?? "The run stopped unexpectedly."}
            why={`The run stopped after ${calls} tool call${calls === 1 ? "" : "s"}.`}
            fix="Try again in a few minutes, or open the run for details."
            action={{ label: retrying ? "TRYING…" : "TRY AGAIN", onClick: () => void retry() }}
          />
        ))}
    </div>
  );
}
