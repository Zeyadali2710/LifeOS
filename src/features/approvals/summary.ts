import type { ApprovalDTO, ApprovalStatus } from "@/lib/agent-types";
import { approvalSummary, type ApprovalKind } from "@/lib/approval-kinds";
import { formatHM, sydneyParts } from "@/server/time";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Thu 29 Oct" or "Thu 29 Oct 18:00" in Sydney time. */
export function stamp(iso: string, time = true): string {
  const d = new Date(iso);
  const p = sydneyParts(d);
  return `${p.weekday} ${p.day} ${MONTHS[p.month - 1]}${time ? ` ${formatHM(d)}` : ""}`;
}

/** "18 min", "2h 10m", "3 days". */
export function since(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

export const KIND_LABEL: Record<ApprovalKind, string> = {
  issue: "Create issue",
  event_create: "Create event",
  event_update: "Change event",
  event_delete: "Delete event",
  project_create: "Create project",
  project_update: "Change project",
  mail_reply: "Send reply",
  social_publish: "Publish post",
  finance_update: "Finance changes",
};

export const TIER_OF: Record<ApprovalKind, "APPROVE" | "HIGH_RISK"> = {
  issue: "APPROVE", event_create: "APPROVE", event_update: "APPROVE", event_delete: "HIGH_RISK", project_create: "APPROVE",
  project_update: "APPROVE", mail_reply: "APPROVE", social_publish: "APPROVE", finance_update: "APPROVE",
};

export type ApprovalSummary = {
  title: string;
  target: string;
  /** Exact content in a quote block (reply body, issue body, post text) when there is one. */
  quote: string | null;
  note: string | null;
};

type Any = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Human summary of a proposal. Always from the current (edited) payload. */
export function summarize(a: Pick<ApprovalDTO, "tool" | "kind" | "original" | "edited" | "expiresAt">): ApprovalSummary {
  const p = ((a.edited ?? a.original) ?? {}) as Any;
  const fallback = approvalSummary(a.tool, p, new Date(a.expiresAt));
  const note = fallback.body ?? null;
  switch (a.kind) {
    case "issue": {
      const labels = Array.isArray(p.labels) ? (p.labels as string[]).join(", ") : "";
      return { title: `Create issue “${str(p.title)}”`, target: `${str(p.repo)}${labels ? ` · labels: ${labels}` : ""}`, quote: str(p.body) || null, note: null };
    }
    case "mail_reply": {
      const to = (Array.isArray(p.to) ? (p.to as { name?: string; address?: string }[])[0] : undefined) ?? {};
      return { title: `Send reply to ${to.name || to.address || "the sender"}`, target: `${to.address ?? ""} · ${str(p.subject)}`, quote: str(p.body) || null, note: null };
    }
    case "social_publish": {
      const platform = str(p.platform) === "linkedin" ? "LinkedIn" : "Instagram";
      const when = str(p.publishAt) ? ` · ${stamp(str(p.publishAt))}` : "";
      return { title: `Publish on ${platform}`, target: `${str(p.providerMode) === "mock" ? "Mock publishing" : platform}${when}`, quote: str(p.text) || null, note: null };
    }
    case "event_create":
    case "event_update":
    case "event_delete": {
      const verb = a.kind === "event_create" ? "Create" : a.kind === "event_update" ? "Change" : "Delete";
      return { title: `${verb} event “${str(p.title)}”`, target: str(p.calendarLabel), quote: str(p.description) || null, note };
    }
    case "project_create":
      return { title: `Create project “${str(p.name)}”`, target: "LifeOS projects", quote: str(p.description) || null, note };
    case "project_update": {
      const before = (p.before ?? {}) as Any;
      return { title: `Change project “${str(before.name)}”`, target: "LifeOS projects", quote: null, note };
    }
    case "finance_update":
      return { title: "Apply finance changes", target: "Finances · categories, rules and budgets", quote: null, note };
  }
}

export const RESOLVED: Record<ApprovalStatus, { label: string; glyph: string; tone: "working" | "failed" | "idle" | "approval" }> = {
  pending: { label: "Awaiting your approval", glyph: "!", tone: "approval" },
  approved: { label: "Approved", glyph: "✓", tone: "working" },
  executing: { label: "Approved · running", glyph: "…", tone: "working" },
  executed: { label: "Approved · done", glyph: "✓", tone: "working" },
  failed: { label: "Approved · failed", glyph: "×", tone: "failed" },
  rejected: { label: "Rejected", glyph: "×", tone: "failed" },
  expired: { label: "Expired", glyph: "○", tone: "idle" },
  cancelled: { label: "Cancelled", glyph: "–", tone: "idle" },
};
