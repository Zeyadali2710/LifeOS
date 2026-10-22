"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AgentStatusDTO } from "@/lib/agent-types";
import { useLiveEvents } from "./live-provider";

type Ctx = { status: AgentStatusDTO | null; refresh: () => Promise<void> };
const StatusCtx = createContext<Ctx | null>(null);

/**
 * The one source of the pending-approvals count: the Agents nav badge, the Agents status line and the
 * Approvals tab badge all read it. Seeded by the server, refreshed on run/approval frames and after decisions.
 */
export function AgentStatusProvider({ initial, children }: { initial: AgentStatusDTO | null; children: ReactNode }) {
  const [status, setStatus] = useState<AgentStatusDTO | null>(initial);
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
  useEffect(() => () => clearTimeout(timer.current), []);
  useLiveEvents("run", later);
  useLiveEvents("approval", later);

  return <StatusCtx.Provider value={{ status, refresh }}>{children}</StatusCtx.Provider>;
}

export function useAgentStatus(): Ctx {
  const v = useContext(StatusCtx);
  if (!v) throw new Error("useAgentStatus must be used inside <AgentStatusProvider>");
  return v;
}

export function useApprovalCount(): number {
  return useAgentStatus().status?.approvalsWaiting ?? 0;
}
