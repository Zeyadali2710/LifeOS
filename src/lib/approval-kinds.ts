import { formatHM, sydneyParts, TZ } from "@/server/time";
import { eventCreatePayload, eventDeletePayload, eventUpdatePayload } from "./event-payload";
import { issuePayloadSchema } from "./issue-payload";

// Per-tool-kind approval contract (client-safe).
export type ApprovalKind = "issue" | "event_create" | "event_update" | "event_delete";

const KINDS: Record<string, ApprovalKind> = {
  "calendar.create_event": "event_create",
  "calendar.update_event": "event_update",
  "calendar.delete_event": "event_delete",
};
export const approvalKind = (tool: string): ApprovalKind => KINDS[tool] ?? "issue";

const SCHEMAS = {
  issue: issuePayloadSchema,
  event_create: eventCreatePayload,
  event_update: eventUpdatePayload,
  event_delete: eventDeletePayload,
};
export const payloadSchemaFor = (tool: string) => SCHEMAS[approvalKind(tool)];

const TARGET = ["calendarId", "calendarLabel", "provider"];
export const LOCKED: Record<ApprovalKind, string[]> = {
  issue: ["repo"],
  event_create: TARGET,
  event_update: [...TARGET, "eventId", "etag", "scope", "instanceStart", "before"],
  event_delete: Object.keys(eventDeletePayload.shape),
};

// Key-order-independent: the stored original comes back from jsonb, which reorders object keys.
const stable = (v: unknown) =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x,
  );

export function checkLocked(kind: ApprovalKind, orig: unknown, next: unknown): Record<string, string> | null {
  const o = (orig ?? {}) as Record<string, unknown>;
  const n = (next ?? {}) as Record<string, unknown>;
  for (const k of LOCKED[kind]) {
    if (stable(o[k]) !== stable(n[k])) {
      return { [k]: k === "repo" ? "Repository can't be changed." : k === "calendarId" ? "Calendar can't be changed." : "This can't be changed." };
    }
  }
  return null;
}

const NOTHING: Record<ApprovalKind, string> = {
  issue: "Nothing was created.",
  event_create: "Nothing was created.",
  event_update: "Nothing was changed.",
  event_delete: "Nothing was deleted.",
};
export const nothingText = (kind: ApprovalKind) => NOTHING[kind];

function when(d: Date, withTime = true) {
  const mon = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, month: "short" }).format(d);
  const p = sydneyParts(d);
  const day = `${p.weekday} ${p.day} ${mon}`;
  return withTime ? `${day} ${formatHM(d)}` : day;
}

export function approvalSummary(tool: string, payload: unknown, expiresAt: Date): { title: string; body: string | undefined } {
  const kind = approvalKind(tool);
  const exp = when(expiresAt);
  if (kind === "issue") {
    // Loose on purpose: Phase 3 notified for any payload with string repo/title.
    const p = (payload ?? {}) as { repo?: unknown; title?: unknown };
    const ok = typeof p.repo === "string" && typeof p.title === "string";
    return { title: "", body: ok ? `${p.repo}: "${p.title}". Expires ${exp}.` : undefined };
  }
  const parsed = payloadSchemaFor(tool).safeParse(payload);
  if (!parsed.success) return { title: "", body: undefined };
  const p = parsed.data as { title: string; start: string; allDay: boolean; calendarLabel: string };
  const s = new Date(p.allDay ? `${p.start}T12:00:00Z` : p.start);
  const st = Number.isNaN(s.getTime()) ? "" : ` · ${when(s, !p.allDay)}`;
  if (kind === "event_delete") {
    return { title: "Approval waiting: delete calendar event", body: `"${p.title}"${st}. This removes it from ${p.calendarLabel}.` };
  }
  return {
    title: kind === "event_create" ? "Approval waiting: create calendar event" : "Approval waiting: change calendar event",
    body: `"${p.title}"${st}. Expires ${exp}.`,
  };
}
