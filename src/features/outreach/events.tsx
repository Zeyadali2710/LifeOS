"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OutreachEventDTO, Stage } from "@/lib/outreach-types";
import { SOURCE_LABEL, STAGE, STAGE_ORDER } from "@/lib/outreach-types";
import { dismissEventAction, restoreEventAction } from "@/server/outreach-pipeline-actions";
import { isSafeUrl } from "@/lib/safe-url";
import { useShell } from "@/features/shell/shell-provider";
import { Button, ButtonLink } from "@/ui/button";
import { Status, Tag, Progress } from "@/ui/display";
import { Alert } from "@/ui/feedback";
import { Icon } from "@/ui/icon";
import { Page, PageHeader, Section } from "@/ui/layout";
import { AddToCalendarDialog, FollowUpDialog, type CalendarProps } from "./dialogs";
import { dateLong, dateShort, dayNum, timeRange, wd, sydneyYmd, zoneName } from "./fmt";
import { useStage } from "./use-stage";
import s from "./outreach.module.css";

export function StageStatus({ stage }: { stage: Stage | null }) {
  return <Status tone={stage === "ATTENDING" || stage === "ATTENDED" ? "working" : stage === "INTERESTED" || stage === "FOLLOW_UP" ? "approval" : "idle"} glyph={stage === "ATTENDED" ? "✓" : stage === "FOLLOW_UP" ? "!" : "–"}>{stage ? STAGE[stage].label : "Discovered"}</Status>;
}

export function EventTags({ event }: { event: OutreachEventDTO }) {
  return <div className={s.tags}>{event.categories.map((c) => <Tag key={c}>{c}</Tag>)}{event.sourceKinds.map((k) => <Tag key={k} variant="source">{SOURCE_LABEL[k as keyof typeof SOURCE_LABEL] ?? k}</Tag>)}{event.isMock && <Tag>Mock</Tag>}</div>;
}

export function EventCard({ event: e, ...calendar }: CalendarProps & { event: OutreachEventDTO }) {
  const { stage, move, busy } = useStage(e.id, e.stage);
  const [cal, setCal] = useState(false);
  const idx = STAGE_ORDER.indexOf(stage);
  const score = e.score >= 80 ? "var(--status-working)" : e.score >= 65 ? "var(--status-approval)" : "var(--neutral)";
  return <article className={s.eventCard}>
    <div className={s.media}>
      <span className={s.meta}>EVENT IMAGE</span>
      <div className={s.dateBlock}><span>{wd(e.startAt).toUpperCase()}</span><strong>{dayNum(e.startAt)}</strong><span>{new Intl.DateTimeFormat("en-AU", { month: "short", timeZone: "Australia/Sydney" }).format(new Date(e.startAt))}</span></div>
      <div className={s.ring} title={`Relevance ${e.score} of 100`} aria-label={`Relevance ${e.score} of 100`} style={{ background: `conic-gradient(${score} ${e.score * 3.6}deg, var(--rule-soft) 0)` }}><span>{e.score}</span></div>
      {stage && <div className={s.stageBadge}><StageStatus stage={stage} /></div>}
    </div>
    <div className={s.eventBody}>
      <Link className={s.eventTitle} href={`/outreach/events/${e.id}`}>{e.title}</Link>
      <p>{dateShort(e.startAt)} · {timeRange(e)} · <span className={/^free/i.test(e.priceText ?? "") ? s.free : undefined}>{e.priceText ?? "Price not listed"}</span></p>
      <div className={s.eventMeta}><span><Icon name={e.online ? "public" : "location_on"} size={15} />{e.online ? "Online" : e.location ?? "Location unknown"}</span><span><Icon name="groups" size={15} />{e.organizer ?? "Organizer unknown"}</span></div>
      <EventTags event={e} />
      {e.why && <div className={s.why}><Icon name="auto_awesome" size={15} /><span>{e.why}</span></div>}
    </div>
    <div className={s.eventActions}>
      {([ ["bookmark", "Save"], ["star", "Interested"], ["check_circle", "Attend"] ] as const).map(([icon, label], i) => {
        const reached = idx >= i + 1;
        // Reached steps always undo one step, preserving the server's adjacent-transition rule.
        const to = reached ? STAGE_ORDER[Math.max(0, idx - 1)]! : STAGE_ORDER[i + 1]!;
        const locked = !reached && idx !== i;
        return <button key={label} type="button" aria-label={`${label} ${e.title}`} aria-pressed={reached} disabled={busy || locked} title={locked ? i === 1 ? "Save it first" : "Mark Interested first" : reached ? "Undo one step" : label} onClick={() => void move(to)}><Icon name={icon} size={16} fill={reached} />{label}</button>;
      })}
      {e.calendarEventId ? <Link href={`/organization?view=day&date=${sydneyYmd(e.startAt)}&event=${e.calendarEventId}`} title="Open in Organization"><Icon name="event" size={16} />On calendar</Link> : <button type="button" disabled={e.isMock || idx < 3} title={e.isMock ? "Mock events can't go on your calendar." : idx < 3 ? "Mark Attending first" : "Add to calendar"} onClick={() => setCal(true)}><Icon name="event" size={16} />Calendar</button>}
    </div>
    {cal && <AddToCalendarDialog event={e} {...calendar} onClose={() => setCal(false)} />}
  </article>;
}

export function Pipeline({ events }: { events: OutreachEventDTO[] }) {
  return <div className={s.pipeline}>{STAGE_ORDER.map((stage) => <Section key={stage ?? "discovered"} id={`stage-${stage ?? "discovered"}`} label={stage ? STAGE[stage].label : "Discovered"} meta={events.filter((e) => e.stage === stage).length}>
    <div className={s.stack}>{events.filter((e) => e.stage === stage).map((e) => <PipelineCard key={e.id} event={e} />)}{!events.some((e) => e.stage === stage) && <p className={s.meta}>Nothing here</p>}</div>
  </Section>)}</div>;
}

function PipelineCard({ event: e }: { event: OutreachEventDTO }) {
  const { stage, move, busy } = useStage(e.id, e.stage);
  const [follow, setFollow] = useState(false);
  const idx = STAGE_ORDER.indexOf(stage);
  const next = STAGE_ORDER[idx + 1];
  return <article className={s.pipelineCard}><Link href={`/outreach/events/${e.id}`}><strong>{e.title}</strong></Link><p className={s.meta}>{dateShort(e.startAt)} · {timeRange(e)} · {e.location ?? "Online"}</p><StageStatus stage={stage} /><p className={s.small}>{e.why}</p><div className={s.actions}><Button size="sm" icon="arrow_back" disabled={busy || idx === 0} aria-label={`Move ${e.title} back one step`} onClick={() => void move(STAGE_ORDER[idx - 1]!)} />{next && <Button size="sm" iconRight="arrow_forward" disabled={busy || (next === "FOLLOW_UP" && e.isMock)} title={next === "FOLLOW_UP" && e.isMock ? "Mock events can't create follow-up tasks." : undefined} onClick={() => next === "FOLLOW_UP" ? setFollow(true) : void move(next)}>{STAGE[next].label}</Button>}</div>{follow && <FollowUpDialog event={e} onClose={() => setFollow(false)} />}</article>;
}

export function EventDetail({ event: e, ...calendar }: CalendarProps & { event: OutreachEventDTO }) {
  const router = useRouter();
  const { toast } = useShell();
  const { stage, move, busy } = useStage(e.id, e.stage);
  const [cal, setCal] = useState(false);
  const [follow, setFollow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const idx = STAGE_ORDER.indexOf(stage);
  const next = STAGE_ORDER[idx + 1];
  const safe = isSafeUrl(e.url) ? e.url : null;
  const dismiss = async () => {
    if (updating) return;
    setUpdating(true);
    const r = await (e.dismissedAt ? restoreEventAction(e.id) : dismissEventAction(e.id)).catch(() => ({ ok: false }));
    setUpdating(false);
    toast(r.ok ? e.dismissedAt ? "Event restored" : "Event dismissed" : "Couldn't update the event. Try again.", r.ok ? "success" : "error"); router.refresh();
  };
  return <Page><Link href="/outreach?tab=discover" className={s.back} onClick={(ev) => { if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return; const last = sessionStorage.getItem("outreach:list"); if (last && /^\/outreach(\?|$)/.test(last)) { ev.preventDefault(); router.push(last); } }}>‹ All events</Link><PageHeader title={e.title} sub={`${dateLong(e.startAt)} · ${timeRange(e)} ${zoneName(e.startAt)}${e.timeZone && e.timeZone !== "Australia/Sydney" ? ` · ${e.timeZone}` : ""}`} />
    {e.dismissedAt && <Alert tone="info" action={<Button disabled={updating} onClick={() => void dismiss()}>Restore event</Button>}>This event is dismissed and hidden from your lists.</Alert>}
    <div className={s.detailColumns}><div className={s.detailMain}><EventTags event={e} /><Section id="event-why" label={`Why this is relevant · ${e.score}/100`}><p>{e.why}</p><div className={s.stack}>{e.signals.map((signal) => <div className={s.signal} key={signal.label}><span className={s.meta}>{signal.label}</span><Progress value={signal.max ? signal.value / signal.max * 100 : 0} label={`${signal.label}: ${signal.value} of ${signal.max}`} tone="working" /><span className={s.small}>{signal.label === "PROJECTS" ? signal.terms.map((t) => `project ${t}`).join(", ") || "No match" : signal.note || signal.terms.join(", ") || "No match"}</span></div>)}</div></Section>
      {!!e.description.trim() && <Section id="event-description" label="Description"><p className={`${s.messageBody} ${!expanded && e.description.length > 700 ? s.collapsed : ""}`}>{e.description}</p>{e.description.length > 700 && <Button variant="text" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : "Show full description"}</Button>}</Section>}
    </div><aside className={s.detailSide}><div className={s.panel}><p><Icon name="location_on" size={17} /> {e.online ? "Online" : e.location ?? "Location unknown"}</p><p><Icon name="groups" size={17} /> {e.organizer ?? "Organizer unknown"}</p><p>{e.priceText ?? "Price not listed"}</p></div><Section id="event-pipeline" label="Pipeline"><div className={s.stack}><StageStatus stage={stage} />{!e.dismissedAt && <><div className={s.tags}>{STAGE_ORDER.map((st) => <Tag key={st ?? "new"}>{st ? STAGE[st].label : "Discovered"}{st === stage ? " ←" : ""}</Tag>)}</div>{next && <Button variant="primary" disabled={busy || (next === "FOLLOW_UP" && e.isMock)} onClick={() => next === "FOLLOW_UP" ? setFollow(true) : void move(next)}>{next === "FOLLOW_UP" ? "Follow up" : `Mark ${STAGE[next].label.toLowerCase()}`}</Button>}{idx > 0 && <Button disabled={busy} onClick={() => void move(STAGE_ORDER[idx - 1]!)}>{idx === 1 ? "Unsave" : "Move back one step"}</Button>}{e.calendarEventId ? <ButtonLink href={`/organization?view=day&date=${sydneyYmd(e.startAt)}&event=${e.calendarEventId}`}>On calendar · Open Organization</ButtonLink> : idx >= 3 && <Button disabled={e.isMock} onClick={() => setCal(true)}>Add to calendar</Button>}{idx === 0 && <Button variant="text" disabled={updating} onClick={() => void dismiss()} icon="visibility_off">Dismiss event</Button>}</>}{safe && <ButtonLink href={safe} external icon="open_in_new">Open original page</ButtonLink>}{e.isMock && <p className={s.meta}>Mock events can&apos;t go on your calendar or create follow-up tasks.</p>}</div></Section></aside></div>
    {cal && <AddToCalendarDialog event={e} {...calendar} onClose={() => setCal(false)} />}{follow && <FollowUpDialog event={e} onClose={() => setFollow(false)} />}
  </Page>;
}
