import type { Action } from "@/lib/automations";
import type { Tone } from "@/ui/display";

export function runState(run: { status: string; agentStatus: string | null }): { label: string; glyph: string; tone: Tone } {
  const status = run.status === "done" && run.agentStatus ? run.agentStatus : run.status;
  switch (status) {
    case "waiting_approval": return { label: "Waiting approval", glyph: "!", tone: "approval" };
    case "running": case "queued": return { label: "Running", glyph: "…", tone: "working" };
    case "done": case "completed": return { label: "Done", glyph: "✓", tone: "idle" };
    case "failed": return { label: "Failed", glyph: "×", tone: "failed" };
    case "cancelled": return { label: "Cancelled", glyph: "–", tone: "idle" };
    case "expired": return { label: "Expired", glyph: "–", tone: "idle" };
    default: return { label: "Skipped", glyph: "–", tone: "idle" };
  }
}

export const ACTION_LABEL: Record<Action["type"], string> = { notify: "Send a notification", create_task: "Create a task", ask_agent: "Ask LifeOS (unattended)" };
export function describeAction(a: Action): string {
  if (a.type === "ask_agent") return `Ask LifeOS: “${a.prompt}”`;
  if (a.type === "notify") return `Send notification: “${a.title}”${a.body ? ` · ${a.body}` : ""} · ${a.priority}`;
  return `Create task “${a.title}”${a.dueInDays !== null ? ` · due in ${a.dueInDays} days` : ""}${a.priority ? ` · P${a.priority}` : ""}`;
}
