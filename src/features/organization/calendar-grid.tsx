"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { CATEGORY } from "@/lib/calendar-categories";
import { clock, sydneyInstant, sydneyParts } from "@/server/time";
import { Button } from "@/ui/button";
import { EmptyState } from "@/ui/feedback";
import { Icon } from "@/ui/icon";
import { catStyle } from "./categories";
import { blockGeometry, earlierCount, HOUR_PX, hmOf, packLanes, shortDate, START_HOUR } from "./grid";
import type { OrgInstance } from "./organization-view";
import s from "./organization.module.css";

const parts = (ymd: string) => ymd.split("-").map(Number) as [number, number, number];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dow = (ymd: string) => {
  const [y, m, d] = parts(ymd);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const fullDate = (ymd: string) => {
  const [y, m, d] = parts(ymd);
  return new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
};
const bounds = (ymd: string) => {
  const [y, m, d] = parts(ymd);
  return { from: sydneyInstant(y, m, d, 0).getTime(), to: sydneyInstant(y, m, d + 1, 0).getTime() };
};
export const touches = (i: OrgInstance, ymd: string) => {
  const b = bounds(ymd);
  const st = Date.parse(i.start);
  return st < b.to && Math.max(Date.parse(i.end), st + 1) > b.from;
};

function label(i: OrgInstance) {
  return (
    [i.title, `${shortDate(i.start)} ${hmOf(i.start)} to ${hmOf(i.end)}`, i.category ? CATEGORY[i.category].label : "Uncategorised", i.calendarName].join(", ") +
    (i.status === "tentative" ? ", Tentative" : "") +
    (i.conflictWith.length ? ", Conflict" : "")
  );
}

/** Day / week time grid: hour lines, packed event blocks, now line, keyboard slot cursor (↑↓ ← → ↵ creates). */
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
  selectedKey,
  onOpen,
  onOpenDay,
  onNewEvent,
  onSettings,
}: {
  days: string[];
  instances: OrgInstance[];
  total: number;
  today: string;
  nowMs: number;
  view: "day" | "week";
  canWrite: boolean;
  pending: boolean;
  saving?: string | null;
  selectedKey: string | null;
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

  // Initial scroll: now (today) or 08:00 sits ~120 px from the top; once per range so a refresh keeps the scroll.
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
  const template = `48px repeat(${days.length}, minmax(0, 1fr))`;
  const minW = view === "week" ? 720 : 280;

  const slot = (ymd: string, min: number) => {
    const [y, m, d] = parts(ymd);
    const start = sydneyInstant(y, m, d, Math.floor(min / 60), min % 60);
    return { start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString() };
  };
  const newAt = (ymd: string, min: number) => canWrite && onNewEvent(slot(ymd, min));
  const colKey = (e: KeyboardEvent, col: number) => {
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
    <div style={{ position: "relative" }} className={pending ? s.dim : undefined} aria-busy={pending || undefined}>
      <div ref={scroller} className={s.scroller}>
        <div style={{ minWidth: minW }}>
          <div className={s.head} style={{ gridTemplateColumns: template }}>
            <span />
            {days.map((d) => (
              <button key={d} type="button" aria-label={`${fullDate(d)}, open day`} className={[s.dayHead, d === today && s.today].filter(Boolean).join(" ")} onClick={() => onOpenDay(d)}>
                {DOW[dow(d)]} {parts(d)[2]}
                {d === today ? " · today" : ""}
              </button>
            ))}
          </div>

          {allDay.length > 0 && (
            <div className={s.allDayRow} style={{ gridTemplateColumns: template }}>
              <span className={s.allDayLabel}>ALL DAY</span>
              {days.map((d) => (
                <ul key={d} className={s.allDayCol}>
                  {allDay
                    .filter((i) => touches(i, d))
                    .map((i) => {
                      const c = catStyle(i.category);
                      return (
                        <li key={i.key}>
                          <button type="button" className={s.allDayItem} style={{ background: c.fill, borderColor: c.line }} aria-label={`${i.title}, all day, ${i.calendarName}`} onClick={() => onOpen(i)}>
                            {i.title}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              ))}
            </div>
          )}

          {earlier > 0 && !early && (
            <div className={s.earlier}>
              <button type="button" className={s.earlierBtn} onClick={() => setEarly(true)}>
                {earlier} earlier
              </button>
            </div>
          )}

          <div className={s.grid} style={{ gridTemplateColumns: template, height: bodyH }}>
            <div className={s.hours} aria-hidden="true">
              {Array.from({ length: 24 - startHour }, (_, i) => (
                <span key={i} className={s.hour} style={{ top: i * HOUR_PX }}>
                  {startHour + i}:00
                </span>
              ))}
            </div>
            {days.map((d, col) => {
              const geo = timed
                .filter((i) => touches(i, d))
                .flatMap((i) => {
                  const g = blockGeometry(i.start, i.end, d, startHour);
                  return g ? [{ i, g }] : [];
                });
              const lanes = packLanes(geo.map(({ i }) => ({ key: i.key, start: i.start, end: i.end })));
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
                  className={[s.col, isToday && s.today].filter(Boolean).join(" ")}
                  onKeyDown={(e) => colKey(e, col)}
                  onBlur={(e) => e.target === e.currentTarget && setCursor(null)}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    newAt(d, Math.floor(((y / HOUR_PX + startHour) * 60) / 30) * 30);
                  }}
                >
                  {Array.from({ length: 24 - startHour }, (_, i) => (
                    <span key={i} className={s.line} style={{ top: i * HOUR_PX }} />
                  ))}
                  <ul className={s.events}>
                    {geo
                      .sort((a, b) => Date.parse(a.i.start) - Date.parse(b.i.start))
                      .map(({ i, g }) => {
                        const c = catStyle(i.category);
                        const ln = lanes[i.key]!;
                        const w = 100 / ln.lanes;
                        const conflict = i.conflictWith.length > 0;
                        return (
                          <li key={i.key} style={{ display: "contents" }}>
                            <button
                              type="button"
                              aria-label={label(i)}
                              className={[s.ev, selectedKey === i.key && s.selected, Date.parse(i.end) < now && s.past, (i.status === "tentative" || i.free) && s.dashed, conflict && s.conflict].filter(Boolean).join(" ")}
                              style={{ top: g.top, height: g.height, left: `calc(${ln.lane * w}% + 3px)`, width: `calc(${w}% - 6px)`, background: c.fill, borderColor: c.line, opacity: saving === i.key ? 0.6 : undefined }}
                              onClick={() => onOpen(i)}
                            >
                              <span className={s.evTitle}>
                                {conflict && <Icon name="event_busy" size={12} style={{ color: "var(--status-failed)" }} />}
                                <span>{i.title}</span>
                                {i.recurring && <Icon name="repeat" size={11} style={{ color: "var(--ink-3)" }} />}
                              </span>
                              {g.height >= 34 && (
                                <span className={s.evTime}>
                                  {g.timeLine}
                                  {i.free ? " · Free" : ""}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                  {cursor?.col === col && <div aria-hidden="true" className={s.cursor} style={{ top: (cursor.min / 60 - startHour) * HOUR_PX }} />}
                  {isToday && nowH >= startHour && (
                    <div className={s.now} style={{ top: (nowH - startHour) * HOUR_PX }}>
                      <span className="sr-only">Current time {clock(new Date(now))}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {total === 0 && (
        <div className={s.emptyGrid}>
          <div className={s.emptyCard}>
            <EmptyState
              icon="event_note"
              title="A clear week"
              body={`No events in this ${view}. Add one, or check which calendars are syncing in Settings.`}
              action={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  {canWrite && (
                    <Button variant="primary" icon="add" onClick={() => onNewEvent()}>
                      New event
                    </Button>
                  )}
                  <Button onClick={onSettings}>Calendar settings</Button>
                </div>
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

const HEAD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Month grid: 6 weeks, roving focus (arrows, Home/End, PageUp/PageDown changes month). */
export function MonthGrid({
  days,
  month,
  instances,
  today,
  selected,
  onOpenDay,
  onMonth,
}: {
  days: string[];
  month: string;
  instances: OrgInstance[];
  today: string;
  selected: string;
  onOpenDay(ymd: string): void;
  onMonth(dir: -1 | 1): void;
}) {
  const [focus, setFocus] = useState(Math.max(0, days.indexOf(selected)));
  const root = useRef<HTMLDivElement>(null);
  const move = (to: number) => {
    const n = Math.min(days.length - 1, Math.max(0, to));
    setFocus(n);
    root.current?.querySelector<HTMLElement>(`[data-i="${n}"]`)?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const k = e.key;
    if (k === "ArrowRight") move(i + 1);
    else if (k === "ArrowLeft") move(i - 1);
    else if (k === "ArrowDown") move(i + 7);
    else if (k === "ArrowUp") move(i - 7);
    else if (k === "Home") move(i - (i % 7));
    else if (k === "End") move(i - (i % 7) + 6);
    else if (k === "PageUp") onMonth(-1);
    else if (k === "PageDown") onMonth(1);
    else return;
    e.preventDefault();
  };
  return (
    <div ref={root} role="group" aria-label="Month" className={s.month}>
      {HEAD.map((h) => (
        <span key={h} aria-hidden="true" className={s.mhead}>
          {h}
        </span>
      ))}
      {days.map((ymd, i) => {
        const items = instances.filter((x) => touches(x, ymd)).sort((a, b) => Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start));
        const inMonth = ymd.slice(0, 7) === month;
        const isToday = ymd === today;
        const conflict = items.some((x) => x.conflictWith.length > 0);
        return (
          <button
            key={ymd}
            type="button"
            data-i={i}
            tabIndex={focus === i ? 0 : -1}
            aria-current={isToday ? "date" : undefined}
            aria-label={`${fullDate(ymd)}, ${items.length} ${items.length === 1 ? "event" : "events"}${conflict ? ", has a conflict" : ""}`}
            className={[s.mcell, !inMonth && s.out, isToday && s.today].filter(Boolean).join(" ")}
            onFocus={() => setFocus(i)}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onOpenDay(ymd)}
          >
            <span className={s.mnum} style={{ fontWeight: isToday ? 600 : 400 }} aria-hidden="true">
              {Number(ymd.slice(8))}
            </span>
            {items.slice(0, 2).map((x) => (
              <span key={x.key} className={s.mitem} style={{ borderColor: catStyle(x.category).line }} aria-hidden="true">
                {x.allDay ? "" : `${clock(new Date(x.start))} `}
                {x.title}
              </span>
            ))}
            {items.length > 2 && (
              <span className={s.mmore} aria-hidden="true">
                +{items.length - 2} more
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
