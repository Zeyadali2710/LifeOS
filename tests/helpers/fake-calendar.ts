// Labelled mock (ADR-010): tests only, never wired in production.
import type { ProviderName } from "@/server/calendar/errors";
import type { CalendarProvider, CalendarRef, RemoteCalendar, SyncResult, SyncWindow } from "@/server/calendar/types";

export type FakeCalendarState = {
  calendars: RemoteCalendar[];
  /** Scripted sync result per calendar remoteId; a function lets a test vary it per call. */
  results: Record<string, SyncResult | (() => SyncResult)>;
  /** Thrown from listCalendars / sync when set. */
  listError?: Error;
  syncError?: Error;
};

export type FakeCalendarProvider = CalendarProvider & { calls: { list: number; sync: { ref: CalendarRef; window: SyncWindow }[] } };

export function fakeCalendarProvider(name: ProviderName, state: FakeCalendarState): FakeCalendarProvider {
  const calls: FakeCalendarProvider["calls"] = { list: 0, sync: [] };
  const unscripted = async () => {
    throw new Error("fake calendar provider: write not scripted");
  };
  return {
    name,
    calls,
    async listCalendars() {
      calls.list++;
      if (state.listError) throw state.listError;
      return state.calendars;
    },
    async sync(ref, window) {
      calls.sync.push({ ref, window });
      if (state.syncError) throw state.syncError;
      const r = state.results[ref.remoteId];
      if (!r) return { upserts: [], deletes: [], cursor: ref.syncCursor, reset: false };
      return typeof r === "function" ? r() : r;
    },
    create: unscripted,
    update: unscripted,
    remove: unscripted,
  };
}
