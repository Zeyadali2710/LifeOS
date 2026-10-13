"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { isSafeUrl } from "@/lib/safe-url";
import { SOURCE_LABEL, STAGE, STAGE_ORDER, STAGES, nextStage, prevStage, type EventSourceKind, type OutreachEventDTO, type Stage } from "@/lib/outreach-types";
import { dismissEventAction, moveStageAction, restoreEventAction } from "@/server/outreach-pipeline-actions";
import { useShell } from "@/shell/shell-provider";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";
import { AddToCalendarDialog, type CalendarOption } from "./add-to-calendar-dialog";
import { EventBadges } from "./event-card";
import { dateLong, scoreColor, sydneyYmd, timeRange, zoneName } from "./fmt";
import { FollowUpDialog } from "./follow-up-dialog";
import { WhyBlock } from "./why-block";

const NEXT_LABEL: Record<string, string> = { none: "Save event", SAVED: "Mark interested", INTERESTED: "Attend", ATTENDING: "Mark attended", ATTENDED: "Follow up" };
const card = "glass-card rounded-24 p-5";

function Fact({ icon, value, sub }: { icon: IconName; value: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon name={icon} size={18} className="mt-0.5 text-text-3" />
      <div className="min-w-0">
        <p className="text-[13.5px] break-words">{value}</p>
        {sub && <p className="text-[12.5px] text-text-3">{sub}</p>}
      </div>
    </div>
  );
}

function signalText(s: OutreachEventDTO["signals"][number]): string {
  if (s.label === "PROJECTS") return s.terms.map((t) => `project ${t}`).join(", ");
  if (s.label === "SCHEDULE") return s.note ?? "";
  return s.terms.join(", ");
}

export function EventDetail({ event, calendars, defaultCalendarId }: { event: OutreachEventDTO; calendars: CalendarOption[]; defaultCalendarId: string | null }) {
  const router = useRouter();
  const { toast } = useShell();
  const [busy, setBusy] = useState<string | null>(null);
  const [calDialog, setCalDialog] = useState(false);
  const [followDialog, setFollowDialog] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const stage = event.stage;
  const dismissed = !!event.dismissedAt;
  const idx = STAGE_ORDER.indexOf(stage);
  const next = nextStage(stage);
  const back = prevStage(stage);
  const url = isSafeUrl(event.url) ? event.url : null;
  const host = url ? new URL(url).host : "";
  const paras = event.description.trim().split(/\n\s*\n|\n/);
  const lead = paras[0] ?? "";
  const long = event.description.length > 700 || event.description.split("\n").length > 10;
  const tzDiffers = !!event.timeZone && event.timeZone !== "Australia/Sydney";

  const run = async (key: string, f: () => Promise<{ ok: boolean }>, ok?: string) => {
    if (busy) return;
    setBusy(key);
    const r = await f().catch(() => ({ ok: false }));
    setBusy(null);
    if (!r.ok) return toast("Couldn't update the event. Try again.", "error");
    if (ok) toast(ok);
    router.refresh();
  };
  const move = (to: Stage | null, key: string) => run(key, () => moveStageAction(event.id, stage, to));

  const goBack = (e: React.MouseEvent) => {
    // keep the previous ?tab&interest&view query when we came from the list
    if (document.referrer.includes("/outreach") && !document.referrer.includes("/outreach/events")) {
      e.preventDefault();
      router.back();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/outreach" onClick={goBack} className="inline-flex w-fit items-center gap-1.5 text-[13px] text-cyan">
        <Icon name="arrow_back" size={16} />
        All events
      </Link>
      {dismissed && (
        <div className="glass-card flex flex-wrap items-center gap-3 rounded-24 p-4">
          <Icon name="visibility_off" size={18} className="text-text-3" />
          <p className="min-w-0 flex-1 text-[13.5px]">This event is dismissed and hidden from your lists.</p>
          <Button variant="secondary" size="sm" loading={busy === "restore"} onClick={() => run("restore", () => restoreEventAction(event.id), "Event restored")}>
            Restore event
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 desk:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6 desk:order-1 max-desk:order-2">
          <EventBadges event={event} stage={stage} maxCategories={6} maxSources={4} />
          <div className="flex flex-col gap-2.5">
            <h1 className="font-display text-[clamp(34px,4.4vw,60px)] leading-[.95] font-normal tracking-[-0.015em] [text-wrap:pretty]">{event.title}</h1>
            {lead && <p className="max-w-[640px] text-[15px] leading-normal break-words text-text-2">{lead}</p>}
          </div>
          <WhyBlock why={event.why} score={event.score} large>
            <div className="flex flex-col gap-2.5">
              <p className="text-[11px] font-medium tracking-[.14em] text-text-3 uppercase">SIGNALS</p>
              {event.signals.map((s) => {
                const pct = s.max > 0 ? Math.round((s.value / s.max) * 100) : 0;
                const text = signalText(s);
                return (
                  <div key={s.label} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3">
                    <span className="text-[11px] font-medium tracking-[.14em] text-text-3 uppercase">{s.label}</span>
                    <span role="img" aria-label={`${s.label} ${pct} out of 100`} className="h-1 overflow-hidden rounded-full bg-white/[.08]">
                      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: scoreColor(pct) }} />
                    </span>
                    <span className={`text-[12.5px] ${s.value > 0 && text ? "text-text-2" : "text-text-3"}`}>{s.value > 0 && text ? text : "No match"}</span>
                  </div>
                );
              })}
            </div>
          </WhyBlock>
          {event.description.trim() && (
            <section className={card} aria-labelledby="desc-h">
              <h2 id="desc-h" className="mb-3 text-[11px] font-medium tracking-[.14em] text-text-3 uppercase">
                DESCRIPTION
              </h2>
              <div className={`text-[14px] leading-normal break-words whitespace-pre-wrap ${long && !expanded ? "max-h-[320px] overflow-hidden" : ""}`}>{event.description}</div>
              {long && (
                <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="mt-3 text-[13px] text-cyan">
                  {expanded ? "Show less" : "Show full description"}
                </button>
              )}
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-6 desk:order-2 max-desk:order-1">
          <div className={`${card} flex flex-col gap-3.5`}>
            <Fact icon="event" value={dateLong(event.startAt)} sub={`${timeRange(event)}${event.allDay ? "" : ` ${zoneName(event.startAt)}`}${tzDiffers ? ` · ${event.timeZone}` : ""}`} />
            <Fact icon={event.online ? "public" : "location_on"} value={event.online ? "Online" : (event.location ?? "Location unknown")} />
            <Fact icon="groups" value={event.organizer ?? "Organizer unknown"} />
            <Fact icon="info" value={event.priceText ?? "Price not listed"} />
          </div>

          <div className={`${card} flex flex-col gap-3.5`}>
            <p className="text-[11px] font-medium tracking-[.14em] text-text-3 uppercase">PIPELINE</p>
            <ol className="flex flex-wrap gap-x-3 gap-y-1.5 text-[12.5px]">
              {STAGES.map((st, i) => {
                const reached = idx >= i + 1;
                const current = stage === st;
                return (
                  <li key={st} aria-current={current ? "step" : undefined} className={`inline-flex items-center gap-1.5 ${current ? "font-medium text-text" : reached ? "text-text" : "text-text-3"}`}>
                    <span aria-hidden="true" className={`size-1.5 rounded-full ${reached ? "bg-cyan" : "bg-white/[.16]"}`} />
                    {STAGE[st].label}
                  </li>
                );
              })}
            </ol>
            {dismissed ? null : (
              <div className="flex flex-col gap-2">
                {next && (
                  <Button
                    variant="primary"
                    loading={busy === "next"}
                    disabled={next === "FOLLOW_UP" && event.isMock}
                    title={next === "FOLLOW_UP" && event.isMock ? "Mock events can't create follow-up tasks." : undefined}
                    onClick={() => (next === "FOLLOW_UP" ? setFollowDialog(true) : move(next, "next"))}
                  >
                    {NEXT_LABEL[stage ?? "none"]}
                  </Button>
                )}
                {event.calendarEventId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge kind="status" tone="green">
                      On calendar
                    </Badge>
                    <Link href={`/organization?view=day&date=${sydneyYmd(event.startAt)}&event=${event.calendarEventId}`} className="text-[13px] text-cyan">
                      Open in Organization
                    </Link>
                  </div>
                ) : (
                  idx >= 3 && (
                    <Button variant="secondary" disabled={event.isMock} title={event.isMock ? "Mock events can't go on your calendar." : undefined} onClick={() => setCalDialog(true)}>
                      Add to calendar
                    </Button>
                  )
                )}
                {back !== null || stage === "SAVED" ? (
                  <Button variant="ghost" loading={busy === "back"} onClick={() => move(back, "back")}>
                    {stage === "SAVED" ? "Unsave" : `Move back to ${STAGE[back!].label}`}
                  </Button>
                ) : null}
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${event.title} on ${host}`}
                    className="inline-flex h-8 items-center justify-center gap-2 rounded-full px-3.5 text-[13px] font-medium text-cyan hover:bg-white/[.06] max-tab:min-h-11"
                  >
                    <Icon name="open_in_new" size={16} />
                    Open original page
                  </a>
                )}
                {stage === null && (
                  <Button variant="ghost" loading={busy === "dismiss"} onClick={() => run("dismiss", () => dismissEventAction(event.id), "Event dismissed")}>
                    <Icon name="visibility_off" size={16} />
                    Dismiss event
                  </Button>
                )}
              </div>
            )}
            {event.isMock && (
              <p className="flex items-start gap-2 text-[12.5px] text-text-3">
                <Icon name="info" size={16} />
                {`This is a mock event from ${event.sourceKinds[0] ? (SOURCE_LABEL[event.sourceKinds[0] as EventSourceKind | "url"] ?? event.sourceKinds[0]) : "a mock provider"}. It can't go on your calendar or create follow-up tasks.`}
              </p>
            )}
          </div>
        </aside>
      </div>
      <AddToCalendarDialog open={calDialog} event={event} calendars={calendars} defaultCalendarId={defaultCalendarId} onClose={() => setCalDialog(false)} />
      <FollowUpDialog open={followDialog} event={event} onClose={() => setFollowDialog(false)} />
    </div>
  );
}
