"use client";

import { useState } from "react";
import { CATEGORY } from "@/lib/calendar-categories";
import { isSafeUrl } from "@/lib/safe-url";
import { tzLabel } from "@/server/time";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Icon } from "@/ui/icon";
import { hmOf, shortDate } from "./layout";
import type { OrgInstance } from "./organization-view";

export function EventDetail({
  inst,
  all,
  onClose,
  onOpen,
  onEdit,
  onDelete,
}: {
  inst: OrgInstance | null;
  all: OrgInstance[];
  onClose(): void;
  onOpen(i: OrgInstance): void;
  onEdit(i: OrgInstance): void;
  onDelete(i: OrgInstance): void;
}) {
  const [full, setFull] = useState(false);
  if (!inst) return null;
  const cat = inst.category;
  const when = inst.allDay
    ? `${shortDate(inst.start)} · All day`
    : `${shortDate(inst.start)} · ${hmOf(inst.start)}–${hmOf(inst.end)} ${tzLabel(new Date(inst.start))}`;
  const others = inst.conflictWith.map((k) => all.find((i) => i.key === k)).filter((i): i is OrgInstance => Boolean(i));
  const long = (inst.description?.length ?? 0) > 240 || (inst.description?.split("\n").length ?? 0) > 6;
  return (
    <Dialog
      open
      sheet
      width={420}
      title={inst.title}
      onClose={onClose}
      footerStart={
        !inst.readOnly && (
          <Button variant="destructive" size="sm" onClick={() => onDelete(inst)}>
            Delete
          </Button>
        )
      }
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {!inst.readOnly && (
            <Button variant="secondary" onClick={() => onEdit(inst)}>
              <Icon name="edit" size={15} />
              Edit
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 font-mono text-[11px] text-text-3">
          <span className="size-2 rounded-2" style={{ background: cat ? CATEGORY[cat].color : "#8b8cff" }} />
          {cat ? CATEGORY[cat].label : "Uncategorised"} · {inst.calendarName}
        </div>
        <time dateTime={inst.start} className="text-text">
          {when}
        </time>
        {inst.repeatText && (
          <div className="flex items-center gap-1.5">
            <Icon name="repeat" size={15} />
            {inst.repeatText}
          </div>
        )}
        {inst.location && (
          <div className="flex items-center gap-1.5">
            <Icon name="location_on" size={15} />
            {isSafeUrl(inst.location) ? (
              <a href={inst.location} target="_blank" rel="noopener noreferrer" className="truncate text-indigo-text underline">
                {inst.location}
              </a>
            ) : (
              <span className="break-words">{inst.location}</span>
            )}
          </div>
        )}
        {inst.description && (
          <div>
            <p className={`break-words whitespace-pre-wrap ${full ? "" : "line-clamp-6"}`}>{inst.description}</p>
            {long && (
              <button type="button" aria-expanded={full} onClick={() => setFull(!full)} className="mt-1 text-[12.5px] text-indigo-text">
                {full ? "Show less" : "Show full description"}
              </button>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {inst.status === "tentative" && <Badge kind="status" tone="neutral">Tentative</Badge>}
          {inst.free && <Badge kind="status" tone="neutral">Free</Badge>}
          {inst.allDay && <Badge kind="status" tone="blue">All day</Badge>}
          {others.length > 0 && <Badge kind="status" tone="red">CONFLICT</Badge>}
        </div>
        {others.map((o) => (
          <button key={o.key} type="button" onClick={() => onOpen(o)} className="text-left text-[13px] text-red underline">
            Overlaps {o.title} at {hmOf(o.start)}
          </button>
        ))}
        {inst.readOnly && <p className="font-mono text-[11px] text-text-3">This calendar is read-only.</p>}
      </div>
    </Dialog>
  );
}
