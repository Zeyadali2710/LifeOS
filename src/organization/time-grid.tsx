"use client";

import { useEffect, useRef, useState } from "react";
import { border, CATEGORY, fill } from "@/lib/calendar-categories";
import { sydneyInstant, sydneyParts } from "@/server/time";
import { Button } from "@/ui/button";
import { EmptyState } from "@/ui/empty-state";
import { Icon } from "@/ui/icon";
import { EventBlock } from "./event-block";
import { blockGeometry, earlierCount, HOUR_PX, packLanes, START_HOUR } from "./layout";
import type { OrgInstance } from "./organization-view";

const parts = (ymd: string) => ymd.split("-").map(Number) as [number, number, number];
const fullDate = (ymd: string) => {
  const [y, m, d] = parts(ymd);
  return new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
};
const dow = (ymd: string) => {
  const [y, m, d] = parts(ymd);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const dayBounds = (ymd: string) => {
  const [y, m, d] = parts(ymd);
  return { from: sydneyInstant(y, m, d, 0).getTime(), to: sydneyInstant(y, m, d + 1, 0).getTime() };
};
const touches = (i: OrgInstance, ymd: string) => {
  const b = dayBounds(ymd);
  const s = Date.parse(i.start);
  return s < b.to && Math.max(Date.parse(i.end), s + 1) > b.from;
};

export function TimeGrid({
  days,
  instances,
  total,
  today,
  nowMs,
  view,
  canWrite,
  pending,
  saving,
  onOpen,
  onOpenDay,
  onNewEvent,
  onSettings,
}: {
  days: string[];
  instances: OrgInstance[]; // already legend-filtered
  total: number; // unfiltered count in range
  today: string;
  nowMs: number;
  view: "day" | "week";
  canWrite: boolean;
  pending: boolean;
  saving?: string | null; // instance key being written
  onOpen(i: OrgInstance): void;
  onOpenDay(ymd: string): void;
  onNewEvent(prefill?: { start: string; end: string }): void;
  onSettings(): void;
}) {
  const [early, setEarly] = useState(false);
  const [now, setNow] = useState(nowMs);
  const [cursor, setCursor] = useState<{ col: number; min: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const cols = useRef<(HTMLDivElement | null)[]>([]);
  const startHour = early ? 0 : START_HOUR;
  const bodyH = (24 - startHour) * HOUR_PX;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // initial scroll: now (today) or 08:00 sits ~120px from the top. Once per range/start hour, so a refresh keeps the scroll.
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    const el = scroller.current;
    const k = `${days[0]}:${days.length}:${startHour}`;
    if (!el || scrolledFor.current === k) return;
    scrolledFor.current = k;
    const p = sydneyParts(new Date(nowMs));
    const h = days.includes(today) ? p.hour + p.minute / 60 : 8;
    el.scrollTop = Math.max(0, (h - startHour) * HOUR_PX - 120);
  }, [days, today, startHour, nowMs]);

  const timed = instances.filter((i) => !i.allDay);
  const allDay = instances.filter((i) => i.allDay);
  const earlier = days.reduce((n, d) => n + earlierCount(timed.filter((i) => touches(i, d)), d), 0);
  const nowP = sydneyParts(new Date(now));
  const nowH = nowP.hour + nowP.minute / 60;
  const nowHM = `${String(nowP.hour).padStart(2, "0")}:${String(nowP.minute).padStart(2, "0")}`;
  const template = `56px repeat(${days.length}, minmax(112px, 1fr))`;
  const minW = view === "week" ? 860 : 0;

  const slot = (ymd: string, min: number) => {
    const [y, m, d] = parts(ymd);
    const start = sydneyInstant(y, m, d, Math.floor(min / 60), min % 60);
    return { start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString() };
  };
  const newAt = (ymd: string, min: number) => canWrite && onNewEvent(slot(ymd, min));

  const colKey = (e: React.KeyboardEvent, col: number) => {
    if (e.target !== e.currentTarget) return;
    const cur = cursor?.col === col ? cursor.min : Math.max(startHour * 60, 9 * 60);
    if (e.key === "ArrowDown") setCursor({ col, min: Math.min(23 * 60 + 30, cur + 30) });
    else if (e.key === "ArrowUp") setCursor({ col, min: Math.max(startHour * 60, cur - 30) });
    else if (e.key === "ArrowRight" && col < days.length - 1) {
      setCursor({ col: col + 1, min: cur });
      cols.current[col + 1]?.focus();
    } else if (e.key === "ArrowLeft" && col > 0) {
      setCursor({ col: col - 1, min: cur });
      cols.current[col - 1]?.focus();
    } else if (e.key === "Enter") newAt(days[col]!, cur);
    else return;
    e.preventDefault();
  };

  return (
    <div className={`relative rounded-14 border border-[rgba(255,255,255,.07)] bg-[#111318] ${pending ? "opacity-60" : ""}`} aria-busy={pending || undefined}>
      <div ref={scroller} className="max-h-[calc(100dvh-240px)] min-h-[420px] overflow-auto rounded-14">
        <div style={{ minWidth: minW }}>
          <div className="sticky top-0 z-[5] grid border-b border-[rgba(255,255,255,.07)] bg-[#111318]" style={{ gridTemplateColumns: template }}>
            <span />
            {days.map((d) => {
              const isToday = d === today;
              const label = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow(d)]!;
              return (
                <button
                  key={d}
                  type="button"
                  aria-label={`${fullDate(d)}, open day`}
                  onClick={() => onOpenDay(d)}
                  className="flex items-baseline gap-2 border-l border-[rgba(255,255,255,.05)] px-2.5 py-2.5 text-left hover:bg-fill-1"
                >
                  <span className={`font-mono text-[10.5px] font-medium tracking-[0.08em] uppercase ${isToday ? "text-indigo-text" : "text-text-3"}`}>{label}</span>
                  <span className={`grid size-7 place-items-center rounded-full text-[17px] font-medium ${isToday ? "bg-indigo text-on-accent" : "text-text"}`}>{parts(d)[2]}</span>
                </button>
              );
            })}
          </div>

          {allDay.length > 0 && (
            <div className="grid border-b border-[rgba(255,255,255,.07)]" style={{ gridTemplateColumns: template }}>
              <span className="px-2 pt-1.5 text-right font-mono text-[10px] text-text-3">ALL DAY</span>
              {days.map((d) => (
                <ul key={d} className="flex min-w-0 flex-col gap-0.5 border-l border-[rgba(255,255,255,.05)] p-1">
                  {allDay
                    .filter((i) => touches(i, d))
                    .map((i) => (
                      <li key={i.key}>
                        <button
                          type="button"
                          onClick={() => onOpen(i)}
                          aria-label={`${i.title}, all day, ${i.category ? CATEGORY[i.category].label : "Uncategorised"}, ${i.calendarName}`}
                          className="flex h-[22px] w-full items-center gap-1 truncate rounded-6 px-1.5 text-left text-[12px] hover:brightness-[1.15]"
                          style={{ background: fill(i.category ?? "work"), border: `1px solid ${border(i.category ?? "work")}` }}
                        >
                          <span className="truncate">{i.title}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              ))}
            </div>
          )}

          {earlier > 0 && !early && (
            <div className="border-b border-[rgba(255,255,255,.05)] px-3 py-1">
              <button type="button" onClick={() => setEarly(true)} className="rounded-full bg-fill-2 px-2.5 py-0.5 font-mono text-[11px] text-text-2 hover:text-text">
                {earlier} earlier
              </button>
            </div>
          )}

          <div className="relative grid" style={{ gridTemplateColumns: template }}>
            <div aria-hidden="true" className="flex flex-col">
              {Array.from({ length: 24 - startHour }, (_, i) => (
                <div key={i} style={{ height: HOUR_PX }} className="-translate-y-1.5 px-2 text-right font-mono text-[10.5px] text-text-3">
                  {String(startHour + i).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {days.map((d, col) => {
              const dayInst = timed.filter((i) => touches(i, d));
              const geo = dayInst.flatMap((i) => {
                const g = blockGeometry(i.start, i.end, d, startHour);
                return g ? [{ i, g }] : [];
              });
              const lanes = packLanes(geo.map(({ i }) => ({ key: i.key, start: i.start, end: i.end })));
              const weekend = dow(d) === 0 || dow(d) === 6;
              const isToday = d === today;
              return (
                <div
                  key={d}
                  ref={(el) => {
                    cols.current[col] = el;
                  }}
                  role="group"
                  aria-label={fullDate(d)}
                  tabIndex={canWrite ? 0 : undefined}
                  onKeyDown={(e) => colKey(e, col)}
                  onBlur={(e) => e.target === e.currentTarget && setCursor(null)}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    newAt(d, Math.floor(((y / HOUR_PX + startHour) * 60) / 30) * 30);
                  }}
                  className="relative border-l border-[rgba(255,255,255,.05)] focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-indigo"
                  style={{
                    height: bodyH,
                    background: weekend ? "rgba(255,255,255,.015)" : undefined,
                    backgroundImage: `repeating-linear-gradient(180deg, rgba(255,255,255,.045) 0 1px, transparent 1px ${HOUR_PX}px)`,
                  }}
                >
                  <ul className="pointer-events-none absolute inset-0 m-0 list-none p-0">
                    {geo
                      .sort((a, b) => Date.parse(a.i.start) - Date.parse(b.i.start))
                      .map(({ i, g }) => (
                        <EventBlock
                          key={i.key}
                          inst={i}
                          top={g.top}
                          height={g.height}
                          timeLine={g.timeLine}
                          lane={lanes[i.key]!.lane}
                          lanes={lanes[i.key]!.lanes}
                          past={Date.parse(i.end) < now}
                          saving={saving === i.key}
                          onOpen={onOpen}
                        />
                      ))}
                  </ul>
                  {cursor?.col === col && (
                    <div aria-hidden="true" className="pointer-events-none absolute right-1 left-1 h-[22px] rounded-6 border border-dashed border-indigo bg-[rgba(139,140,255,.1)]" style={{ top: (cursor.min / 60 - startHour) * HOUR_PX }} />
                  )}
                  {isToday && nowH >= startHour && (
                    <div className="pointer-events-none absolute right-0 left-0 z-[3] border-t-[1.5px] border-indigo" style={{ top: (nowH - startHour) * HOUR_PX }}>
                      <span aria-hidden="true" className="absolute -top-[5px] -left-[5px] size-[9px] animate-[lo-pulse_1.8s_ease-out_infinite] rounded-full bg-indigo motion-reduce:animate-none" />
                      <span className="sr-only">Current time {nowHM}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {total === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
          <div className="pointer-events-auto w-[min(420px,100%)] rounded-14 bg-[#111318]">
            <EmptyState
              icon="event_note"
              title="Nothing scheduled."
              body={`No events in this ${view}. Add one, or check which calendars are syncing in Settings.`}
              action={
                <div className="flex flex-wrap gap-2">
                  {canWrite && (
                    <Button variant="primary" onClick={() => onNewEvent()}>
                      <Icon name="add" size={16} />
                      New event
                    </Button>
                  )}
                  <Button variant="ghost" onClick={onSettings}>
                    Calendar settings
                  </Button>
                </div>
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
