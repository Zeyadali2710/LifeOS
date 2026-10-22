"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PLATFORMS, type SocialPlatform } from "@/lib/social-types";
import { rangeLabel } from "@/features/organization/grid";
import { formatHM } from "@/server/time";
import { Button } from "@/legacy-ui/button";
import { Checkbox } from "@/legacy-ui/field";
import { calendarDays, dayKey, shiftDay } from "./model";
import { PLATFORM } from "./platform";
import type { SocialsData } from "./socials-view";

export function ContentCalendar({ data, onOpen, onNew }: { data: SocialsData; onOpen(id: string): void; onNew(day: string): void }) {
  const sp = useSearchParams(); const router = useRouter(); const mode = sp.get("cal") === "week" ? "week" : "month";
  const anchor = sp.get("d") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("d")!) && Number.isFinite(Date.parse(sp.get("d")!)) ? sp.get("d")! : dayKey(data.now);
  const [shown, setShown] = useState<SocialPlatform[]>([...PLATFORMS]); const [expanded, setExpanded] = useState<string | null>(null);
  const days = calendarDays(anchor, mode); const today = dayKey(data.now);
  const navigate = (date: string, view = mode) => { const p = new URLSearchParams(sp.toString()); p.set("d", date); p.set("cal", view); router.replace(`/socials?${p}`, { scroll: false }); };
  const move = (direction: number) => {
    if (mode === "week") navigate(shiftDay(anchor, direction * 7));
    else { const d = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + direction); navigate(d.toISOString().slice(0, 10)); }
  };
  const rows = data.calendar.filter((v) => shown.includes(v.platform as SocialPlatform) && ["scheduled", "publishing", "published", "posted_manually"].includes(v.status));
  return <section aria-label="Content calendar" className="space-y-4">
    <div className="flex flex-wrap items-center gap-3"><h2 className="mr-auto font-display text-[26px]">{rangeLabel(mode, mode === "week" ? days : anchor)}</h2><fieldset className="flex gap-2"><legend className="sr-only">Calendar range</legend>{(["week", "month"] as const).map((v) => <label key={v} className="flex min-h-11 items-center gap-1 text-[12.5px]"><input type="radio" name="calendar-range" checked={mode === v} onChange={() => navigate(anchor, v)} />{v === "week" ? "Week" : "Month"}</label>)}</fieldset><Button variant="secondary" size="sm" aria-label={`Previous ${mode}`} onClick={() => move(-1)}>Previous</Button><Button variant="secondary" size="sm" onClick={() => navigate(today)}>Today</Button><Button variant="secondary" size="sm" aria-label={`Next ${mode}`} onClick={() => move(1)}>Next</Button></div>
    <div role="group" aria-label="Show platforms" className="flex flex-wrap gap-4">{PLATFORMS.map((p) => <Checkbox key={p} hitArea label={PLATFORM[p].label} aria-label={`Show ${PLATFORM[p].label}`} checked={shown.includes(p)} onChange={(e) => setShown((old) => e.target.checked ? [...old, p] : old.filter((v) => v !== p))} />)}</div>
    {!rows.length && <p className="text-[13.5px] text-text-3">Nothing scheduled or posted this {mode}.</p>}
    <div className={`glass-card grid overflow-hidden rounded-24 ${mode === "week" ? "grid-cols-1 tab:grid-cols-7" : "grid-cols-7"}`}>
      {days.map((day) => {
        const items = rows.filter((v) => { const at = v.publishedAt ?? v.scheduledAt; return at && dayKey(at) === day; }).sort((a, b) => +(a.publishedAt ?? a.scheduledAt!) - +(b.publishedAt ?? b.scheduledAt!));
        const label = rangeLabel("day", day); const all = mode === "week" || expanded === day;
        return <section key={day} aria-label={label} className={`min-w-0 border-r border-b border-white/[.06] p-1.5 tab:p-3 ${mode === "month" ? "min-h-[125px]" : "tab:min-h-[280px]"} ${mode === "month" && day.slice(0, 7) !== anchor.slice(0, 7) ? "opacity-50" : ""}`}><div className="mb-2 flex flex-wrap items-center justify-between gap-1"><h3 className={`text-[12.5px] ${day === today ? "rounded-full bg-accent-solid px-2 py-1 text-white" : "text-text-2"}`}>{mode === "week" ? label : Number(day.slice(-2))}</h3><button type="button" className="min-h-8 min-w-8 rounded-full text-text-3 hover:bg-white/10" aria-label={`New post on ${label}`} onClick={() => onNew(day)}>+</button></div><ol className="space-y-1">{(all ? items : items.slice(0, 2)).map((v) => {
          const p = v.platform as SocialPlatform; const post = data.board.find((post) => post.id === v.postId); const at = v.publishedAt ?? v.scheduledAt!; const mock = v.isMock || v.approvedProviderMode === "mock";
          return <li key={v.id}><button type="button" aria-label={`${PLATFORM[p].label}, ${post?.title ?? "Post"}, ${formatHM(at)}, ${v.status}${mock ? ", mock" : ""}`} className="w-full rounded-6 p-1.5 text-left text-[11.5px] leading-normal" style={{ background: PLATFORM[p].tint, color: PLATFORM[p].text }} onClick={() => onOpen(v.postId)}><span className="block truncate font-medium">{PLATFORM[p].mark.toUpperCase()} · {formatHM(at)}</span><span className="line-clamp-2 break-words">{post?.title ?? "Post"}</span>{mock && <span className="block text-[10px]">MOCK</span>}</button></li>;
        })}</ol>{!all && items.length > 2 && <button type="button" aria-label={`Show all ${items.length} posts on ${label}`} className="mt-2 text-[11.5px] text-cyan" onClick={() => setExpanded(day)}>+{items.length - 2} more</button>}</section>;
      })}
    </div>
    {mode === "month" && <p className="text-[12.5px] text-text-3 tab:hidden">Switch to Week for the full mobile agenda.</p>}
  </section>;
}
