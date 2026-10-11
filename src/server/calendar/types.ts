// Server-only calendar seam shared by the Google and iCloud adapters (ORG-01, ADR-010).
import type { ProviderName } from "./errors";

export type { ProviderName };

export type NormalizedEvent = {
  remoteId: string;
  url: string | null;
  etag: string | null;
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date | null;
  endAt: Date | null;
  allDay: boolean;
  startDate: string | null;
  endDate: string | null; // exclusive
  tz: string | null;
  recurrence: string[] | null;
  recurringRemoteId: string | null;
  originalStart: string | null;
  status: string;
  transparency: string;
  declined: boolean;
  raw: unknown; // Google event JSON or { ics: string }
};

export type StoredEvent = NormalizedEvent & { id: string; calendarId: string };

type Access = "owner" | "writer" | "reader";

export type CalendarRef = {
  id: string;
  connectionId: "google_calendar" | "icloud_calendar";
  remoteId: string;
  access: Access;
  syncCursor: string | null;
  ctag: string | null;
};

export type RemoteCalendar = {
  remoteId: string;
  name: string;
  access: Access;
  kind: "primary" | "owned" | "subscribed" | "holiday" | "birthday" | "other";
};

export type SyncWindow = { from: Date; to: Date };

/**
 * reset true = upserts are the complete current set for that calendar; the caller deletes every other row of it,
 * except rows whose url is in keepUrls (resources that exist remotely but could not be read this time).
 */
export type SyncResult = { upserts: NormalizedEvent[]; deletes: string[]; cursor: string | null; ctag?: string | null; reset: boolean; keepUrls?: string[] };

export type WriteScope = "this" | "following" | "all";

/** start/end: ISO instant (timed) or YYYY-MM-DD (all-day, end exclusive). "keep" leaves an existing rule untouched. */
export type EventWrite = {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  timeZone: string;
  location: string;
  description: string;
  showAs: "busy" | "free";
  repeat: "none" | "daily" | "weekly" | "monthly" | "yearly" | "keep";
  marker: string | null;
};

export type WriteResult = { upserts: NormalizedEvent[]; deletes: string[] };

export interface CalendarProvider {
  readonly name: ProviderName;
  listCalendars(): Promise<RemoteCalendar[]>;
  sync(cal: CalendarRef, window: SyncWindow): Promise<SyncResult>;
  create(cal: CalendarRef, input: EventWrite, opts?: { remoteId?: string }): Promise<WriteResult>;
  update(cal: CalendarRef, ev: StoredEvent, input: EventWrite, scope: WriteScope, instanceStart: string | null): Promise<WriteResult>;
  remove(cal: CalendarRef, ev: StoredEvent, scope: WriteScope, instanceStart: string | null): Promise<WriteResult>;
}
