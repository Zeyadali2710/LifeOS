"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BRIEFING_KINDS, BRIEFING_LABEL, type BriefingBody, type BriefingKind, type BriefingSchedule } from "@/lib/digest";
import { briefingNowAction, markBriefingReadAction } from "@/server/briefing-actions";
import { useShell } from "@/features/shell/shell-provider";
import { PAGE_STATES } from "@/features/shell/page-states";
import { Button } from "@/ui/button";
import { Select } from "@/ui/controls";
import { Status } from "@/ui/display";
import { Alert, EmptyState } from "@/ui/feedback";
import { Page, PageHeader, Section } from "@/ui/layout";
import s from "./briefings.module.css";

type BriefingRow = { id: string; kind: string; period: string; headline: string; createdAt: string; readAt: string | null };
const day = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

export function BriefingsView({ rows, selected, schedule }: { rows: BriefingRow[]; selected: (BriefingRow & { body: BriefingBody }) | null; schedule: BriefingSchedule }) {
  const router = useRouter();
  const { toast } = useShell();
  const [kind, setKind] = useState<BriefingKind>("midday");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<string[]>([]);
  const [focused, setFocused] = useState<string | null>(null);
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void markBriefingReadAction(selectedId).then(() => { if (active) setRead((ids) => ids.includes(selectedId) ? ids : [...ids, selectedId]); }).catch(() => toast("Could not mark the briefing read. Reopen it to retry.", "error"));
    return () => { active = false; };
  }, [selectedId, toast]);
  async function build() {
    setBusy(true); setError(null);
    try {
      const result = await briefingNowAction(kind);
      if (!result.ok) { setError(result.error); toast(result.error, "error"); return; }
      toast(`${BRIEFING_LABEL[kind]} built.`);
      router.push(`/briefings?id=${result.id}`, { scroll: false });
      router.refresh();
    } catch { setError("Could not build the briefing. Try again."); toast("Could not build the briefing. Try again.", "error"); }
    finally { setBusy(false); }
  }
  return <Page label="Briefings">
    <PageHeader title="Briefings" sub={<>{BRIEFING_KINDS.filter((k) => schedule[k].on).map((k) => `${k[0]!.toUpperCase()}${k.slice(1)} ${k === "weekly" ? "Sunday " : ""}${schedule[k].time}`).join(" · ") || "Schedule off"} · built from local data, no model call. <Link href="/settings?section=briefings">Change times</Link></>} actions={<><Select label="Briefing to build" value={kind} disabled={busy} onChange={(e) => { setKind(e.target.value as BriefingKind); setError(null); }}>{BRIEFING_KINDS.map((k) => <option key={k} value={k}>{BRIEFING_LABEL[k]}</option>)}</Select><Button variant="primary" disabled={busy} onClick={() => void build()}>{busy ? "Building…" : "Build one now"}</Button></>} />
    {error && <Alert className={s.error} action={<Button variant="text" onClick={() => void build()} disabled={busy}>Retry</Button>}>{error}</Alert>}
    {rows.length === 0 ? <EmptyState icon="event_note" title={PAGE_STATES.briefings!.empty![0]} body={PAGE_STATES.briefings!.empty![1]} /> : <div className={s.columns}>
      <ul className={s.list} aria-label="Recent briefings" onKeyDown={(e) => {
        if (!["ArrowDown", "ArrowUp", "j", "k", "Home", "End"].includes(e.key)) return;
        const items = [...e.currentTarget.querySelectorAll<HTMLAnchorElement>("a")];
        const i = items.indexOf(document.activeElement as HTMLAnchorElement);
        if (i < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        items[e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (["ArrowDown", "j"].includes(e.key) ? 1 : items.length - 1)) % items.length]?.focus();
      }}>{error && <li className={s.row}><span className={s.rowHead}><strong>{BRIEFING_LABEL[kind]}</strong><Status tone="failed" glyph="×" mono>Failed</Status></span><span className={s.summary}>{error}</span></li>}{rows.map((b) => <li key={b.id}><Link href={`/briefings?id=${b.id}`} scroll={false} tabIndex={(rows.some((r) => r.id === focused) ? focused : selected?.id) === b.id ? 0 : -1} onFocus={() => setFocused(b.id)} aria-current={selected?.id === b.id ? "page" : undefined} className={s.row}><span className={s.rowHead}><strong>{b.kind[0]!.toUpperCase()}{b.kind.slice(1)} · {day(b.period)}</strong><span className={s.time}>{time(b.createdAt)}</span></span><span className={s.summary}>{!b.readAt && !read.includes(b.id) && <span className={s.unread}>Unread · </span>}{b.headline}</span></Link></li>)}</ul>
      {selected && <article className={s.article} aria-label={BRIEFING_LABEL[selected.kind as BriefingKind]}>
        <div className={s.meta}>{selected.kind.toUpperCase()} BRIEFING · {time(selected.createdAt)}</div>
        <h2 className={s.title}>{day(selected.period)}</h2><p className={s.headline}>{selected.headline}</p>
        {selected.body.sections.map((section) => <Section key={section.id} id={`briefing-${section.id}`} label={section.label} className={s.section}>{section.items.length ? <ul className={s.items}>{section.items.map((item, i) => <li key={i}>{item.href ? <Link href={item.href}>{item.text}</Link> : item.text}{item.meta && <span className={s.itemMeta}> · {item.meta}</span>}</li>)}</ul> : <p className={s.empty}>{section.empty}</p>}</Section>)}
        {!selected.body.sections.length && <p className={s.empty}>No sections are available for this briefing.</p>}
        <p className={s.privacy}>Notifications carry counts only. Sections, which can include email subjects, appear only on this owner-only page.</p>
      </article>}
    </div>}
  </Page>;
}
