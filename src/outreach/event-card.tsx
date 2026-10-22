"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { SOURCE_LABEL, STAGE, STAGE_ORDER, STAGES, type EventSourceKind, type OutreachEventDTO, type Stage } from "@/lib/outreach-types";
import { ProgressRing } from "@/legacy-ui/progress-ring";
import { Badge } from "@/legacy-ui/badge";
import { Icon } from "@/legacy-ui/icon";
import type { IconName } from "@/legacy-ui/icon-names";
import { AddToCalendarDialog, type CalendarOption } from "./add-to-calendar-dialog";
import { dateShort, dayNum, scoreColor, sydneyYmd, timeRange, wd } from "./fmt";
import { useStage } from "./use-stage";
import { WhyBlock } from "./why-block";

const sourceLabel = (k: string) => SOURCE_LABEL[k as EventSourceKind | "url"] ?? k;

/** Chips row shared by the card and the detail page. `max` limits category chips (card: 3). */
export function EventBadges({ event, stage, maxCategories = 3, maxSources = 2 }: { event: OutreachEventDTO; stage: Stage | null; maxCategories?: number; maxSources?: number }) {
  const src = event.sourceKinds.slice(0, maxSources);
  const more = event.sourceKinds.length - src.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {event.categories.slice(0, maxCategories).map((c) => (
        <Badge key={c} kind="tag" tone="blue">
          {c}
        </Badge>
      ))}
      {event.isMock && (
        <Badge kind="tag" tone="amber">
          MOCK
        </Badge>
      )}
      {src.map((k) => (
        <Badge key={k} kind="tag" tone="neutral">
          {sourceLabel(k)}
        </Badge>
      ))}
      {more > 0 && (
        <Badge kind="tag" tone="neutral">{`+${more}`}</Badge>
      )}
      {stage && (
        <Badge kind="status" tone={STAGE[stage].tone}>
          {STAGE[stage].label}
        </Badge>
      )}
      {event.calendarEventId && (
        <Badge kind="status" tone="green">
          On calendar
        </Badge>
      )}
    </div>
  );
}

export function EventMeta({ event }: { event: OutreachEventDTO }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-text-2">
      <span className="inline-flex items-center gap-1.5">
        <Icon name={event.online ? "public" : "location_on"} size={15} className="text-text-3" />
        {event.online ? "Online" : (event.location ?? "Location unknown")}
      </span>
      {event.organizer && (
        <span className="inline-flex items-center gap-1.5">
          <Icon name="groups" size={15} className="text-text-3" />
          {event.organizer}
        </span>
      )}
    </div>
  );
}

const cell =
  "inline-flex h-10 items-center justify-center gap-1.5 text-[12.5px] max-tab:h-11 [@media(pointer:coarse)]:h-11 disabled:cursor-not-allowed disabled:text-text-3 enabled:hover:bg-white/[.05]";

export function EventCard({ event, calendars, defaultCalendarId }: { event: OutreachEventDTO; calendars: CalendarOption[]; defaultCalendarId: string | null }) {
  const { stage, move } = useStage(event.id, event.stage);
  const [dialog, setDialog] = useState(false);
  const uid = useId();
  const idx = STAGE_ORDER.indexOf(stage); // 0 = discovered
  const price = event.priceText ? ` · ${event.priceText}` : "";

  const cells: { label: string; name: string; icon: IconName; to: Stage; reason?: string }[] = [
    { label: "Save", name: `Save ${event.title}`, icon: "bookmark", to: STAGES[0] },
    { label: "Interested", name: `Mark ${event.title} interested`, icon: "star", to: STAGES[1], reason: idx < 1 ? "Save it first" : undefined },
    { label: "Attend", name: `Attend ${event.title}`, icon: "check_circle", to: STAGES[2], reason: idx < 1 ? "Save it first" : idx < 2 ? "Mark Interested first" : undefined },
  ];
  const calReason = event.isMock ? "Mock events can't go on your calendar." : idx < 3 ? "Mark Attending first" : undefined;
  const linked = event.calendarEventId;

  return (
    <article className="glass-card relative flex flex-col overflow-hidden rounded-24 transition duration-150 hover:-translate-y-px hover:border-white/[.16]">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3.5">
          <div className="flex h-[52px] w-12 shrink-0 flex-col items-center justify-center rounded-14 border border-white/[.07] bg-white/[.04]" aria-hidden="true">
            <span className="text-[10px] font-medium tracking-[.1em] text-text-3 uppercase">{wd(event.startAt)}</span>
            <span className="font-display text-[20px] leading-none">{dayNum(event.startAt)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 font-display text-[20px] leading-[1.12] font-normal">
              <Link href={`/outreach/events/${event.id}`} className="text-text after:absolute after:inset-0 after:content-['']">
                {event.title}
              </Link>
            </h3>
            <p className="mt-1 text-[12.5px] text-text-2">
              <span className="sr-only">{dateShort(event.startAt)}. </span>
              {`${timeRange(event)}${price}`}
            </p>
          </div>
          <ProgressRing pct={event.score} size={44} stroke={4} color={scoreColor(event.score)} text={String(event.score)} label={`Relevance ${event.score} out of 100`} />
        </div>
        <EventMeta event={event} />
        <EventBadges event={event} stage={stage} />
        <WhyBlock why={event.why} />
      </div>
      <div className="relative z-10 grid grid-cols-4 border-t border-white/[.06]">
        {cells.map((c, i) => {
          const reached = idx >= i + 1;
          const next = idx === i;
          const rid = `${uid}-r${i}`;
          return (
            <span key={c.label} className="flex border-r border-white/[.05]">
              <button
                type="button"
                aria-label={c.name}
                aria-pressed={reached}
                aria-describedby={c.reason ? rid : undefined}
                title={c.reason}
                disabled={!reached && !next}
                onClick={() => next && move(c.to)}
                className={`${cell} w-full ${reached ? "bg-[rgba(10,132,255,.08)] text-[#9fd8ff]" : "text-text-2"}`}
              >
                <Icon name={c.icon} size={17} fill={reached} />
                {c.label}
              </button>
              {c.reason && (
                <span id={rid} className="sr-only">
                  {c.reason}
                </span>
              )}
            </span>
          );
        })}
        <span className="flex">
          {linked ? (
            <Link
              href={`/organization?view=day&date=${sydneyYmd(event.startAt)}&event=${linked}`}
              aria-label={`${event.title} is on your calendar`}
              className={`${cell} w-full bg-[rgba(10,132,255,.08)] text-[#9fd8ff]`}
            >
              <Icon name="event" size={17} fill />
              On calendar
            </Link>
          ) : (
            <>
              <button
                type="button"
                aria-label={`Add ${event.title} to calendar`}
                aria-pressed={false}
                aria-describedby={calReason ? `${uid}-cal` : undefined}
                title={calReason}
                disabled={!!calReason}
                onClick={() => setDialog(true)}
                className={`${cell} w-full text-text-2`}
              >
                <Icon name="event" size={17} />
                Calendar
              </button>
              {calReason && (
                <span id={`${uid}-cal`} className="sr-only">
                  {calReason}
                </span>
              )}
            </>
          )}
        </span>
      </div>
      <AddToCalendarDialog open={dialog} event={event} calendars={calendars} defaultCalendarId={defaultCalendarId} onClose={() => setDialog(false)} />
    </article>
  );
}
