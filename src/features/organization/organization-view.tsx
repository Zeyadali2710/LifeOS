"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import type { ReactNode } from "react";
import type { CategoryKey } from "@/lib/calendar-categories";
import type { InstanceDTO } from "@/lib/calendar-types";
import type { organizationData } from "@/server/calendar/queries";
import { syncCalendarsNowAction } from "@/server/calendar-actions";
import { useLiveEvents } from "@/features/shell/live-provider";
import { useShell } from "@/features/shell/shell-provider";
import { Button, IconButton } from "@/ui/button";
import { Alert, EmptyState, PageState } from "@/ui/feedback";
import { Page, PageHeader } from "@/ui/layout";
import { Status } from "@/ui/display";
import { Segmented } from "@/ui/controls";
import { CATEGORY, CATEGORY_KEYS } from "@/lib/calendar-categories";
import { PAGE_STATES } from "@/features/shell/page-states";
import { TaskDialog } from "@/features/tasks/task-dialog";
import { DeleteFlow, EventDialog } from "./event-dialog";
import { EventDetail } from "./event-detail";
import { TimeGrid, MonthGrid } from "./calendar-grid";
import { TodaysPlanCard } from "./plan-card";
import { TasksCard } from "./tasks-card";
import { rangeLabel, shiftDate } from "./grid";
import { catStyle } from "./categories";
import s from "./organization.module.css";

type ViewKey = "day" | "week" | "month";

export type OrgInstance = InstanceDTO & { repeatText: string | null };
export type OrgData = Omit<Awaited<ReturnType<typeof organizationData>>, "instances"> & { instances: OrgInstance[] };

const CONNECTIONS = "/settings?section=connections";
const REFRESH_MS = 5 * 60000;
const HIDDEN_KEY = "org.hiddenCategories";
const hiddenSubs = new Set<() => void>();
const subscribeHidden = (f: () => void) => {
  hiddenSubs.add(f);
  return () => void hiddenSubs.delete(f);
};
const readHidden = () => {
  try {
    return sessionStorage.getItem(HIDDEN_KEY) ?? "";
  } catch {
    return "";
  }
};

const PROVIDER = {
  google_calendar: { upper: "GOOGLE CALENDAR", name: "Google Calendar", who: "Google" },
  icloud_calendar: { upper: "ICLOUD CALENDAR", name: "iCloud Calendar", who: "Apple" },
} as const;

export function OrganizationView({
  data,
  view,
  hasViewParam,
  date,
  today,
  nowIso,
  eventParam,
}: {
  data: OrgData;
  view: ViewKey;
  hasViewParam: boolean;
  date: string;
  today: string;
  nowIso: string;
  eventParam: string | null;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const [navPending, startNav] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const { state } = data;
  const [dlg, setDlg] = useState<
    { kind: "create"; prefill?: { start: string; end: string } } | { kind: "edit" | "delete"; inst: OrgInstance } | null
  >(null);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // no writable calendar: every New event path goes to Settings instead
  const onNewEvent = useCallback(
    (prefill?: { start: string; end: string }) => (data.calendars.length > 0 ? setDlg({ kind: "create", prefill }) : router.push(CONNECTIONS)),
    [data.calendars.length, router],
  );
  // palette commands: ?new=event|task opens the dialog, then the param is dropped
  const newParam = useSearchParams().get("new");
  const [taskOpen, setTaskOpen] = useState(false);
  useEffect(() => {
    if (newParam !== "event" && newParam !== "task") return;
    // no writable calendar: onNewEvent pushes to Settings, and a replace here would cancel that push (WR-B04)
    if (newParam === "event" && data.calendars.length === 0) return void router.push(CONNECTIONS);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot URL command, param is dropped right after
    if (newParam === "event") onNewEvent();
    else setTaskOpen(true);
    router.replace(`/organization?view=${view}&date=${date}`);
    // only when the param changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newParam]);
  const onEditEvent = (inst: OrgInstance) => setDlg({ kind: "edit", inst });
  const onDeleteEvent = (inst: OrgInstance) => setDlg({ kind: "delete", inst });

  // The grid stays mounted (dimmed) while navigating; if the focused cell goes away, focus returns to the grid (WR-B11).
  const refocus = useRef(false);
  const go = useCallback(
    (v: ViewKey, d: string) => {
      refocus.current = !!gridRef.current?.contains(document.activeElement);
      startNav(() => router.push(`/organization?view=${v}&date=${d}`));
    },
    [router],
  );
  useEffect(() => {
    if (navPending || !refocus.current) return;
    refocus.current = false;
    const grid = gridRef.current;
    if (!grid || grid.contains(document.activeElement)) return;
    (grid.querySelector<HTMLElement>('[tabindex="0"]') ?? grid).focus();
  }, [navPending]);

  // legend filter: session only
  const hiddenRaw = useSyncExternalStore(subscribeHidden, readHidden, () => "");
  const hidden = useMemo(() => {
    try {
      const raw = JSON.parse(hiddenRaw || "[]") as CategoryKey[];
      return new Set<CategoryKey>(Array.isArray(raw) ? raw : []);
    } catch {
      return new Set<CategoryKey>();
    }
  }, [hiddenRaw]);
  const saveHidden = (s: Set<CategoryKey>) => {
    try {
      sessionStorage.setItem(HIDDEN_KEY, JSON.stringify([...s]));
    } catch {
      /* storage unavailable */
    }
    hiddenSubs.forEach((f) => f());
  };

  // narrow screens default to Day when the URL has no view
  useEffect(() => {
    if (!hasViewParam && window.matchMedia("(max-width: 719px)").matches) router.replace(`/organization?view=day&date=${date}`);
  }, [hasViewParam, date, router]);

  // ?event= opens the detail; an unknown id is dropped with a toast
  const fromParam = eventParam ? (data.instances.find((i) => i.key === eventParam || i.eventId === eventParam) ?? null) : null;
  useEffect(() => {
    if (!eventParam || fromParam) return;
    toast("That event isn't available. It may have been deleted.", "error");
    router.replace(`/organization?view=${view}&date=${date}`);
    // only when the param changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventParam]);

  // live refresh (D-16): debounced, keeps scroll and focus (router.refresh is a soft refresh)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 500);
  }, [router]);
  useLiveEvents("calendar", refresh);
  useLiveEvents("task", refresh);
  useEffect(() => {
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    return () => {
      clearInterval(t);
      clearTimeout(timer.current);
    };
  }, [router]);

  // page-scoped keys: no destructive shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if ((e.target as Element | null)?.closest?.("input,textarea,select,[contenteditable]:not([contenteditable='false'])")) return;
      if (document.querySelector('dialog[open],[role="dialog"]')) return;
      const k = e.key;
      if (k === "[") go(view, shiftDate(view, date, -1));
      else if (k === "]") go(view, shiftDate(view, date, 1));
      else if (k === "t" || k === "T") go(view, today);
      else if (k === "d" || k === "D") go("day", date);
      else if (k === "w" || k === "W") go("week", date);
      else if (k === "m" || k === "M") go("month", date);
      else if ((k === "n" || k === "N") && data.calendars.length > 0) onNewEvent();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, view, date, today, data.calendars.length, onNewEvent]);

  const visible = useMemo(() => data.instances.filter((i) => !i.category || !hidden.has(i.category)), [data.instances, hidden]);
  const sel = (selected ? data.instances.find((i) => i.key === selected) : null) ?? fromParam;
  const closeDetail = () => {
    setSelected(null);
    if (eventParam) router.replace(`/organization?view=${view}&date=${date}`);
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await syncCalendarsNowAction();
      if (r.ok) toast("Calendar sync queued");
      if (!r.ok) toast("Calendar sync failed. Try again.", "error");
    } catch {
      toast("Calendar sync failed. Try again.", "error");
    } finally {
      setSyncing(false);
    }
  };
  const lastSync = state.lastSyncAt ? new Date(state.lastSyncAt) : null;
  const hm = lastSync
    ? new Intl.DateTimeFormat("en-AU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Australia/Sydney" }).format(lastSync)
    : null;

  const rangeText = rangeLabel(view, view === "week" ? data.range.days : date);
  const noCalendars = state.connected && state.syncingCalendars === 0 && data.calendars.length === 0 && data.instances.length === 0;
  const prov = state.reconnect ? PROVIDER[state.reconnect] : null;

  let body: ReactNode;
  if (!state.connected) {
    const copy = PAGE_STATES.organization!.disconnected!;
    body = <PageState inline kind="disconnected" agent="organization" title={copy[0]} body={copy[1]} action={{ label: "Connect a calendar", href: CONNECTIONS }} />;
  } else if (noCalendars) {
    body = (
      <EmptyState
        icon="date_range"
        title="No calendars are syncing."
        body="Choose which calendars to show in Settings. Holiday and birthday calendars are off by default."
        action={<Button onClick={() => router.push(CONNECTIONS)}>Choose calendars</Button>}
      />
    );
  } else if (view === "month") {
    body = (
      <div className={navPending ? s.dim : undefined} aria-busy={navPending || undefined}>
        <MonthGrid
          days={data.range.days}
          month={date.slice(0, 7)}
          instances={visible}
          today={today}
          selected={date}
          onOpenDay={(d) => go("day", d)}
          onMonth={(dir) => go("month", shiftDate("month", date, dir))}
        />
      </div>
    );
  } else {
    body = (
      <TimeGrid
        days={data.range.days}
        instances={visible}
        total={data.instances.length}
        today={today}
        nowMs={Date.parse(nowIso)}
        view={view}
        canWrite={data.calendars.length > 0}
        pending={navPending}
        saving={saving}
        selectedKey={sel?.key ?? null}
        onOpen={(i) => setSelected(i.key)}
        onOpenDay={(d) => go("day", d)}
        onNewEvent={onNewEvent}
        onSettings={() => router.push(CONNECTIONS)}
      />
    );
  }

  return (
    <Page label="Organization">
      <PageHeader title="Organization" sub={<>{rangeText} · <Status tone={state.reconnect || state.lastError ? "failed" : state.stale ? "approval" : state.connected ? "working" : "idle"} glyph={state.reconnect || state.lastError ? "×" : state.stale ? "▲" : state.connected ? "✓" : "○"}>{!state.connected ? "No calendar connected" : state.reconnect ? "Reconnect calendar" : state.lastError ? "Sync failed" : state.stale ? "Sync out of date" : `Calendar synced${hm ? ` at ${hm}` : ""}`}</Status>{data.conflicts.length > 0 && <> · {data.conflicts.length} {data.conflicts.length === 1 ? "conflict" : "conflicts"}</>}</>} actions={
        <div className={s.headActions}>
          <div className={s.navBtns}>
            <IconButton className={s.sq} icon="chevron_left" label={`Previous ${view}`} onClick={() => go(view, shiftDate(view, date, -1))} />
            <Button onClick={() => go(view, today)}>Today</Button>
            <IconButton className={s.sq} icon="chevron_right" label={`Next ${view}`} onClick={() => go(view, shiftDate(view, date, 1))} />
          </div>
          <Segmented
            className={s.views}
            role="tablist"
            label="Calendar view (D, W, M)"
            value={view}
            options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]}
            onChange={v => go(v, date)}
          />
          <Button variant="primary" onClick={() => onNewEvent()}>New event</Button>
          <Button onClick={() => setTaskOpen(true)}>New task</Button>
        </div>
      } />
      {state.connected && (prov ? <Alert className={s.alertRow} action={<Button size="sm" onClick={() => router.push(CONNECTIONS)}>Reconnect</Button>}>{prov.name} needs reconnecting. Syncing is paused because {prov.who} rejected the saved access. Your events are not changed.</Alert>
        : state.lastError ? <Alert className={s.alertRow} action={<Button size="sm" disabled={syncing} onClick={() => void sync()}>Sync now</Button>}>Calendar data couldn&apos;t be refreshed{hm ? ` at ${hm}` : ""}. {state.lastError} LifeOS retries every 5 minutes.</Alert>
        : <div className={s.syncRow}>{state.stale && <span>Calendar data may be out of date.{hm ? ` Last synced ${hm}.` : ""}</span>}<Button variant="text" size="sm" disabled={syncing} onClick={() => void sync()}>{syncing ? "Queueing sync…" : "Sync now"}</Button></div>)}
      <a href="#todays-plan" className={s.skipLink}>Skip to today&apos;s plan</a>
      <div className={s.body}>
        <div ref={gridRef} role="region" aria-label="Calendar" tabIndex={-1} className={s.cal}>
          {body}
          {state.connected && <div className={s.legend} aria-label="Event categories">
            {CATEGORY_KEYS.map(k => <button key={k} type="button" className={s.legendItem} aria-pressed={!hidden.has(k)} onClick={() => { const n = new Set(hidden); if (n.has(k)) n.delete(k); else n.add(k); saveHidden(n); }}><span className={s.swatch} style={{ background: catStyle(k).fill, borderColor: catStyle(k).line }} />{CATEGORY[k].label}</button>)}
            {hidden.size > 0 && <Button variant="text" size="sm" onClick={() => saveHidden(new Set())}>Show all</Button>}
            <span className={s.keysHint}>D · W · M switch views</span>
          </div>}
        </div>
        <aside className={s.side}>
          {sel && <EventDetail key={sel.key} inst={sel} all={data.instances} onClose={closeDetail} onOpen={i => setSelected(i.key)} onEdit={i => { closeDetail(); onEditEvent(i); }} onDelete={i => { closeDetail(); onDeleteEvent(i); }} />}
          <div id="todays-plan" tabIndex={-1}><TodaysPlanCard key={today} plan={data.plan} conflicts={data.conflicts} calendars={data.calendars} defaultCalendarId={data.defaultCalendarId} today={today} freeHours={data.header.freeHours} onOpen={key => { const i = data.instances.find(i => i.key === key); if (i) setSelected(i.key); }} /></div>
          <TasksCard tasks={data.tasks.today} allOpen={data.tasks.open} completed={data.tasks.completed} today={today} />
        </aside>
      </div>
      <TaskDialog open={taskOpen} onClose={() => setTaskOpen(false)} />
      {dlg?.kind === "create" && (
        <EventDialog mode="create" prefill={dlg.prefill} calendars={data.calendars} defaultCalendarId={data.defaultCalendarId} onClose={() => setDlg(null)} onSaving={setSaving} />
      )}
      {dlg?.kind === "edit" && (
        <EventDialog
          key={dlg.inst.key}
          mode="edit"
          instance={dlg.inst}
          calendars={data.calendars}
          defaultCalendarId={data.defaultCalendarId}
          onClose={() => setDlg(null)}
          onSaving={setSaving}
          onDelete={onDeleteEvent}
        />
      )}
      {dlg?.kind === "delete" && (
        <DeleteFlow
          instance={dlg.inst}
          calendars={data.calendars}
          onClose={(deleted) => {
            setDlg(null);
            if (deleted) requestAnimationFrame(() => gridRef.current?.focus());
          }}
        />
      )}
    </Page>
  );
}
