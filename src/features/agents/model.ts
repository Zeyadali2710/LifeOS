import type { AgentState } from "@/ui/display";

/** Server agent status → office state. A pending approval for the agent outranks everything (needs you). */
export function officeState(status: string, live: boolean, hasPending: boolean): AgentState {
  if (!live || status === "NOT CONNECTED") return "offline";
  if (hasPending) return "approval";
  if (status === "PAUSED") return "paused";
  if (status === "WORKING") return "working";
  if (status === "ATTENTION") return "failed";
  return "idle";
}

/** Sort order for lists: needs you, failed, working, idle, paused, offline. */
export const STATE_RANK: Record<AgentState, number> = { approval: 0, failed: 1, working: 2, idle: 3, paused: 4, offline: 5 };
