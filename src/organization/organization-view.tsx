"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import type { ReactNode } from "react";
import type { CategoryKey } from "@/lib/calendar-categories";
import type { InstanceDTO } from "@/lib/calendar-types";
import type { organizationData } from "@/server/calendar/queries";
import { syncCalendarsNowAction } from "@/server/calendar-actions";
import { useLiveEvents } from "@/shell/live-provider";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { EmptyState } from "@/ui/empty-state";
import { InlineError } from "@/ui/inline-error";
import { CategoryLegend } from "./category-legend";
import { DeleteFlow, EventDialog } from "./event-dialog";
import { EventDetail } from "./event-detail";
import { OrganizationHeader, type ViewKey } from "./header";
import { rangeLabel } from "./layout";
import { MonthGrid } from "./month-grid";
import { TasksCard } from "./tasks-card";
import { TaskDialog } from "./task-dialog";
import { TimeGrid } from "./time-grid";
import { TodaysPlanCard } from "./plan-card";

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

const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
function shift(view: ViewKey, ymd: string, dir: -1 | 1) {
  if (view === "day") return addDays(ymd, dir);
  if (view === "week") return addDays(ymd, 7 * dir);
  const [y, m] = ymd.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10);
}

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
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if ((e.target as Element | null)?.closest?.("input,textarea,select,[contenteditable]:not([contenteditable='false'])")) return;
      if (document.querySelector('[role="dialog"]')) return;
      const k = e.key;
      if (k === "[") go(view, shift(view, date, -1));
      else if (k === "]") go(view, shift(view, date, 1));
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
    try {
      const r = await syncCalendarsNowAction();
      if (!r.ok) toast("Calendar sync failed. Try again.", "error");
    } catch {
      toast("Calendar sync failed. Try again.", "error");
    }
  };
  const lastSync = state.lastSyncAt ? new Date(state.lastSyncAt) : null;
  const hm = lastSync
    ? new Intl.DateTimeFormat("en-AU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Australia/Sydney" }).format(lastSync)
    : null;

  const rangeText = rangeLabel(view, view === "week" ? data.range.days : date);
  const showToday = !(view === "month" ? date.slice(0, 7) === today.slice(0, 7) : data.range.days.includes(today));
  const noCalendars = state.connected && state.syncingCalendars === 0 && data.calendars.length === 0 && data.instances.length === 0;
  const prov = state.reconnect ? PROVIDER[state.reconnect] : null;

  let body: ReactNode;
  if (!state.connected) {
    body = (
      <EmptyState
        icon="calendar_month"
        title="No calendar connected."
        body="Connect Google Calendar or iCloud to see your events here and let LifeOS plan around them. Tasks work without a calendar."
        action={<Button onClick={() => router.push(CONNECTIONS)}>Connect a calendar</Button>}
      />
    );
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
      <div className={navPending ? "opacity-60" : ""} aria-busy={navPending || undefined}>
        <MonthGrid
          days={data.range.days}
          month={date.slice(0, 7)}
          instances={visible}
          today={today}
          selected={date}
          onOpenDay={(d) => go("day", d)}
          onMonth={(dir) => go("month", shift("month", date, dir))}
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
        onOpen={(i) => setSelected(i.key)}
        onOpenDay={(d) => go("day", d)}
        onNewEvent={onNewEvent}
        onSettings={() => router.push(CONNECTIONS)}
      />
    );
  }

  return (
    <div>
      <OrganizationHeader
        headline={data.header.headline}
        lead={data.header.lead}
        view={view}
        rangeText={rangeText}
        showToday={showToday}
        canWrite={data.calendars.length > 0}
        connected={state.connected}
        onNav={(dir) => go(view, shift(view, date, dir))}
        onToday={() => go(view, today)}
        onView={(v) => go(v, date)}
        onNewEvent={() => onNewEvent()}
        onConnect={() => router.push(CONNECTIONS)}
      />
      {state.connected && (
        <>
          <CategoryLegend
            hidden={hidden}
            onToggle={(k) => {
              const n = new Set(hidden);
              if (n.has(k)) n.delete(k);
              else n.add(k);
              saveHidden(n);
            }}
            onShowAll={() => saveHidden(new Set())}
          />
          {prov && state.reconnect ? (
            <div className="mb-4">
              <InlineError
                label={`ERROR · ${prov.upper}`}
                title={`${prov.name} needs reconnecting.`}
                what="Syncing is paused."
                why={`${prov.who} rejected the saved access.`}
                fix="Reconnect in Settings. Your events are not changed."
                action={{ label: "RECONNECT", onClick: () => router.push(CONNECTIONS) }}
              />
            </div>
          ) : state.lastError ? (
            <div className="mb-4">
              <InlineError
                label="ERROR · CALENDAR"
                title="Calendar data couldn't be refreshed."
                what={`The last sync failed${hm ? ` at ${hm}` : ""}.`}
                why={`${state.lastError.replace(/[.\s]+$/, "")}.`}
                fix="LifeOS retries every 5 minutes. You can also sync now."
                action={{ label: "SYNC NOW", onClick: sync }}
              />
            </div>
          ) : state.stale ? (
            <div className="mb-4 flex items-center gap-2 text-[12.5px] text-amber">
              <span>Calendar data may be out of date.{hm ? ` Last synced ${hm}.` : ""}</span>
              <Button variant="ghost" size="xs" onClick={sync}>
                Sync now
              </Button>
            </div>
          ) : null}
        </>
      )}
      <a
        href="#todays-plan"
        className="sr-only focus:not-sr-only focus:mb-3 focus:inline-block focus:rounded-7 focus:bg-fill-2 focus:px-3 focus:py-1.5 focus:text-[13px] focus:text-text"
      >
        Skip to today&apos;s plan
      </a>
      <div className="flex flex-wrap items-start gap-5">
        <div
          ref={gridRef}
          role="region"
          aria-label="Calendar"
          tabIndex={-1}
          className="order-2 min-w-0 flex-[1_1_640px] outline-none tab:order-1"
        >
          {body}
        </div>
        {/* desktop: one column; below 720 the plan sits above the grid and tasks below it */}
        <aside className="order-1 min-w-[280px] flex-[0_1_340px] tab:order-2 max-tab:contents">
          <div id="todays-plan" tabIndex={-1} className="mb-4 outline-none max-tab:order-1 max-tab:w-full max-tab:flex-[1_1_100%]">
            <TodaysPlanCard plan={data.plan} conflicts={data.conflicts} calendars={data.calendars} defaultCalendarId={data.defaultCalendarId} today={today} />
          </div>
          <div className="max-tab:order-3 max-tab:w-full max-tab:flex-[1_1_100%]">
            <TasksCard tasks={data.tasks.today} allOpen={data.tasks.open} completed={data.tasks.completed} today={today} />
          </div>
        </aside>
      </div>
      <TaskDialog open={taskOpen} onClose={() => setTaskOpen(false)} />
      <EventDetail
        key={sel?.key ?? "none"}
        inst={sel}
        all={data.instances}
        onClose={closeDetail}
        onOpen={(i) => setSelected(i.key)}
        onEdit={(i) => {
          closeDetail();
          onEditEvent(i);
        }}
        onDelete={(i) => {
          closeDetail();
          onDeleteEvent(i);
        }}
      />
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
    </div>
  );
}
