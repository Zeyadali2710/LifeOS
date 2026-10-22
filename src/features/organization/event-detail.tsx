"use client";

import { useState } from "react";
import { CATEGORY } from "@/lib/calendar-categories";
import { whenText } from "@/features/approvals/model/event";
import { isSafeUrl } from "@/lib/safe-url";
import { tzLabel } from "@/server/time";
import { Button } from "@/ui/button";
import { Status, Tag } from "@/ui/display";
import { Icon } from "@/ui/icon";
import { hmOf, shortDate } from "./grid";
import type { OrgInstance } from "./organization-view";
import s from "./organization.module.css";

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
    ? inst.startDate && inst.endDate
      ? whenText(inst.startDate, inst.endDate, true) // shows the last day of a multi-day event
      : `${shortDate(inst.start)} · All day`
    : `${shortDate(inst.start)} · ${hmOf(inst.start)}–${hmOf(inst.end)} ${tzLabel(new Date(inst.start))}`;
  const others = inst.conflictWith.map((k) => all.find((i) => i.key === k)).filter((i): i is OrgInstance => Boolean(i));
  const long = (inst.description?.length ?? 0) > 240 || (inst.description?.split("\n").length ?? 0) > 6;
  return (
    <section aria-label="Event detail" className={s.evCard}>
      <div className={s.detailHead}><span className={s.evKind}>{cat ? CATEGORY[cat].label : "Uncategorised"}</span><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div>
      <h2 className={s.evCardTitle}>{inst.title}</h2>
      <div className={s.evWhen}><time dateTime={inst.start}>{when}</time> · {inst.calendarName}</div>
      {inst.repeatText && <div className={s.detailRow}><Icon name="repeat" size={15} />{inst.repeatText}</div>}
      {inst.location && <div className={s.detailRow}><Icon name="location_on" size={15} />{isSafeUrl(inst.location) ? <a href={inst.location} target="_blank" rel="noopener noreferrer">{inst.location}</a> : <span>{inst.location}</span>}</div>}
      {inst.description && <div><p className={`${s.evDesc} ${full ? s.fullDesc : ""}`}>{inst.description}</p>{long && <Button variant="text" size="sm" aria-expanded={full} onClick={() => setFull(!full)}>{full ? "Show less" : "Show full description"}</Button>}</div>}
      <div className={s.detailRow}>
        {inst.status === "tentative" && <Status tone="approval" glyph="△">Tentative</Status>}
        {inst.free && <Tag>Free</Tag>}{inst.allDay && <Tag>All day</Tag>}
        {others.length > 0 && <Status tone="failed" glyph="△">Conflict</Status>}
      </div>
      {others.map(o => <button key={o.key} type="button" className={s.evLinkBtn} onClick={() => onOpen(o)}>Overlaps {o.title} at {hmOf(o.start)}</button>)}
      {inst.readOnly ? <p className={s.note}>This calendar is read-only.</p> : <div className={s.planActions}><Button size="sm" onClick={() => onEdit(inst)}>Edit</Button><Button variant="ghost" destructive size="sm" onClick={() => onDelete(inst)}>Delete…</Button></div>}
    </section>
  );
}
