import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { CalendarConnectionId } from "../../lib/calendar-types";
import { db, type DB } from "../db/client";
import { calendarEvents, calendars, connections, settings } from "../db/schema";
import { emitActivity, notifyLive } from "../events";
import { log } from "../log";
import { sydneyInstant, sydneyParts, TZ } from "../time";
import { calendarRef, refreshCalendarList } from "./calendars";
import { markCalendarError, recordCalendarSync } from "./connections";
import { ProviderError, providerLabel } from "./errors";
import { conflictsIn } from "./queries";
import type { CalendarProvider, NormalizedEvent } from "./types";

export const SYNC_WINDOW_DAYS = { back: 30, ahead: 365 };

const IDS: CalendarConnectionId[] = ["google_calendar", "icloud_calendar"];
const DAY = 86_400_000;
const MAX_EVENTS = 5;
const CONFLICT_KEY = "calendar.notified_conflicts";

export type CalendarSyncResult =
  | { skipped: "not_connected" | "paused" }
  | { error: "auth" | "rate_limit" | "other" }
  | { ok: true; changed: number; calendars: number };

type Opts = {
  handle?: DB;
  providerFor: (id: CalendarConnectionId, h: DB) => Promise<CalendarProvider>;
  emit?: typeof emitActivity;
  now?: () => Date;
};

const startOf = (e: { startAt: Date | null; startDate: string | null }) => {
  if (e.startAt) return e.startAt;
  const m = e.startDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? sydneyInstant(+m[1]!, +m[2]!, +m[3]!, 0) : null;
};

// "Sat 10 Oct 09:30" in Sydney time.
function when(d: Date) {
  const p = sydneyParts(d);
  const mon = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, month: "short" }).format(d);
  return `${p.weekday} ${p.day} ${mon} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
const ymd = (d: Date) => {
  const p = sydneyParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

type Change = { kind: "added" | "changed" | "cancelled"; title: string; start: Date | null };
const LABEL = { added: "Event added", changed: "Event changed", cancelled: "Event cancelled" } as const;

export function createCalendarSync(opts: Opts) {
  async function run(): Promise<Record<CalendarConnectionId, CalendarSyncResult>> {
    const h = opts.handle ?? db();
    const emit = opts.emit ?? emitActivity;
    const now = (opts.now ?? (() => new Date()))();
    const rows = await h.select({ id: connections.id, status: connections.status, lastSyncAt: connections.lastSyncAt, lastSyncError: connections.lastSyncError, login: connections.login }).from(connections).where(inArray(connections.id, IDS));
    const out = {} as Record<CalendarConnectionId, CalendarSyncResult>;
    const changes: Change[] = [];
    let changedNonFirst = 0;

    for (const id of IDS) {
      const conn = rows.find((r) => r.id === id);
      if (!conn) {
        out[id] = { skipped: "not_connected" };
        continue;
      }
      if (conn.status === "error") {
        out[id] = { skipped: "paused" };
        continue;
      }
      const firstSync = !conn.lastSyncAt;
      try {
        const provider = await opts.providerFor(id, h);
        await refreshCalendarList(h, id, await provider.listCalendars(), conn.login);
        const cals = await h.select().from(calendars).where(and(eq(calendars.connectionId, id), eq(calendars.enabled, true), isNotNull(calendars.category)));
        const window = { from: new Date(now.getTime() - SYNC_WINDOW_DAYS.back * DAY), to: new Date(now.getTime() + SYNC_WINDOW_DAYS.ahead * DAY) };
        let changed = 0;
        for (const cal of cals) {
          const r = await provider.sync(calendarRef(cal), window);
          const prev = new Map((await h.select().from(calendarEvents).where(eq(calendarEvents.calendarId, cal.id))).map((e) => [e.remoteId, e]));
          const seen = new Set(r.upserts.map((e) => e.remoteId));
          const gone = new Set(r.deletes.filter((x) => prev.has(x)));
          const keep = new Set(r.keepUrls ?? []);
          if (r.reset) for (const [k, o] of prev) if (!seen.has(k) && !(o.url && keep.has(o.url))) gone.add(k);
          const local: Change[] = [];
          for (const e of r.upserts) {
            const o = prev.get(e.remoteId);
            const same = o && (e.etag ? o.etag === e.etag : o.title === e.title && o.startAt?.getTime() === e.startAt?.getTime() && o.startDate === e.startDate);
            if (!same) local.push({ kind: o ? "changed" : "added", title: e.title, start: startOf(e) });
          }
          for (const k of gone) {
            const o = prev.get(k)!;
            local.push({ kind: "cancelled", title: o.title, start: startOf(o) });
          }
          // Rows first, cursor last (T-04-37): a failure leaves the old cursor so the next run retries.
          await h.transaction(async (tx) => {
            for (const e of r.upserts) {
              const row = rowOf(cal.id, e);
              await tx.insert(calendarEvents).values(row).onConflictDoUpdate({ target: [calendarEvents.calendarId, calendarEvents.remoteId], set: { ...row, updatedAt: now } });
            }
            if (gone.size) await tx.delete(calendarEvents).where(and(eq(calendarEvents.calendarId, cal.id), inArray(calendarEvents.remoteId, [...gone])));
            await tx.update(calendars).set({ syncCursor: r.cursor, ...(r.ctag !== undefined ? { ctag: r.ctag } : {}), lastSyncedAt: now }).where(eq(calendars.id, cal.id));
          });
          changed += local.length;
          if (!firstSync) changes.push(...local);
        }
        await recordCalendarSync(h, id, { at: now, error: null });
        // A cleared error must reach open pages too, or the error banner stays up until the next poll (WR-B03).
        if (changed > 0 || conn.lastSyncError) await notifyLive(h, "calendar", id);
        if (changed > 0 && !firstSync) changedNonFirst += changed;
        out[id] = { ok: true, changed, calendars: cals.length };
      } catch (e) {
        if (e instanceof ProviderError && e.kind === "auth") {
          await markCalendarError(h, id, "Access was rejected.");
          const title = `${providerLabel(e.provider)} Calendar needs attention`;
          await emit(
            { type: "calendar.connection_error", source: "calendar", title, tone: "red" },
            { category: "IMPORTANT", title, body: "Access was rejected. Syncing is paused.", actionUrl: "/settings?section=connections" },
            h,
          );
          out[id] = { error: "auth" };
          continue;
        }
        const label = e instanceof ProviderError ? providerLabel(e.provider) : null;
        const rate = e instanceof ProviderError && e.kind === "rate_limit";
        if (!(e instanceof ProviderError)) log.error({ err: e }, "calendar sync failed");
        const msg = rate ? `${label} rate limit reached.` : e instanceof ProviderError && e.kind === "unavailable" ? `${label} didn't respond.` : "Sync failed. Retrying in 5 minutes.";
        await recordCalendarSync(h, id, { at: now, error: msg }).catch(() => {});
        if (!conn.lastSyncError) await notifyLive(h, "calendar", id);
        out[id] = { error: rate ? "rate_limit" : "other" };
      }
    }

    // Meaningful = start within the next 7 days (D-03); max 5 per run plus one summary (T-04-36).
    const horizon = now.getTime() + 7 * DAY;
    const meaningful = changes.filter((c) => c.start && c.start.getTime() >= now.getTime() && c.start.getTime() < horizon);
    for (const c of meaningful.slice(0, MAX_EVENTS)) {
      await emit({ type: `calendar.event.${c.kind}`, source: "calendar", title: LABEL[c.kind], detail: `${c.title} · ${when(c.start!)}` }, undefined, h);
    }
    if (meaningful.length) await emit({ type: "calendar.synced", source: "calendar", title: "Calendar synced", detail: `${meaningful.length} updates` }, undefined, h);

    if (changedNonFirst > 0) await notifyConflicts(h, emit, now);
    return out;
  }
  return { run };
}

function rowOf(calendarId: string, e: NormalizedEvent) {
  return { calendarId, ...e, raw: e.raw ?? {} };
}

async function notifyConflicts(h: DB, emit: typeof emitActivity, now: Date) {
  const [s] = await h.select().from(settings).where(eq(settings.key, CONFLICT_KEY));
  const seen: Record<string, string> = {};
  for (const [k, at] of Object.entries((s?.value ?? {}) as Record<string, string>)) if (now.getTime() - Date.parse(at) < 3 * DAY) seen[k] = at;
  for (const c of await conflictsIn(h, now, new Date(now.getTime() + 2 * DAY))) {
    const key = `${[c.a, c.b].sort().join("|")}@${c.start}`;
    if (seen[key]) continue;
    seen[key] = now.toISOString();
    const at = new Date(c.start);
    await emit(
      { type: "calendar.conflict", source: "calendar", title: "Conflict found", detail: `${c.aTitle} overlaps ${c.bTitle} · ${when(at)}`, tone: "red" },
      { category: "IMPORTANT", title: "Schedule conflict", body: `${c.aTitle} overlaps ${c.bTitle} on ${when(at)}.`, actionUrl: `/organization?view=day&date=${ymd(at)}` },
      h,
    );
  }
  await h.insert(settings).values({ key: CONFLICT_KEY, value: seen }).onConflictDoUpdate({ target: settings.key, set: { value: seen, updatedAt: now } });
}
