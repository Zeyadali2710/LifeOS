"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY } from "@/lib/calendar-categories";
import type { CalendarDTO } from "@/lib/calendar-types";
import { eventInput, isTimeZone } from "@/lib/event-payload";
import { createEventAction, deleteEventAction, reloadEventAction, updateEventAction, type EventActionResult } from "@/server/calendar-actions";
import { formatHM, sydneyInstant, sydneyParts, tzLabel } from "@/server/time";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/ui/field";
import { type Scope, ScopeDialog } from "./scope-dialog";
import type { OrgInstance } from "./organization-view";

const TZ = "Australia/Sydney";
const PROVIDER = { google: "Google Calendar", icloud: "iCloud" } as const;
const CONNECTIONS = "/settings?section=connections";
const two = (n: number) => String(n).padStart(2, "0");
const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const partsOf = (iso: string) => {
  const p = sydneyParts(new Date(iso));
  return { date: `${p.year}-${two(p.month)}-${two(p.day)}`, time: `${two(p.hour)}:${two(p.minute)}` };
};
const instant = (date: string, time: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return "";
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [h, min] = time.split(":").map(Number) as [number, number];
  return sydneyInstant(y, m, d, h, min).toISOString();
};
const dow = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ICAL = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

type Repeat = "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
interface Form {
  title: string;
  calendarId: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  repeat: Repeat;
  location: string;
  description: string;
  showAs: "busy" | "free";
}

function repeatOf(rrule: string | null, startDate: string): Repeat {
  if (!rrule) return "none";
  const p = Object.fromEntries(rrule.split(";").map((x) => x.split("="))) as Record<string, string>;
  const ok = Object.keys(p).every((k) => ["FREQ", "BYDAY", "BYMONTHDAY", "BYMONTH", "INTERVAL"].includes(k)) && (!p.INTERVAL || p.INTERVAL === "1");
  const day = Number(startDate.slice(8));
  const month = Number(startDate.slice(5, 7));
  if (!ok) return "custom";
  if (p.FREQ === "DAILY" && !p.BYDAY && !p.BYMONTHDAY) return "daily";
  if (p.FREQ === "WEEKLY" && !p.BYMONTHDAY && (!p.BYDAY || p.BYDAY === ICAL[dow(startDate)])) return "weekly";
  if (p.FREQ === "MONTHLY" && !p.BYDAY && (!p.BYMONTHDAY || Number(p.BYMONTHDAY) === day)) return "monthly";
  if (p.FREQ === "YEARLY" && !p.BYDAY && (!p.BYMONTHDAY || Number(p.BYMONTHDAY) === day) && (!p.BYMONTH || Number(p.BYMONTH) === month)) return "yearly";
  return "custom";
}

function initial(inst: OrgInstance | undefined, prefill: { start: string; end: string } | undefined, calendarId: string): Form {
  if (inst) {
    const s = inst.allDay && inst.startDate ? { date: inst.startDate, time: "09:00" } : partsOf(inst.start);
    const e = inst.allDay && inst.endDate ? { date: addDays(inst.endDate, -1), time: "10:00" } : partsOf(inst.end);
    return {
      title: inst.title,
      calendarId: inst.calendarId,
      allDay: inst.allDay,
      startDate: s.date,
      startTime: s.time,
      endDate: e.date < s.date ? s.date : e.date,
      endTime: e.time,
      repeat: repeatOf(inst.rrule, s.date),
      location: inst.location ?? "",
      description: inst.description ?? "",
      showAs: inst.free ? "free" : "busy",
    };
  }
  const now = new Date();
  const s = prefill ? partsOf(prefill.start) : partsOf(new Date(Math.ceil((now.getTime() + 1) / 3600000) * 3600000).toISOString());
  const e = prefill ? partsOf(prefill.end) : partsOf(new Date(Date.parse(instant(s.date, s.time)) + 3600000).toISOString());
  return { title: "", calendarId, allDay: false, startDate: s.date, startTime: s.time, endDate: e.date, endTime: e.time, repeat: "none", location: "", description: "", showAs: "busy" };
}

const payload = (f: Form, tz: string) => ({
  title: f.title,
  calendarId: f.calendarId,
  allDay: f.allDay,
  start: f.allDay ? f.startDate : instant(f.startDate, f.startTime),
  end: f.allDay ? (f.endDate ? addDays(f.endDate, 1) : "") : instant(f.endDate, f.endTime),
  timeZone: tz,
  location: f.location,
  description: f.description,
  showAs: f.showAs,
  repeat: f.repeat,
});

type Failure = Extract<EventActionResult, { ok: false }>;
const providerName = (r: Failure) => ("provider" in r && r.provider ? PROVIDER[r.provider] : "your calendar");

/** Fixed, provider-agnostic copy for a failed write (never provider text). */
function ErrorNote({ r }: { r: Failure }) {
  if ("errors" in r) return null;
  const name = providerName(r);
  if (r.error === "changed")
    return null; // rendered by the caller (needs Reload)
  if (r.error === "reconnect")
    return (
      <p role="alert" className="text-[13px] text-red">
        {name} needs reconnecting.{" "}
        <a href={CONNECTIONS} className="text-indigo-text underline">
          Reconnect
        </a>
      </p>
    );
  const reason = r.error === "read_only" ? "This calendar is read-only" : r.error === "not_found" ? "The event no longer exists" : `${name} didn't accept the change`;
  return (
    <p role="alert" className="text-[13px] text-red">
      Couldn&apos;t save this event. {reason}. Nothing was changed.
    </p>
  );
}

export function EventDialog({
  mode,
  instance,
  prefill,
  calendars,
  defaultCalendarId,
  onClose,
  onSaving,
  onDelete,
}: {
  mode: "create" | "edit";
  instance?: OrgInstance;
  prefill?: { start: string; end: string };
  calendars: CalendarDTO[];
  defaultCalendarId: string | null;
  onClose(): void;
  onSaving(key: string | null): void;
  onDelete?(i: OrgInstance): void;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const edit = mode === "edit" && instance;
  const writable = calendars.filter((c) => c.enabled && c.access !== "reader");
  const [base, setBase] = useState<Form>(() => initial(edit ? instance : undefined, prefill, defaultCalendarId ?? writable[0]?.id ?? ""));
  const [f, setF] = useState<Form>(base);
  const [etag, setEtag] = useState(instance?.etag ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fail, setFail] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState<"form" | "scope">("form");
  // what to do once unsaved changes are discarded (close, or go on to delete)
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const [reloadAsk, setReloadAsk] = useState(false);
  const formId = "event-form";
  const dirty = JSON.stringify(f) !== JSON.stringify(base);
  const tz = isTimeZone(instance?.tz) ? instance.tz : TZ;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const cal = writable.find((c) => c.id === f.calendarId) ?? calendars.find((c) => c.id === f.calendarId);
  const cat = cal?.category ?? null;

  const leave = (then: () => void) => (dirty ? setDiscard(() => then) : then());
  const close = () => leave(onClose);

  // moving the start keeps the duration (End defaults to Start + 1 h)
  const setStart = (date: string, time: string) =>
    setF((x) => {
      if (x.allDay) return { ...x, startDate: date, endDate: x.endDate < date ? date : x.endDate };
      const oldS = Date.parse(instant(x.startDate, x.startTime));
      const oldE = Date.parse(instant(x.endDate, x.endTime));
      const newS = Date.parse(instant(date, time));
      if (!Number.isFinite(oldS) || !Number.isFinite(oldE) || !Number.isFinite(newS)) return { ...x, startDate: date, startTime: time };
      const end = partsOf(new Date(newS + Math.max(oldE - oldS, 15 * 60000)).toISOString());
      return { ...x, startDate: date, startTime: time, endDate: end.date, endTime: end.time };
    });

  const submit = () => {
    setFail(null);
    const v = eventInput.safeParse(payload(f, tz));
    if (!v.success) {
      const e: Record<string, string> = {};
      for (const i of v.error.issues) e[String(i.path[0] ?? "form")] ??= i.message;
      setErrors(e);
      return;
    }
    setErrors({});
    if (!edit) return void save("this");
    if (!dirty) return onClose();
    if (instance.recurring) return setStep("scope");
    void save("this");
  };

  const save = async (scope: Scope) => {
    setStep("form");
    setPending(true);
    if (edit) onSaving(instance.key);
    let r: EventActionResult;
    try {
      const body = payload(f, tz);
      // An untouched repeat keeps the stored rule (UNTIL/COUNT/EXDATE stay as they are); only a change rewrites it.
      if (edit && instance.recurring && f.repeat === base.repeat) body.repeat = "custom";
      r = edit
        ? await updateEventAction({ eventId: instance.eventId, etag, scope, instanceStart: instance.instanceStart, ...body })
        : await createEventAction(body);
    } catch {
      r = { ok: false, error: "provider", provider: null };
    }
    setPending(false);
    onSaving(null);
    if (r.ok) {
      toast(r.overlaps ? `Saved. It overlaps ${r.overlaps.title} at ${formatHM(new Date(r.overlaps.start))}.` : edit ? "Event updated" : `Event added to ${r.calendarName}`);
      router.refresh();
      return onClose();
    }
    if ("errors" in r) return setErrors(r.errors);
    setFail(r);
  };

  const reload = async () => {
    if (!instance) return;
    // A recurring occurrence reloads itself, not the series master (whose times would move it on save).
    const r = await reloadEventAction(instance.eventId, instance.recurring ? instance.instanceStart : null).catch(() => null);
    if (!r) return void setFail({ ok: false, error: "provider", provider: null });
    if (!r.ok) return void setFail({ ok: false, error: "not_found", provider: null });
    const next = { ...initial({ ...instance, ...r, startDate: r.allDay ? r.start : null, endDate: r.allDay ? r.end : null, free: r.showAs === "free" } as OrgInstance, undefined, ""), calendarId: instance.calendarId };
    setBase(next);
    setF(next);
    setEtag(r.etag);
    setFail(null);
    setReloadAsk(false);
  };

  if (step === "scope" && instance)
    return <ScopeDialog kind="edit" onConfirm={(s) => void save(s)} onCancel={() => setStep("form")} />;

  const offset = tzLabel(new Date(instant(f.startDate, "12:00") || 0));
  const changed = fail && "error" in fail && fail.error === "changed";
  return (
    <Dialog
      open
      width={520}
      sheet
      title={edit ? "Edit event" : "New event"}
      onClose={close}
      footerStart={
        edit && !instance.readOnly ? (
          <Button variant="destructive" size="sm" onClick={() => leave(() => onDelete?.(instance))} disabled={pending}>
            Delete event
          </Button>
        ) : undefined
      }
      actions={
        <>
          <Button variant="ghost" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            {pending ? "Saving…" : edit ? "Save changes" : "Add event"}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto px-0.5 py-0.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Title" error={errors.title}>
          <Input value={f.title} maxLength={200} autoFocus onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Calendar" error={errors.calendarId}>
          <Select value={f.calendarId} disabled={!!edit} onChange={(e) => set("calendarId", e.target.value)}>
            {!cal && <option value="">Choose a calendar</option>}
            {(edit && !writable.some((c) => c.id === f.calendarId) && cal ? [cal, ...writable] : writable).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.category ? ` · ${CATEGORY[c.category].label}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        {cat && (
          <p className="-mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-text-3">
            <span className="size-2 rounded-2" style={{ background: CATEGORY[cat].color }} />
            {CATEGORY[cat].label}
          </p>
        )}
        <Checkbox label="All day" checked={f.allDay} onChange={(e) => set("allDay", e.target.checked)} />
        <div className="grid gap-3 tab:grid-cols-2">
          <Field label="Start date" error={errors.start}>
            <Input type="date" value={f.startDate} onChange={(e) => setStart(e.target.value, f.startTime)} />
          </Field>
          {!f.allDay && (
            <Field label="Start time">
              <Input type="time" step={900} value={f.startTime} onChange={(e) => setStart(f.startDate, e.target.value)} />
            </Field>
          )}
          <Field label="End date" error={errors.end}>
            <Input type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </Field>
          {!f.allDay && (
            <Field label="End time">
              <Input type="time" step={900} value={f.endTime} onChange={(e) => set("endTime", e.target.value)} />
            </Field>
          )}
        </div>
        <p className="-mt-1 font-mono text-[11px] text-text-3">{tz === TZ ? `Sydney (${offset})` : `Time zone: ${tz} (shown in Sydney time)`}</p>
        {f.repeat === "custom" ? (
          <p className="text-[13px] text-text-2">Custom repeat (edit in Google Calendar or iCloud)</p>
        ) : (
          <Field label="Repeat">
            <Select value={f.repeat} onChange={(e) => set("repeat", e.target.value as Repeat)}>
              <option value="none">Does not repeat</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week on {SHORT[dow(f.startDate)] ?? ""}</option>
              <option value="monthly">Every month on day {Number(f.startDate.slice(8)) || ""}</option>
              <option value="yearly">Every year</option>
            </Select>
          </Field>
        )}
        <Field label="Location" error={errors.location}>
          <Input value={f.location} maxLength={300} onChange={(e) => set("location", e.target.value)} />
        </Field>
        <Field label="Description" error={errors.description}>
          <Textarea rows={4} value={f.description} maxLength={8000} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label="Show as">
          <Select value={f.showAs} onChange={(e) => set("showAs", e.target.value as "busy" | "free")}>
            <option value="busy">Busy</option>
            <option value="free">Free</option>
          </Select>
        </Field>
        {errors.form && <p className="text-[12.5px] text-red">{errors.form}</p>}
      </form>
      {changed && fail && (
        <div role="alert" className="mt-3 flex flex-col gap-2 rounded-9 border border-[rgba(232,184,106,.3)] bg-[rgba(232,184,106,.08)] p-3 text-[13px] text-amber">
          <p>This event changed in {providerName(fail)} since you opened it.</p>
          {reloadAsk ? (
            <div className="flex items-center gap-2">
              <span>Discard my changes?</span>
              <Button size="xs" variant="ghost" onClick={() => setReloadAsk(false)}>
                Keep editing
              </Button>
              <Button size="xs" variant="secondary" onClick={() => void reload()}>
                Reload event
              </Button>
            </div>
          ) : (
            <div>
              <Button size="xs" variant="secondary" onClick={() => (dirty ? setReloadAsk(true) : void reload())}>
                Reload event
              </Button>
            </div>
          )}
        </div>
      )}
      {fail && !changed && (
        <div className="mt-3">
          <ErrorNote r={fail} />
        </div>
      )}
      {discard && (
        <div role="alert" className="mt-3 flex items-center gap-2 rounded-9 border border-[rgba(232,184,106,.3)] bg-[rgba(232,184,106,.08)] p-3 text-[13px] text-amber">
          <span className="mr-auto">Discard changes?</span>
          <Button size="xs" variant="ghost" onClick={() => setDiscard(null)}>
            Keep editing
          </Button>
          <Button size="xs" variant="secondary" onClick={discard}>
            Discard
          </Button>
        </div>
      )}
    </Dialog>
  );
}

/** Delete: scope step for repeating events, then the confirm dialog. */
export function DeleteFlow({ instance, calendars, onClose }: { instance: OrgInstance; calendars: CalendarDTO[]; onClose(deleted: boolean): void }) {
  const router = useRouter();
  const { toast } = useShell();
  const [scope, setScope] = useState<Scope | null>(instance.recurring ? null : "this");
  const [pending, setPending] = useState(false);
  const [fail, setFail] = useState<Failure | null>(null);

  if (!scope) return <ScopeDialog kind="delete" onConfirm={setScope} onCancel={() => onClose(false)} />;

  const account = calendars.find((c) => c.id === instance.calendarId)?.account;
  const body = instance.recurring
    ? `This removes ${scope === "this" ? "this event" : scope === "following" ? "this and following events" : "the whole series"} from ${instance.calendarName}.`
    : `This removes the event from ${instance.calendarName}${account ? ` (${account})` : ""}. It also disappears from your other devices.`;

  const run = async () => {
    setPending(true);
    let r: EventActionResult;
    try {
      r = await deleteEventAction({ eventId: instance.eventId, etag: instance.etag, scope, instanceStart: instance.instanceStart });
    } catch {
      r = { ok: false, error: "provider", provider: null };
    }
    setPending(false);
    if (r.ok) {
      toast("Event deleted");
      router.refresh();
      return onClose(true);
    }
    setFail(r);
  };

  return (
    <Dialog
      open
      title={`Delete "${instance.title}"?`}
      onClose={() => onClose(false)}
      initialFocus={() => document.querySelector<HTMLElement>("[data-cancel-delete]")}
      actions={
        <>
          <Button data-cancel-delete variant="ghost" onClick={() => onClose(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" loading={pending} onClick={() => void run()}>
            DELETE EVENT
          </Button>
        </>
      }
    >
      <p>{body}</p>
      {fail && "error" in fail && fail.error === "changed" ? (
        <p role="alert" className="mt-3 text-[13px] text-amber">
          This event changed in {providerName(fail)} since you opened it. Close this and open it again to see the latest.
        </p>
      ) : fail ? (
        <div className="mt-3">
          <ErrorNote r={fail} />
        </div>
      ) : null}
    </Dialog>
  );
}
