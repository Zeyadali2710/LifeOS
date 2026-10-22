"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarDTO, ConflictDTO, PlanItemDTO } from "@/lib/calendar-types";
import { addPlanItemAction, type EventActionResult } from "@/server/calendar-actions";
import { clock, sydneyParts } from "@/server/time";
import { useShell } from "@/features/shell/shell-provider";
import { Button, IconButton } from "@/ui/button";
import { Select } from "@/ui/controls";
import { Status } from "@/ui/display";
import { Section } from "@/ui/layout";
import { PixelAvatar } from "@/ui/pixel-avatar";
import { skip, skippedFor, unskip } from "./plan-skips";
import s from "./organization.module.css";

const MAX = 6;
const ymd = (d: Date) => {
  const p = sydneyParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};
const PROVIDER = { google: "Google Calendar", icloud: "iCloud" } as const;

type State = "SUGGESTED" | "ON CALENDAR" | "SKIPPED" | "CONFLICT";


export function TodaysPlanCard({
  plan,
  conflicts,
  calendars,
  defaultCalendarId,
  today,
  freeHours,
  onOpen,
}: {
  plan: { items: PlanItemDTO[]; summary: string; tasksOnly: boolean };
  conflicts: ConflictDTO[];
  calendars: CalendarDTO[];
  defaultCalendarId: string | null;
  /** Sydney date, yyyy-mm-dd */
  today: string;
  /** free hours today, for the empty state */
  freeHours?: number;
  onOpen(key: string): void;
}) {
  const router = useRouter();
  const { toast, openAI } = useShell();
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
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
      const msg = `Added to ${r.calendarName} · ${clock(new Date(r.start))}`;
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
    const hm = start ? clock(start) : "";
    const time = start ? (ymd(start) === today ? hm : `${sydneyParts(start).weekday} ${hm}`) : "";
    const mins = start && end ? Math.round((end.getTime() - start.getTime()) / 60000) : null;
    return (
      <li key={it.id} className={s.plan}>
        <span className={s.planTime}>{time}</span>
        <div>
          <span className={s.planTitle}>{it.title}{mins !== null && !conflict && <span className={s.planNote}>({mins} min)</span>}</span>
          <span className={s.planNote}>{it.why}</span>
          <Status mono tone={conflict ? "failed" : state === "ON CALENDAR" ? "working" : state === "SKIPPED" ? "idle" : "approval"} glyph={conflict ? "▲" : state === "ON CALENDAR" ? "✓" : state === "SKIPPED" ? "–" : "◇"}>{state}</Status>
          <div className={s.planActions}>
            {conflict && <Button size="sm" onClick={() => router.push(`/organization?view=day&date=${today}`)}>Open day</Button>}
            {state === "SKIPPED" && <Button size="sm" variant="text" onClick={() => toggleSkip(it.id, false)}>Undo</Button>}
            {pending && start && <>
              <Button size="sm" disabled={busy !== null} aria-label={`Add to calendar: ${it.title} at ${hm}`} onClick={() => writable.length > 1 ? setPicking(picking === it.id ? null : it.id) : void add(it)}>{busy === it.id ? "Adding…" : "Add to calendar"}</Button>
              <Button size="sm" variant="text" onClick={() => toggleSkip(it.id, true)}>Skip</Button>
              {picking === it.id && <><Select label="Calendar" value={pick} onChange={e => setPick(e.target.value)}>{writable.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select><Button size="sm" disabled={busy !== null} onClick={() => void add(it, pick)}>Add</Button></>}
            </>}
          </div>
        </div>
      </li>
    );
  };

  const head = plan.items.slice(0, MAX);
  const rest = plan.items.slice(MAX);
  const empty = plan.items.length === 0 && conflicts.length === 0;

  return (
    <Section id="o-plan" label="Today's plan" meta={<span className={s.planMeta}><PixelAvatar agent="organization" size={20} />Suggested by Organization<IconButton small icon="refresh" label="Refresh plan" onClick={() => router.refresh()} /></span>}>
      {conflicts.map(c => {
        const key = `${c.a}:${c.b}`;
        if (ignored.has(key)) return null;
        return <div role="alert" className={s.planConflict} key={key}>
          <span className={s.conflictText}>▲ <button className={s.evLinkBtn} onClick={() => onOpen(c.a)}>{c.aTitle}</button> overlaps <button className={s.evLinkBtn} onClick={() => onOpen(c.b)}>{c.bTitle}</button> · {clock(new Date(c.start))}–{clock(new Date(c.end))}</span>
          <div className={s.planActions}><Button size="sm" onClick={() => openAI(`Ask Organization to propose a fix for the calendar conflict between “${c.aTitle}” (${c.a}) and “${c.bTitle}” (${c.b}) at ${c.start}–${c.end}. Find a free slot and propose moving one event, then wait for my approval.`)}>Propose a fix</Button><Button size="sm" variant="ghost" onClick={() => setIgnored(v => new Set(v).add(key))}>Keep both</Button></div>
        </div>;
      })}
      {empty ? <><p className={s.planTitle}>All clear for today.</p><p className={s.note}>{freeHours === undefined ? "Nothing is due. Add a task to plan around it." : `Nothing is due and you have ${freeHours} free hours. Add a task to plan around it.`}</p></> : <>
        <p className={s.note}>{plan.summary}</p>
        <ul className={s.list}>{head.map(row)}</ul>
        {rest.length > 0 && <details><summary className={s.note}>Show {rest.length} more</summary><ul className={s.list}>{rest.map(row)}</ul></details>}
      </>}
      {plan.tasksOnly && <p className={s.note}>Based on tasks only. Connect a calendar to plan around events.</p>}
      <p className={s.note}>A suggestion only. Moving an event creates an approval for Organization.</p>
      <p role="status" aria-live="polite" className="sr-only">{note}</p>
    </Section>
  );
}
