// Labelled mock (ADR-010): tests only, never wired in production.
import type { ProviderName } from "@/server/calendar/errors";
import type { CalendarProvider, CalendarRef, RemoteCalendar, SyncResult, SyncWindow, WriteResult } from "@/server/calendar/types";

export type FakeCalendarState = {
  calendars: RemoteCalendar[];
  /** Scripted sync result per calendar remoteId; a function lets a test vary it per call. */
  results: Record<string, SyncResult | (() => SyncResult)>;
  /** Thrown from listCalendars / sync when set. */
  listError?: Error;
  syncError?: Error;
  /** Scripted writes; an unscripted write throws so a test notices an unexpected call. */
  create?: CalendarProvider["create"];
  update?: CalendarProvider["update"];
  remove?: CalendarProvider["remove"];
};

type Args<K extends "create" | "update" | "remove"> = Parameters<CalendarProvider[K]>;
export type FakeCalendarProvider = CalendarProvider & {
  calls: { list: number; sync: { ref: CalendarRef; window: SyncWindow }[]; create: Args<"create">[]; update: Args<"update">[]; remove: Args<"remove">[] };
};

export function fakeCalendarProvider(name: ProviderName, state: FakeCalendarState): FakeCalendarProvider {
  const calls: FakeCalendarProvider["calls"] = { list: 0, sync: [], create: [], update: [], remove: [] };
  const unscripted = async (): Promise<WriteResult> => {
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
    async create(...a) {
      calls.create.push(a);
      return (state.create ?? unscripted)(...a);
    },
    async update(...a) {
      calls.update.push(a);
      return (state.update ?? unscripted)(...a);
    },
    async remove(...a) {
      calls.remove.push(a);
      return (state.remove ?? unscripted)(...a);
    },
  };
}
