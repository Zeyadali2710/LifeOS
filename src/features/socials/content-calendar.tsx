"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PLATFORMS, type SocialPlatform } from "@/lib/social-types";
import { formatHM } from "@/server/time";
import { Button } from "@/ui/button";
import { Checkbox, Segmented } from "@/ui/controls";
import { calendarDays, dayKey, shiftDay } from "./model";
import { PLATFORM } from "./platform";
import { PostStatus } from "./post-preview";
import type { SocialsData } from "./socials-view";
import s from "./socials.module.css";

export function ContentCalendar({ data, onOpen, onNew }: { data: SocialsData; onOpen(id: string): void; onNew(day: string): void }) {
  const sp = useSearchParams(); const router = useRouter(); const mode = sp.get("cal") === "week" ? "week" : "month";
  const anchor = sp.get("d") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("d")!) && Number.isFinite(Date.parse(sp.get("d")!)) ? sp.get("d")! : dayKey(data.now);
  const [shown, setShown] = useState<SocialPlatform[]>([...PLATFORMS]); const [expanded, setExpanded] = useState<string | null>(null);
  const days = calendarDays(anchor, mode); const today = dayKey(data.now);
  const navigate = (date: string, view = mode) => { const params = new URLSearchParams(sp.toString()); params.set("d", date); params.set("cal", view); router.replace(`/socials?${params}`, { scroll: false }); };
  const move = (direction: number) => {
    if (mode === "week") navigate(shiftDay(anchor, direction * 7));
    else { const date = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + direction); navigate(date.toISOString().slice(0, 10)); }
  };
  const rows = data.calendar.filter((v) => shown.includes(v.platform as SocialPlatform) && ["scheduled", "publishing", "published", "posted_manually"].includes(v.status));
  const label = (day: string) => new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${day}T12:00:00Z`));
  return <section aria-label="Content calendar" className={s.stack}>
    <div className={s.toolbar}><h2 className={s.title}>{mode === "week" ? `${label(days[0]!)} – ${label(days.at(-1)!)}` : new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${anchor}T12:00:00Z`))}</h2><div className={s.actions}><Segmented label="Calendar range" value={mode} options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }]} onChange={(value) => navigate(anchor, value)} /><Button aria-label={`Previous ${mode}`} onClick={() => move(-1)}>Previous</Button><Button onClick={() => navigate(today)}>Today</Button><Button aria-label={`Next ${mode}`} onClick={() => move(1)}>Next</Button></div></div>
    <div className={s.actions} role="group" aria-label="Show platforms">{PLATFORMS.map((p) => <Checkbox key={p} label={PLATFORM[p].label} checked={shown.includes(p)} onChange={(e) => setShown((old) => e.target.checked ? [...old, p] : old.filter((v) => v !== p))} />)}</div>
    {!rows.length && <p className={s.muted}>Nothing scheduled or posted this {mode}.</p>}
    <div className={s.calendar}>{days.map((day) => {
      const items = rows.filter((v) => { const at = v.publishedAt ?? v.scheduledAt; return at && dayKey(at) === day; }).sort((a, b) => +(a.publishedAt ?? a.scheduledAt!) - +(b.publishedAt ?? b.scheduledAt!));
      const all = mode === "week" || expanded === day;
      return <section key={day} className={s.day} aria-label={label(day)} data-today={day === today}><div className={s.toolbar}><span className={s.meta}>{label(day)}</span><Button size="sm" aria-label={`New post on ${label(day)}`} onClick={() => onNew(day)}>+</Button></div><ol>{(all ? items : items.slice(0, 2)).map((v) => { const p = v.platform as SocialPlatform; const post = data.board.find((post) => post.id === v.postId); const at = v.publishedAt ?? v.scheduledAt!;
        return <li key={v.id}><button type="button" className={s.calendarPost} onClick={() => onOpen(v.postId)}><span>{PLATFORM[p].label} · {formatHM(at)}</span><strong>{post?.title ?? "Post"}</strong><PostStatus status={v.status} />{(v.isMock || v.approvedProviderMode === "mock") && <span>MOCK</span>}</button></li>;
      })}</ol>{!all && items.length > 2 && <Button variant="text" onClick={() => setExpanded(day)}>+{items.length - 2} more</Button>}</section>;
    })}</div>
  </section>;
}
