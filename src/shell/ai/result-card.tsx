"use client";

import { useState } from "react";
import type { TurnDTO } from "@/lib/agent-types";
import { retryRunAction } from "@/server/agent-actions";
import { formatHM } from "@/server/time";
import { InlineError } from "@/ui/inline-error";
import { useShell } from "../shell-provider";
import { AnswerText } from "./answer-text";

const LIMIT_KIND: Record<string, string> = { "limit:tool_calls": "tool-call", "limit:tokens": "token", "limit:time": "time" };

export function ResultCard({ turn, streaming, onRetried }: { turn: TurnDTO; streaming: boolean; onRetried: () => void }) {
  const { toast } = useShell();
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
  const limit = run?.errorKind ? LIMIT_KIND[run.errorKind] : undefined;
  const calls = run?.toolCalls ?? 0;
  return (
    <div className="flex flex-col gap-2.5" aria-busy={live}>
      {(answer || live) && (
        <div className="flex flex-col gap-2 rounded-12 border border-[rgba(255,255,255,.07)] bg-fill-1 p-3.5">
          <div className="font-mono text-[10px] tracking-[0.08em] text-text-3">RESULT</div>
          <AnswerText text={answer} streaming={live} />
          {run?.status === "cancelled" && run.endedAt && (
            <div className="font-mono text-[11px] text-text-3">Stopped at {formatHM(new Date(run.endedAt))}.</div>
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
