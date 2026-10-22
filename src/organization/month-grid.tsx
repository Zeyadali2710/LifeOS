"use client";

import { useRef, useState } from "react";
import { border, CATEGORY, fill } from "@/lib/calendar-categories";
import { sydneyInstant } from "@/server/time";
import { Icon } from "@/legacy-ui/icon";
import { hmOf } from "./layout";
import type { OrgInstance } from "./organization-view";

const FALLBACK = CATEGORY.work.color;
const HEAD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const parts = (ymd: string) => ymd.split("-").map(Number) as [number, number, number];
const longDate = (ymd: string) => {
  const [y, m, d] = parts(ymd);
  return new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
};
const bounds = (ymd: string) => {
  const [y, m, d] = parts(ymd);
  return { from: sydneyInstant(y, m, d, 0).getTime(), to: sydneyInstant(y, m, d + 1, 0).getTime() };
};
const touches = (i: OrgInstance, ymd: string) => {
  const b = bounds(ymd);
  const s = Date.parse(i.start);
  return s < b.to && Math.max(Date.parse(i.end), s + 1) > b.from;
};

export function MonthGrid({
  days,
  month,
  instances,
  today,
  selected,
  onOpenDay,
  onMonth,
}: {
  days: string[]; // 42 days, Monday first
  month: string; // yyyy-mm shown
  instances: OrgInstance[]; // legend-filtered
  today: string;
  selected: string;
  onOpenDay(ymd: string): void;
  onMonth(dir: -1 | 1): void;
}) {
  const start = Math.max(0, days.indexOf(selected));
  const [focus, setFocus] = useState(start);
  const root = useRef<HTMLDivElement>(null);

  const move = (to: number) => {
    const n = Math.min(days.length - 1, Math.max(0, to));
    setFocus(n);
    root.current?.querySelector<HTMLElement>(`[data-i="${n}"]`)?.focus();
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
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

  const rows = Array.from({ length: days.length / 7 }, (_, r) => days.slice(r * 7, r * 7 + 7));
  return (
    <div ref={root} role="grid" aria-label="Month" className="glass-card overflow-hidden rounded-24">
      <div role="row" className="grid grid-cols-7 border-b border-white/[.07]">
        {HEAD.map((h) => (
          <div key={h} role="columnheader" className="border-l border-white/[.05] px-2.5 py-2.5 text-[10.5px] font-medium tracking-[.12em] text-text-3 uppercase first:border-l-0 max-tab:px-0 max-tab:text-center">
            {h}
          </div>
        ))}
      </div>
      {rows.map((row, r) => (
        <div key={r} role="row" className="grid grid-cols-7 border-b border-white/[.05] last:border-b-0">
          {row.map((ymd, c) => {
            const i = r * 7 + c;
            const items = instances
              .filter((x) => touches(x, ymd))
              .sort((a, b) => Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start));
            const conflict = items.some((x) => x.conflictWith.length > 0);
            const inMonth = ymd.slice(0, 7) === month;
            const isToday = ymd === today;
            const label = `${longDate(ymd)}, ${items.length} ${items.length === 1 ? "event" : "events"}${conflict ? ", has a conflict" : ""}`;
            return (
              <div key={ymd} role="gridcell" aria-selected={ymd === selected} className="contents">
                <button
                  type="button"
                  data-i={i}
                  aria-label={label}
                  tabIndex={focus === i ? 0 : -1}
                  onFocus={() => setFocus(i)}
                  onKeyDown={(e) => onKey(e, i)}
                  onClick={() => onOpenDay(ymd)}
                  className={`relative flex min-h-[104px] flex-col gap-1.5 p-2.5 text-left hover:bg-white/[.05] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan max-tab:min-h-[52px] [@media(pointer:coarse)]:min-h-11 max-tab:items-center ${
                    c > 0 ? "border-l border-white/[.05]" : ""
                  } ${isToday || ymd === selected ? "bg-white/[.05]" : ""} ${inMonth ? "" : "opacity-35"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`grid size-6 place-items-center rounded-full text-[12.5px] ${isToday ? "bg-accent-solid font-medium text-white" : "text-text-2"}`}
                  >
                    {Number(ymd.slice(8))}
                  </span>
                  {conflict && <Icon name="event_busy" size={12} className="absolute top-2 right-2 text-red" />}
                  <span aria-hidden="true" className="flex gap-0.5 tab:hidden">
                    {items.slice(0, 3).map((x) => (
                      <span key={x.key} className="size-1.5 rounded-full" style={{ background: x.category ? CATEGORY[x.category].color : FALLBACK }} />
                    ))}
                  </span>
                  <span aria-hidden="true" className="flex w-full flex-col gap-0.5 max-tab:hidden">
                    {items.slice(0, 3).map((x) => (
                      <span key={x.key} className="flex h-[20px] items-center gap-1 rounded-8 px-1.5" style={{ background: fill(x.category ?? "work"), border: `1px solid ${border(x.category ?? "work")}` }}>
                        {!x.allDay && <span className="shrink-0 text-[10px] text-text-2">{hmOf(x.start)}</span>}
                        <span className="truncate text-[11px] text-text">{x.title}</span>
                      </span>
                    ))}
                    {items.length > 3 && <span className="text-[10px] text-text-3">+{items.length - 3} more</span>}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
