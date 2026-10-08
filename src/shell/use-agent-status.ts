"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentStatusDTO } from "@/lib/agent-types";
import { useLiveEvents } from "./live-provider";

/** Live assistant status: fetched on mount, then (debounced) on run/approval frames and resync. */
export function useAgentStatus(initial?: AgentStatusDTO): { status: AgentStatusDTO | null; refresh: () => Promise<void> } {
  const [status, setStatus] = useState<AgentStatusDTO | null>(initial ?? null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/status", { cache: "no-store" });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (res.ok) setStatus((await res.json()) as AgentStatusDTO);
    } catch {
      // keep the last known status; the next live frame retries
    }
  }, []);

  const later = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void refresh(), 300);
  }, [refresh]);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0); // async so setState never runs synchronously in the effect
    return () => {
      clearTimeout(first);
      clearTimeout(timer.current);
    };
  }, [refresh]);
  useLiveEvents("run", later);
  useLiveEvents("approval", later);

  return { status, refresh };
}
