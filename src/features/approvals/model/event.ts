// Moved from the pre-Almanac approval UI: logic only, unchanged.
import { payloadSchemaFor } from "@/lib/approval-kinds";
import type { ApprovalDTO } from "@/lib/agent-types";
import { formatHM, sydneyInstant, sydneyParts } from "@/server/time";

export type EventPayload = {
  calendarLabel: string;
  provider: "google" | "icloud";
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  timeZone?: string;
  location?: string;
  description?: string;
  showAs?: string;
  scope?: "this" | "following" | "all";
  eventId?: string;
  before?: { title: string; start: string; end: string; allDay: boolean; location: string; description: string; showAs: string };
};

export const eventOf = (a: Pick<ApprovalDTO, "edited" | "original">) => (a.edited ?? a.original) as EventPayload;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const SCOPE = { this: "This event", following: "This and following events", all: "All events" } as const;

const asDate = (iso: string, allDay: boolean) => new Date(allDay ? `${iso}T12:00:00Z` : iso);
const dayOf = (d: Date) => {
  const p = sydneyParts(d);
  return `${p.weekday} ${p.day} ${MONTHS[p.month - 1]}`;
};
const ymdOf = (d: Date) => {
  const p = sydneyParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** "Thu 8 Oct · 18:00–20:30" (Sydney). */
export function whenText(start: string, end: string, allDay: boolean): string {
  const s = asDate(start, allDay);
  if (Number.isNaN(s.getTime())) return "";
  if (allDay) {
    const last = addDays(start, 0) < addDays(end, -1) ? asDate(addDays(end, -1), true) : null;
    return `${dayOf(s)}${last ? ` – ${dayOf(last)}` : ""} · All day`;
  }
  const e = new Date(end);
  const same = !Number.isNaN(e.getTime()) && ymdOf(e) === ymdOf(s);
  return `${dayOf(s)} · ${formatHM(s)}–${same || Number.isNaN(e.getTime()) ? "" : `${dayOf(e)} `}${Number.isNaN(e.getTime()) ? "" : formatHM(e)}`;
}

const verb = (k: ApprovalDTO["kind"]) => (k === "event_create" ? "Creates one event on" : k === "event_update" ? "Changes one event on" : "Removes one event from");

// ---- edit draft ----
export type EventDraft = { title: string; startDate: string; startTime: string; endDate: string; endTime: string; allDay: boolean; location: string; description: string; showAs: "busy" | "free" };
export type EventDraftErrors = Partial<Record<keyof EventDraft, string>>;

export function toEventDraft(p: EventPayload): EventDraft {
  const base = { title: p.title, allDay: p.allDay, location: p.location ?? "", description: p.description ?? "", showAs: p.showAs === "free" ? ("free" as const) : ("busy" as const) };
  if (p.allDay) return { ...base, startDate: p.start, startTime: "09:00", endDate: addDays(p.end, -1), endTime: "10:00" };
  const s = new Date(p.start);
  const e = new Date(p.end);
  return { ...base, startDate: ymdOf(s), startTime: formatHM(s), endDate: ymdOf(e), endTime: formatHM(e) };
}

function instant(date: string, time: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  return m && t ? sydneyInstant(+m[1]!, +m[2]!, +m[3]!, +t[1]!, +t[2]!).toISOString() : null;
}

/** Same schema the server re-runs on approve (D-04). Locked fields come from `base` untouched. */
export function validateEventDraft(tool: string, base: EventPayload, d: EventDraft): { payload: EventPayload } | { errors: EventDraftErrors } {
  const start = d.allDay ? d.startDate : instant(d.startDate, d.startTime);
  const end = d.allDay ? (d.endDate ? addDays(d.endDate, 1) : "") : instant(d.endDate, d.endTime);
  const next = { ...base, title: d.title, start: start ?? "", end: end ?? "", allDay: d.allDay, location: d.location, description: d.description, showAs: d.showAs };
  const r = payloadSchemaFor(tool).safeParse(next);
  if (r.success) return { payload: r.data as EventPayload };
  const errors: EventDraftErrors = {};
  for (const i of r.error.issues) {
    const k = i.path[0] === "start" ? "startDate" : i.path[0] === "end" ? "endDate" : i.path[0];
    if (typeof k === "string" && k in d) errors[k as keyof EventDraft] ??= i.message;
  }
  if (!Object.keys(errors).length) errors.title = "Check the event details.";
  return { errors };
}

export const sameEvent = (a: EventPayload, b: EventPayload) =>
  a.title === b.title && a.start === b.start && a.end === b.end && a.allDay === b.allDay && (a.location ?? "") === (b.location ?? "") && (a.description ?? "") === (b.description ?? "") && (a.showAs ?? "busy") === (b.showAs ?? "busy");

// ---- resolved texts (UI-SPEC) ----
export function eventResolved(a: ApprovalDTO, at: string): { text: string; href: string | null } | null {
  const p = eventOf(a);
  const prov = p.provider === "google" ? "Google" : "iCloud";
  if (a.status === "executed") {
    const r = (a.result ?? {}) as { eventId?: unknown; start?: unknown };
    const t = typeof r.start === "string" ? asDate(r.start, r.start.length === 10) : null;
    const ok = typeof r.eventId === "string" && /^[0-9a-f-]{36}$/i.test(r.eventId) && t && !Number.isNaN(t.getTime());
    const href = a.kind === "event_create" && ok ? `/organization?view=day&date=${ymdOf(t)}&event=${r.eventId}` : null;
    return {
      text: a.kind === "event_create" ? `Event created on ${p.calendarLabel}. Approved at ${at}.` : a.kind === "event_update" ? `Event updated. Approved at ${at}.` : `Event deleted from ${p.calendarLabel}. Approved at ${at}.`,
      href,
    };
  }
  if (a.status === "failed") {
    const err = (a.error ?? "unknown error").replace(/\.$/, "");
    const nothing = a.kind === "event_create" ? "Nothing was created." : a.kind === "event_update" ? "Nothing was changed." : "Nothing was deleted.";
    return { text: `Approved, but ${/^(Google|iCloud) /.test(err) ? err : `${prov} rejected it: ${err}`}. ${nothing}`, href: null };
  }
  return null;
}
