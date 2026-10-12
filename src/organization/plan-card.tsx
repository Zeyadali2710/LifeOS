"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarDTO, ConflictDTO, PlanItemDTO } from "@/lib/calendar-types";
import { addPlanItemAction, type EventActionResult } from "@/server/calendar-actions";
import { formatHM, sydneyParts } from "@/server/time";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Disclosure } from "@/ui/disclosure";
import { Select } from "@/ui/field";
import { Icon } from "@/ui/icon";
import { skip, skippedFor, unskip } from "./plan-skips";

const MAX = 6;
const ymd = (d: Date) => {
  const p = sydneyParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};
const PROVIDER = { google: "Google Calendar", icloud: "iCloud" } as const;

type State = "SUGGESTED" | "ON CALENDAR" | "SKIPPED" | "CONFLICT";
const STATE_TONE: Record<State, string> = { SUGGESTED: "text-cyan", "ON CALENDAR": "text-green", SKIPPED: "text-text-3", CONFLICT: "text-red" };

export function TodaysPlanCard({
  plan,
  conflicts,
  calendars,
  defaultCalendarId,
  today,
  freeHours,
}: {
  plan: { items: PlanItemDTO[]; summary: string; tasksOnly: boolean };
  conflicts: ConflictDTO[];
  calendars: CalendarDTO[];
  defaultCalendarId: string | null;
  /** Sydney date, yyyy-mm-dd */
  today: string;
  /** free hours today, for the empty state */
  freeHours?: number;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const writable = calendars.filter((c) => c.enabled && c.access !== "reader");
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [pick, setPick] = useState(defaultCalendarId ?? writable[0]?.id ?? "");
  const [note, setNote] = useState("");

  useEffect(() => {
    try {
      // localStorage is browser-only; reading after mount avoids a hydration mismatch
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSkipped(skippedFor(today, localStorage));
    } catch {
      // storage denied
    }
  }, [today]);

  const add = async (it: PlanItemDTO, calendarId?: string) => {
    if (!it.start || !it.end) return;
    setBusy(it.id);
    setPicking(null);
    const r = await addPlanItemAction({ taskId: it.taskId, start: it.start, end: it.end, calendarId }).catch((): EventActionResult => ({ ok: false, error: "provider", provider: null }));
    setBusy(null);
    if (r.ok) {
      setAdded((s) => new Set(s).add(it.id));
      const msg = `Added to ${r.calendarName} · ${formatHM(new Date(r.start))}`;
      setNote(msg);
      toast(msg);
      router.refresh();
      return;
    }
    const name = "provider" in r && r.provider ? PROVIDER[r.provider] : "your calendar";
    if ("errors" in r) toast("Couldn't save that. Try again.", "error");
    else if (r.error === "reconnect") toast(`${name} needs reconnecting.`, "error");
    else if (r.error === "read_only") toast("There's no calendar to add this to. Choose a writable calendar in Settings.", "error");
    else toast(`Couldn't save that to ${name}. Nothing was changed.`, "error");
  };

  const toggleSkip = (id: string, on: boolean) => {
    try {
      setSkipped(on ? skip(today, id, localStorage) : unskip(today, id, localStorage));
    } catch {
      setSkipped((s) => {
        const n = new Set(s);
        if (on) n.add(id);
        else n.delete(id);
        return n;
      });
    }
  };

  const row = (it: PlanItemDTO) => {
    const conflict = it.kind === "conflict";
    const start = it.start ? new Date(it.start) : null;
    const end = it.end ? new Date(it.end) : null;
    const state: State = conflict ? "CONFLICT" : added.has(it.id) ? "ON CALENDAR" : skipped.has(it.id) ? "SKIPPED" : "SUGGESTED";
    const pending = state === "SUGGESTED";
    const hm = start ? formatHM(start) : "";
    const time = start ? (ymd(start) === today ? hm : `${sydneyParts(start).weekday} ${hm}`) : "";
    const mins = start && end ? Math.round((end.getTime() - start.getTime()) / 60000) : null;
    const dim = state === "SKIPPED";
    return (
      <li key={it.id} className="py-2.5">
        <div className={`rounded-10 px-2 py-1.5 ${dim ? "bg-[rgba(18,18,20,.35)]" : "bg-[rgba(18,18,20,.55)]"}`}>
          <div className="flex items-center gap-2 font-mono text-[11.5px]">
            {time && <span className="text-text-2">{time}</span>}
            <span className="flex-1" />
            <span className={`text-[10.5px] font-semibold tracking-[0.08em] ${STATE_TONE[state]}`}>{state}</span>
          </div>
          <div className="mt-0.5 text-[13.5px] break-words">
            {it.title}
            {mins !== null && !conflict && <span className="text-text-3"> ({mins} min)</span>}
          </div>
          {it.why && <div className="mt-0.5 text-[12.5px] text-text-3">{it.why}</div>}
          {conflict && (
            <div className="mt-1.5">
              <Button size="xs" variant="ghost" onClick={() => router.push(`/organization?view=day&date=${today}`)}>
                Open day
              </Button>
            </div>
          )}
          {state === "SKIPPED" && !conflict && (
            <div className="mt-1.5">
              <Button size="xs" variant="ghost" onClick={() => toggleSkip(it.id, false)}>
                Undo
              </Button>
            </div>
          )}
          {pending && !conflict && start && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Button
                size="xs"
                className="max-tab:h-11"
                loading={busy === it.id}
                aria-label={`Add to calendar: ${it.title} at ${hm}`}
                onClick={() => (writable.length > 1 ? setPicking(picking === it.id ? null : it.id) : void add(it))}
              >
                Add to calendar
              </Button>
              <Button size="xs" variant="ghost" className="max-tab:h-11" onClick={() => toggleSkip(it.id, true)}>
                Skip
              </Button>
              {picking === it.id && (
                <div className="flex w-full items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Select aria-label="Calendar" value={pick} onChange={(e) => setPick(e.target.value)}>
                      {writable.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button size="xs" className="max-tab:h-11" onClick={() => void add(it, pick)}>
                    Add
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </li>
    );
  };

  const head = plan.items.slice(0, MAX);
  const rest = plan.items.slice(MAX);
  const empty = plan.items.length === 0 && conflicts.length === 0;

  return (
    <aside aria-label="Today's plan" className="rounded-14 border border-[rgba(10,132,255,.25)] bg-[linear-gradient(180deg,rgba(10,132,255,.08),rgba(28,28,32,1)_40%)] p-4">
      <div className="flex items-center gap-2">
        <Icon name="auto_awesome" size={16} className="text-cyan" />
        <span aria-hidden className="size-[7px] rotate-45 bg-accent" />
        <h2 className="font-mono text-[11px] font-medium tracking-[.14em] text-cyan">TODAY&apos;S PLAN</h2>
        <span className="font-mono text-[11px] text-text-3" title="Planning window 08:00–22:00">
          {today}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Refresh plan"
          onClick={() => router.refresh()}
          className="grid size-7 place-items-center rounded-6 text-text-3 hover:bg-fill-2 hover:text-text max-tab:size-11"
        >
          <Icon name="refresh" size={16} />
        </button>
      </div>
      {empty ? (
        <div className="mt-3">
          <p className="text-[14px] font-medium">All clear for today.</p>
          <p className="mt-1 text-[12.5px] text-text-2">
            {freeHours === undefined ? "Nothing is due. Add a task to plan around it." : `Nothing is due and you have ${freeHours} free hours. Add a task to plan around it.`}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-2 text-[12.5px] text-text-2">{plan.summary}</p>
          <ul className="mt-1 divide-y divide-[rgba(255,255,255,.05)]">{head.map(row)}</ul>
          {rest.length > 0 && (
            <Disclosure summary={<span className="text-[12.5px] text-text-2">Show {rest.length} more</span>}>
              <ul className="divide-y divide-[rgba(255,255,255,.05)]">{rest.map(row)}</ul>
            </Disclosure>
          )}
        </>
      )}
      {plan.tasksOnly && <p className="mt-2 font-mono text-[11px] text-text-3">Based on tasks only. Connect a calendar to plan around events.</p>}
      {conflicts.length > 0 && (
        <div className="mt-3 border-t border-[rgba(255,255,255,.07)] pt-3">
          <h3 className="font-mono text-[10.5px] tracking-[0.1em] text-red">CONFLICTS</h3>
          <ul className="mt-1">
            {conflicts.map((c) => (
              <li key={`${c.a}:${c.b}`}>
                <button
                  type="button"
                  onClick={() => router.push(`/organization?event=${encodeURIComponent(c.a)}`)}
                  className="flex w-full flex-wrap items-baseline justify-between gap-2 rounded-6 px-1 py-1.5 text-left text-[13px] hover:bg-fill-2 max-tab:min-h-11"
                >
                  <span className="min-w-0 break-words">
                    {c.aTitle} overlaps {c.bTitle}
                  </span>
                  <span className="font-mono text-[11px] text-text-3">
                    {formatHM(new Date(c.start))}–{formatHM(new Date(c.end))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {note}
      </p>
    </aside>
  );
}
