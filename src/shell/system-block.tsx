"use client";

import { useEffect, useState } from "react";
import { formatHM, tzLabel } from "@/server/time";
import { useAgentStatus } from "./use-agent-status";
import { useLive } from "./live-provider";

export function useSystemState() {
  const { health, connected, loaded } = useLive();
  const { status } = useAgentStatus();
  const assistant = status?.assistant ?? "no_key";
  const ai = {
    ready: { text: "AI READY", dot: "bg-green" },
    working: { text: "AI WORKING", dot: "bg-accent animate-[lo-pulse_2s_ease-out_infinite]" },
    paused: { text: "AI PAUSED", dot: "bg-amber" },
    cap: { text: "AI PAUSED", dot: "bg-amber" },
    no_key: { text: "AI NOT CONNECTED", dot: "border border-text-3" },
  }[assistant];

  let healthRow: { text: string; dot: string; pulse: boolean };
  if (loaded && !connected) healthRow = { text: "RECONNECTING", dot: "bg-amber", pulse: false };
  else if (health?.status === "down") healthRow = { text: "LIFEOS OFFLINE", dot: "bg-red", pulse: false };
  else if (health?.status === "degraded") healthRow = { text: "LIFEOS DEGRADED", dot: "bg-amber", pulse: false };
  else healthRow = { text: "LIFEOS ONLINE", dot: "bg-green", pulse: true };

  const attention: "red" | "amber" | null =
    health?.status === "down" && !(loaded && !connected)
      ? "red"
      : healthRow.dot === "bg-amber" || assistant === "paused" || assistant === "cap"
        ? "amber"
        : null;

  return { healthRow, ai, running: status?.running ?? 0, attention };
}

const row = "flex items-center gap-[9px] text-[10.5px] font-medium tracking-[.08em] uppercase text-text-2";

export function SystemBlock({ version }: { version: string }) {
  const { healthRow, ai, running } = useSystemState();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mt-1.5 flex flex-col gap-2 border-t border-white/[.06] px-3 pt-3 pb-2">
      <div className={row}>
        <span aria-hidden="true" className={`size-[7px] shrink-0 rounded-full ${healthRow.dot} ${healthRow.pulse ? "animate-[lo-pulse-g_2s_ease-out_infinite]" : ""}`} />
        {healthRow.text}
      </div>
      <div className={row}>
        <span aria-hidden="true" className={`size-[7px] shrink-0 rotate-45 rounded-[2px] ${ai.dot}`} />
        {ai.text}
      </div>
      <div className={`${row} text-cyan`}>
        <span aria-hidden="true" className={`size-[7px] shrink-0 rounded-full bg-cyan ${running > 0 ? "animate-[lo-pulse_2s_ease-out_infinite]" : ""}`} />
        {running} RUNNING
      </div>
      <div className={`${row} min-w-[9ch]`}>{now ? `${formatHM(now)} ${tzLabel(now)}` : " "}</div>
      <div className="text-[10.5px] text-text-3">{version}</div>
    </div>
  );
}
