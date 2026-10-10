"use client";

import { payloadSchemaFor } from "@/lib/approval-kinds";
import type { ApprovalDTO } from "@/lib/agent-types";
import { formatHM, sydneyInstant, sydneyParts } from "@/server/time";
import { Badge } from "@/ui/badge";
import { Checkbox, Field, Input, Select, Textarea } from "@/ui/field";
import { Disclosure } from "@/ui/disclosure";
import { Icon } from "@/ui/icon";

// Calendar approval bodies (create preview, edit diff, delete warning) and their edit form. Client-safe.
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

// ---- views ----
const Fact = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div>
    <div className="mb-1 font-mono text-[10.5px] tracking-[0.1em] text-text-3">{k}</div>
    <div className="text-[13.5px] leading-normal break-words">{children}</div>
  </div>
);

function EventPreview({ p }: { p: EventPayload }) {
  return (
    <div className="rounded-10 border border-[rgba(255,255,255,.06)] bg-inset p-4">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-3 bg-indigo" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium break-words">{p.title}</div>
          <div className="mt-1 text-[13px] text-text-2">{whenText(p.start, p.end, p.allDay)}</div>
          {p.location && (
            <div className="mt-1 flex items-center gap-1.5 text-[13px] text-text-2 break-words">
              <Icon name="location_on" size={15} className="shrink-0 text-text-3" />
              {p.location}
            </div>
          )}
        </div>
        <Badge kind="tag" tone="neutral">
          {p.calendarLabel}
        </Badge>
      </div>
      {p.description && <p className="mt-3 text-[14px] leading-[1.65] break-words whitespace-pre-wrap text-text-2">{p.description}</p>}
    </div>
  );
}

function Diff({ p }: { p: EventPayload }) {
  const b = p.before;
  const rows: [string, string, string][] = [];
  if (b) {
    if (b.title !== p.title) rows.push(["TITLE", b.title, p.title]);
    if (b.start !== p.start || b.end !== p.end || b.allDay !== p.allDay) rows.push(["WHEN", whenText(b.start, b.end, b.allDay), whenText(p.start, p.end, p.allDay)]);
    if (b.location !== (p.location ?? "")) rows.push(["LOCATION", b.location || "None", p.location || "None"]);
    if (b.description !== (p.description ?? "")) rows.push(["DESCRIPTION", b.description || "None", p.description || "None"]);
    if (b.showAs !== (p.showAs ?? "busy")) rows.push(["SHOW AS", b.showAs, p.showAs ?? "busy"]);
  }
  if (!rows.length) return <div className="rounded-10 border border-[rgba(255,255,255,.06)] bg-inset p-4 text-[13.5px] text-text-2">No fields change.</div>;
  return (
    <div className="flex flex-col gap-3.5 rounded-10 border border-[rgba(255,255,255,.06)] bg-inset p-4">
      {rows.map(([k, from, to]) => (
        <div key={k}>
          <div className="mb-1 font-mono text-[10.5px] tracking-[0.1em] text-text-3">{k}</div>
          <div className="text-[13px] break-words whitespace-pre-wrap text-text-3 line-through">{from}</div>
          <div className="text-[14px] break-words whitespace-pre-wrap">{to}</div>
        </div>
      ))}
    </div>
  );
}

function EditFields({ draft, errors, onDraft, p }: { draft: EventDraft; errors: EventDraftErrors; onDraft: (d: EventDraft) => void; p: EventPayload }) {
  const set = <K extends keyof EventDraft>(k: K, v: EventDraft[K]) => onDraft({ ...draft, [k]: v });
  return (
    <div className="flex flex-col gap-4">
      <Field label="Title" error={errors.title}>
        <Input value={draft.title} maxLength={200} required onChange={(e) => set("title", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3 max-[719px]:grid-cols-1">
        <Field label="Start date" error={errors.startDate}>
          <Input type="date" value={draft.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        {!draft.allDay && (
          <Field label="Start time" error={errors.startTime}>
            <Input type="time" value={draft.startTime} onChange={(e) => set("startTime", e.target.value)} />
          </Field>
        )}
        <Field label="End date" error={errors.endDate}>
          <Input type="date" value={draft.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </Field>
        {!draft.allDay && (
          <Field label="End time" error={errors.endTime}>
            <Input type="time" value={draft.endTime} onChange={(e) => set("endTime", e.target.value)} />
          </Field>
        )}
      </div>
      <Checkbox label="All day" checked={draft.allDay} onChange={(e) => set("allDay", e.target.checked)} />
      <Field label="Location" error={errors.location}>
        <Input value={draft.location} maxLength={300} onChange={(e) => set("location", e.target.value)} />
      </Field>
      <Field label="Description" error={errors.description}>
        <Textarea rows={5} value={draft.description} maxLength={8000} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <Field label="Show as">
        <Select value={draft.showAs} onChange={(e) => set("showAs", e.target.value === "free" ? "free" : "busy")}>
          <option value="busy">Busy</option>
          <option value="free">Free</option>
        </Select>
      </Field>
      <div>
        <div className="mb-1 text-[12.5px] text-text-2">Calendar</div>
        <div className="text-[13px] text-text-2">{p.calendarLabel}</div>
        <div className="mt-0.5 text-[12.5px] text-text-3">The calendar and repeat rule are set by the request and can&apos;t be changed here.</div>
      </div>
    </div>
  );
}

type BodyProps = { approval: ApprovalDTO; editing: boolean; draft: EventDraft; errors: EventDraftErrors; onDraft: (d: EventDraft) => void; edited?: boolean };

/** Everything between the header and the decision footer for event_create / event_update / event_delete. */
export function EventApprovalBody({ approval: a, editing, draft, errors, onDraft, edited }: BodyProps) {
  const p = eventOf(a);
  const orig = a.original as EventPayload;
  const del = a.kind === "event_delete";
  const recurring = a.kind !== "event_create" && p.scope && p.scope !== "all";
  const when = whenText(p.start, p.end, p.allDay);
  const sent = [
    a.kind === "event_delete" ? "Which event to remove" : "Event title, time and location",
    ...(del ? [] : [`Description (${(p.description ?? "").length} characters)`]),
  ];
  return (
    <>
      <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-6 gap-y-[18px] border-b border-[rgba(255,255,255,.06)] px-[22px] py-5">
        <Fact k="WHAT WILL HAPPEN">
          {verb(a.kind)} {p.calendarLabel}.{a.kind === "event_create" ? ` Marked ${p.showAs === "free" ? "free" : "busy"}.` : ""}
        </Fact>
        <Fact k="WHICH ACCOUNT">{p.calendarLabel}</Fact>
        <Fact k="WHEN">Immediately after approval</Fact>
        {p.scope && a.kind !== "event_create" && <Fact k="APPLIES TO">{SCOPE[p.scope]}</Fact>}
      </section>
      <section className="border-b border-[rgba(255,255,255,.06)] px-[22px] py-5">
        <div className="mb-3 font-mono text-[10.5px] tracking-[0.1em] text-text-3">WHAT DATA WILL BE SENT</div>
        <ul className="flex flex-col gap-1.5 text-[13px]">
          {sent.map((t) => (
            <li key={t} className="flex items-center gap-2 break-words">
              <Icon name="check_circle" size={16} className="shrink-0 text-green" />
              {t}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <Icon name="shield" size={16} className="shrink-0 text-blue" />
            Not shared with other attendees
          </li>
          <li className="flex items-center gap-2">
            <Icon name="shield" size={16} className="shrink-0 text-blue" />
            No email or contact data
          </li>
        </ul>
      </section>
      <section className={`border-b px-[22px] py-5 ${del ? "border-[rgba(240,122,110,.35)]" : "border-[rgba(255,255,255,.06)]"}`}>
        <div className="mb-3 flex items-center gap-2 font-mono text-[10.5px] tracking-[0.1em] text-text-3">
          {a.kind === "event_update" ? "CHANGES" : "PREVIEW"}
          {edited && (
            <Badge kind="tag" tone="amber">
              EDITED
            </Badge>
          )}
        </div>
        {del ? (
          <div className="flex items-start gap-3 rounded-10 border border-[rgba(240,122,110,.25)] bg-[rgba(240,122,110,.06)] p-4 text-[13.5px] leading-normal break-words">
            <Icon name="warning" size={18} className="mt-0.5 shrink-0 text-red" />
            <span>
              This permanently removes &quot;{p.title}&quot; ({when}) from {p.calendarLabel}.{" It can't be undone from LifeOS."}
              {recurring ? ` Applies to: ${SCOPE[p.scope!]}.` : ""}
            </span>
          </div>
        ) : editing && a.status === "pending" ? (
          <EditFields draft={draft} errors={errors} onDraft={onDraft} p={p} />
        ) : a.kind === "event_update" ? (
          <Diff p={p} />
        ) : (
          <EventPreview p={p} />
        )}
        {edited && !del && (
          <div className="mt-3 text-[12.5px] text-text-2">
            <Disclosure summary={<span>View agent&apos;s original</span>}>
              <div className="pt-2">{a.kind === "event_update" ? <Diff p={orig} /> : <EventPreview p={orig} />}</div>
            </Disclosure>
          </div>
        )}
      </section>
    </>
  );
}
