"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { OutreachEventDTO } from "@/lib/outreach-types";
import type { SourceStatus } from "@/server/outreach/queries";
import { syncEventsNowAction } from "@/server/outreach-actions";
import { useLiveEvents } from "@/shell/live-provider";
import { useShell } from "@/shell/shell-provider";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";
import type { CalendarOption } from "./add-to-calendar-dialog";
import { EventList } from "./event-list";

const chip = (on: boolean) =>
  `inline-flex h-8 shrink-0 snap-start items-center gap-2 rounded-full border px-3.5 text-[13px] max-tab:min-h-11 ${
    on ? "border-[rgba(100,210,255,.45)] bg-[rgba(100,210,255,.12)] text-text" : "border-white/10 bg-white/[.03] text-text-2 hover:bg-white/[.06]"
  }`;

// Plan 17 appends EMAIL and FOLLOW-UPS here.
const TABS = [{ key: "events", label: "EVENTS" }] as const;

export function OutreachView({
  events,
  status,
  interests,
  calendars,
  defaultCalendarId,
  hideMock,
}: {
  events: OutreachEventDTO[];
  status: SourceStatus;
  interests: string[];
  calendars: CalendarOption[];
  defaultCalendarId: string | null;
  hideMock: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const { toast } = useShell();
  const [syncing, setSyncing] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useLiveEvents("outreach", () => router.refresh());

  const selected = useMemo(() => (sp.get("interest") ?? "").split(",").filter((i) => interests.includes(i)), [sp, interests]);
  const setParams = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    const qs = q.toString();
    router.replace(qs ? `/outreach?${qs}` : "/outreach", { scroll: false });
  };
  const toggleInterest = (i: string) => {
    const next = selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i];
    setParams({ interest: next.length ? next.join(",") : null });
  };

  const shown = useMemo(() => {
    if (selected.length === 0) return events;
    const want = selected.map((s) => s.toLowerCase());
    return events.filter((e) => e.signals.some((s) => s.label === "INTERESTS" && s.terms.some((t) => want.includes(t.toLowerCase()))));
  }, [events, selected]);

  const sync = async () => {
    setSyncing(true);
    const r = await syncEventsNowAction().catch(() => ({ ok: false }) as const);
    setSyncing(false);
    toast(r.ok ? "Sync started" : "Couldn't save that. Try again.", r.ok ? "success" : "error");
  };

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    tabRefs.current[(i + d + TABS.length) % TABS.length]?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Outreach" className="flex gap-6 overflow-x-auto border-b border-white/[.06]">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id="outreach-tab-events"
            aria-selected
            aria-controls="outreach-panel-events"
            tabIndex={0}
            onKeyDown={(e) => onTabKey(e, i)}
            onClick={() => setParams({ tab: null })}
            className="relative inline-flex h-10 items-center gap-2 text-[12.5px] font-medium tracking-[.1em] text-text uppercase after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-cyan"
          >
            {t.label}
            <Badge kind="count" tone="neutral">
              {events.length}
            </Badge>
          </button>
        ))}
      </div>

      <div role="tabpanel" id="outreach-panel-events" aria-labelledby="outreach-tab-events" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filter by interest" className="flex flex-wrap items-center gap-2">
            {interests.map((i) => (
              <button key={i} type="button" aria-pressed={selected.includes(i)} className={chip(selected.includes(i))} onClick={() => toggleInterest(i)}>
                {i}
              </button>
            ))}
            <Link href="/settings?section=outreach" className="inline-flex h-[26px] items-center rounded-full px-2.5 text-[12px] text-text-2 hover:bg-white/[.06] hover:text-text">
              Edit interests
            </Link>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {status.mockCount > 0 && (
              <button type="button" aria-pressed={hideMock} className={chip(hideMock)} onClick={() => setParams({ mock: hideMock ? "1" : "0" })}>
                <Icon name="visibility_off" size={16} />
                Hide mock
              </button>
            )}
            <Button variant="secondary" size="sm" loading={syncing} onClick={sync}>
              <Icon name="refresh" size={16} />
              Sync now
            </Button>
          </div>
        </div>
        <p className="text-[12.5px] text-text-3">{`${shown.length} events · Sydney · next 60 days · sorted by relevance`}</p>
        <span aria-live="polite" className="sr-only">{`${shown.length} events shown`}</span>
        <EventList
          events={shown}
          total={events.length}
          status={status}
          calendars={calendars}
          defaultCalendarId={defaultCalendarId}
          onClear={() => setParams({ interest: null })}
        />
      </div>
    </div>
  );
}
