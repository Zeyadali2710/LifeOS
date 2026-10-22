"use client";

import Link from "next/link";
import type { OutreachEventDTO } from "@/lib/outreach-types";
import type { SourceStatus } from "@/server/outreach/queries";
import { Button } from "@/legacy-ui/button";
import { EmptyState } from "@/legacy-ui/empty-state";
import { Icon } from "@/legacy-ui/icon";
import type { CalendarOption } from "./add-to-calendar-dialog";
import { EventCard } from "./event-card";

const MAX_ERRORS = 3;

export function SourceStrip({ status, onImport }: { status: SourceStatus; onImport?: () => void }) {
  const shown = status.failing.slice(0, MAX_ERRORS);
  const rest = status.failing.length - shown.length;
  if (status.hasRealSource && shown.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {!status.hasRealSource && (
        <div className="glass-card flex flex-wrap items-center gap-3 rounded-24 p-4">
          <Icon name="travel_explore" size={20} className="text-cyan" />
          <p className="min-w-0 flex-1 text-[13.5px] text-text">Add an iCal feed or import an event URL to see real Sydney events.</p>
          <Link href="/settings?section=connections#event-feeds" className="inline-flex h-[30px] items-center rounded-full border border-white/10 bg-white/[.03] px-3 text-[12.5px] font-medium text-text hover:bg-white/[.06]">
            Add a feed
          </Link>
          {onImport && (
            <Button variant="ghost" size="sm" onClick={onImport}>
              Import event
            </Button>
          )}
        </div>
      )}
      {shown.map((s) => (
        <div key={s.label} role="alert" className="flex flex-wrap items-center gap-3 rounded-24 border border-[rgba(255,105,97,.3)] bg-[rgba(255,105,97,.06)] p-4 text-[13px] text-text-2">
          <Icon name="error" size={18} className="text-red" />
          <span className="min-w-0 flex-1">{`${s.label} didn't sync: ${s.lastSyncError}. Showing the last events we have.`}</span>
          <Link href="/settings?section=connections" className="text-cyan">
            Open Settings
          </Link>
        </div>
      ))}
      {rest > 0 && <p className="text-[12.5px] text-text-3">{`and ${rest} more sources failed`}</p>}
    </div>
  );
}

export function EventList({
  events,
  total,
  status,
  calendars,
  defaultCalendarId,
  onClear,
  onImport,
}: {
  events: OutreachEventDTO[];
  /** events before the interest filter */
  total: number;
  status: SourceStatus;
  calendars: CalendarOption[];
  defaultCalendarId: string | null;
  onClear: () => void;
  onImport?: () => void;
}) {
  const feedLink = (
    <Link href="/settings?section=connections#event-feeds" className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/[.03] px-3.5 text-[13px] font-medium text-text hover:bg-white/[.06]">
      Add a feed
    </Link>
  );
  return (
    <div className="flex flex-col gap-3">
      <SourceStrip status={status} onImport={onImport} />
      {total === 0 ? (
        <EmptyState
          icon="event_busy"
          title="No events yet"
          body="Add an iCal feed in Settings or import an event page to start. Events in the next 60 days show up here, scored against your interests."
          action={feedLink}
        />
      ) : events.length === 0 ? (
        <EmptyState
          icon="event_busy"
          title="No events match these filters."
          body="Try removing a filter, or add more interests in Settings."
          action={
            <Button variant="secondary" onClick={onClear}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-3">
          {events.map((e) => (
            <li key={e.id} className="flex flex-col *:flex-1">
              <EventCard event={e} calendars={calendars} defaultCalendarId={defaultCalendarId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
