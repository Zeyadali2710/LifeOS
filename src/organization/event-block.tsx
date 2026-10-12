"use client";

import { border, CATEGORY, fill } from "@/lib/calendar-categories";
import { Icon } from "@/ui/icon";
import { hmOf, shortDate } from "./layout";
import type { OrgInstance } from "./organization-view";

const FALLBACK = CATEGORY.work.color; // uncategorised events use the Work hue

export function EventBlock({
  inst,
  top,
  height,
  timeLine,
  lane,
  lanes,
  past,
  saving = false,
  onOpen,
}: {
  inst: OrgInstance;
  top: number;
  height: number;
  timeLine: string;
  lane: number;
  lanes: number;
  past: boolean;
  saving?: boolean;
  onOpen(inst: OrgInstance): void;
}) {
  const cat = inst.category;
  const color = cat ? CATEGORY[cat].color : FALLBACK;
  const conflict = inst.conflictWith.length > 0;
  const tentative = inst.status === "tentative";
  const dashed = tentative || inst.free;
  const tall = height >= 40;
  const label = [
    inst.title,
    `${shortDate(inst.start)} ${hmOf(inst.start)} to ${hmOf(inst.end)}`,
    cat ? CATEGORY[cat].label : "Uncategorised",
    inst.calendarName,
  ].join(", ") + (tentative ? ", Tentative" : "") + (conflict ? ", Conflict" : "");
  const w = 100 / lanes;
  return (
    <li className="contents">
      <button
        type="button"
        aria-label={label}
        onClick={() => onOpen(inst)}
        className="pointer-events-auto absolute flex animate-[lo-in_.2s_ease-out] flex-col gap-0.5 overflow-hidden rounded-7 px-[7px] py-[5px] text-left text-text hover:brightness-[1.15] focus-visible:outline-2 focus-visible:outline-accent max-tab:before:absolute max-tab:before:-inset-1.5 max-tab:before:content-['']"
        style={{
          top,
          height,
          opacity: saving ? 0.7 : undefined,
          left: `calc(${lane * w}% + 4px)`,
          width: `calc(${w}% - 8px)`,
          background: past ? color + "14" : fill(cat ?? "work"),
          borderWidth: 1,
          borderStyle: dashed ? "dashed" : "solid",
          borderColor: tentative ? "var(--text-3)" : past ? color + "2a" : border(cat ?? "work"),
          borderLeft: conflict ? "2px solid var(--red)" : undefined,
        }}
      >
        <span className="flex items-center gap-[5px] text-[12px] leading-[1.25] font-medium">
          {conflict ? (
            <Icon name="event_busy" size={13} className="shrink-0 text-red" />
          ) : (
            <span className="size-1.5 shrink-0 rounded-2" style={{ background: color }} />
          )}
          <span className="truncate">{inst.title}</span>
          {inst.recurring && <Icon name="repeat" size={12} className="shrink-0 text-text-3" />}
        </span>
        {tall && (
          <span className="truncate text-[10px] text-text-2">
            {timeLine}
            {inst.free ? " · Free" : ""}
            {conflict ? " · Conflict" : ""}
          </span>
        )}
      </button>
    </li>
  );
}
