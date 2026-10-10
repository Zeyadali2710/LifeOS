import type { ApprovalDTO, ResultItemDTO, RouteEvent, RunDTO, StepDTO, StepState } from "@/lib/agent-types";
import { approvalKind, payloadSchemaFor } from "@/lib/approval-kinds";
import { CATEGORY, isCategory } from "@/lib/calendar-categories";
import { formatHM, sydneyParts } from "@/server/time";
import { modelLabel } from "./registry";
import type { agentRuns, approvals, toolCalls } from "../db/schema";

// Pure row -> DTO mappers (no DB, JSON-safe). Never expose messages/ciphertext (T-03-27).
const iso = (d: Date | null) => d?.toISOString() ?? null;
const diff = (a: Date | null, b: Date | null) => (a && b ? a.getTime() - b.getTime() : null);

export function toRunDTO(r: typeof agentRuns.$inferSelect): RunDTO {
  return {
    id: r.id,
    agentId: r.agentId,
    threadId: r.threadId,
    parentRunId: r.parentRunId,
    retryOf: r.retryOf,
    prompt: r.prompt,
    model: r.model,
    tier: r.tier === "simple" || r.tier === "reasoning" ? r.tier : null,
    status: r.status,
    answer: r.answer,
    error: r.error,
    errorKind: r.errorKind,
    tokensIn: r.inputTokens,
    tokensOut: r.outputTokens,
    tokensCache: r.cacheReadTokens + r.cacheWriteTokens,
    costUsd: Number(r.costUsd),
    toolCalls: r.toolCallCount,
    startedAt: iso(r.startedAt),
    endedAt: iso(r.endedAt),
    durationMs: diff(r.endedAt, r.startedAt),
    firstToolMs: diff(r.firstToolAt, r.startedAt),
  };
}

const STATE: Record<string, StepState> = {
  running: "running",
  done: "done",
  failed: "failed",
  waiting_approval: "waiting",
  cancelled: "cancelled",
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 8;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const ymdOf = (d: Date) => {
  const p = sydneyParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const validDate = (v: unknown) => {
  const d = new Date(str(v));
  return str(v) && !Number.isNaN(d.getTime()) ? d : null;
};
const dayHref = (ymd: string, event?: string) => `/organization?view=day&date=${ymd}${event ? `&event=${event}` : ""}`;
const mins = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ""}` : `${n} min`);

function itemOf(tool: string, o: Record<string, unknown>): ResultItemDTO | null {
  if (tool === "calendar.list_events") {
    const allDay = o.allDay === true;
    const s = allDay ? validDate(`${str(o.start)}T12:00:00Z`) : validDate(o.start);
    if (!s) return null;
    const e = allDay ? null : validDate(o.end);
    const p = sydneyParts(s);
    const cat = isCategory(o.category) ? o.category : null;
    const time = allDay ? "All day" : `${formatHM(s)}${e ? `–${formatHM(e)}` : ""}`;
    const day = allDay ? `${p.weekday} ${p.day} ${MON[p.month - 1]}` : p.weekday;
    const ymd = allDay ? str(o.start) : ymdOf(s);
    return {
      key: "EVENT",
      category: cat,
      title: str(o.title).slice(0, 200),
      subtitle: `${day} ${time}${cat ? ` · ${CATEGORY[cat].label}` : ""}`,
      href: dayHref(YMD.test(ymd) ? ymd : ymdOf(s), UUID.test(str(o.id)) ? str(o.id) : undefined),
    };
  }
  if (tool === "calendar.find_free_slots") {
    const s = validDate(o.start);
    if (!s || typeof o.minutes !== "number") return null;
    return { key: "FREE", category: null, title: "Free", subtitle: `${mins(o.minutes)} · ${formatHM(s)}–${formatHM(validDate(o.end) ?? s)}`, href: dayHref(ymdOf(s)) };
  }
  if (tool === "tasks.list") {
    const due = validDate(o.due);
    const p = due && sydneyParts(due);
    return { key: "TASK", category: null, title: str(o.title).slice(0, 200), subtitle: p ? `Due ${p.weekday} ${p.day} ${MON[p.month - 1]}` : "No due date", href: "/organization#tasks" };
  }
  return null;
}

const ITEM_TOOLS = new Set(["calendar.list_events", "calendar.find_free_slots", "tasks.list"]);

function itemsOf(r: typeof toolCalls.$inferSelect): { items: ResultItemDTO[] | null; itemsMore: number } {
  const none = { items: null, itemsMore: 0 };
  if (r.status !== "done" || !ITEM_TOOLS.has(r.tool)) return none;
  const raw = (r.output as { items?: unknown } | null)?.items;
  if (!Array.isArray(raw)) return none;
  const all = raw.flatMap((x) => (x && typeof x === "object" ? [itemOf(r.tool, x as Record<string, unknown>)] : [])).filter((x): x is ResultItemDTO => x !== null);
  return { items: all.slice(0, MAX_ITEMS), itemsMore: Math.max(0, all.length - MAX_ITEMS) };
}

export function toStepDTO(
  r: typeof toolCalls.$inferSelect,
  run: { agentId: string },
  labels: (tool: string) => string = (t) => t,
): StepDTO {
  const label = labels(r.tool);
  return {
    id: r.id,
    runId: r.runId,
    seq: r.seq,
    kind: r.kind === "delegate" ? "delegate" : "tool",
    actor: run.agentId,
    action: r.kind === "delegate" ? `Delegating to ${label}` : label,
    tool: r.tool,
    state: STATE[r.status] ?? "queued",
    startedAt: iso(r.startedAt),
    durationMs: r.durationMs,
    inputSummary: r.inputSummary,
    outputSummary: r.outputSummary,
    error: r.error,
    ...itemsOf(r),
  };
}

const isFree = (m: string | null) => !!m && m.endsWith(":free");
const target = (m: string | null) => (isFree(m) ? "free" : m ? modelLabel(m) : "");
const sonnet = "Sonnet";

/** Route events as trace steps (D-13). Reason is untrusted model text: capped, rendered as plain text only. */
export function routeSteps(r: Pick<typeof agentRuns.$inferSelect, "id" | "agentId" | "routeEvents">): StepDTO[] {
  return r.routeEvents.map((ev: RouteEvent, i) => {
    const reason = ev.reason.slice(0, 200);
    const blocked = ev.kind === "blocked";
    const action =
      ev.kind === "routed" ? `Routed: ${target(ev.to)} (${reason})`
      : ev.kind === "fallback" ? `Fell back → ${sonnet}: ${reason}`
      : ev.kind === "escalated" ? `Escalated → ${sonnet}: ${reason}`
      : ev.kind === "private" ? `Switched → ${sonnet}: ${reason}`
      : `Free model unavailable: ${reason}`;
    return {
      id: `route:${r.id}:${i}`,
      runId: r.id,
      seq: ev.seq,
      kind: "route",
      actor: r.agentId,
      action,
      tool: ev.to,
      state: blocked ? "failed" : "done",
      startedAt: ev.at,
      durationMs: null,
      inputSummary: null,
      outputSummary: null,
      error: blocked ? reason : null,
      items: null,
      itemsMore: 0,
    };
  });
}

/** Throws on an invalid stored payload; caller logs. */
export function toApprovalDTO(r: typeof approvals.$inferSelect, repoPrivate: boolean | null = null, targetChanged: boolean | null = null): ApprovalDTO {
  const schema = payloadSchemaFor(r.tool);
  return {
    id: r.id,
    runId: r.runId,
    agentId: r.agentId,
    tool: r.tool,
    kind: approvalKind(r.tool),
    status: r.status,
    original: schema.parse(r.originalPayload),
    edited: r.editedPayload == null ? null : schema.parse(r.editedPayload),
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    decidedAt: iso(r.decidedAt),
    result: r.result ?? null,
    error: r.error,
    repoPrivate,
    targetChanged,
  };
}
