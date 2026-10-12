import { and, eq, notInArray, sql } from "drizzle-orm";
import { isCategory } from "../../lib/calendar-categories";
import type { CalendarConnectionId } from "../../lib/calendar-types";
import { db, type DB } from "../db/client";
import { calendarEvents, calendars, settings } from "../db/schema";
import { aud } from "./connections";
import type { CalendarRef, RemoteCalendar } from "./types";

type Row = typeof calendars.$inferSelect;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

// Serialises every default-calendar write: under READ COMMITTED two clear-then-set transactions could both commit
// and leave two defaults. Statements after the lock see the other writer's committed change (IN-C02).
// The DB enforces one default (calendars_one_default_idx, migration 0004); the lock makes concurrent switches wait instead of failing on it.
const lockDefault = (tx: Tx) => tx.execute(sql`select pg_advisory_xact_lock(hashtext('lifeos.calendars.default'))`);

/** Sync the owner's calendar list. Keeps their enabled/category/default choices; new primary/owned calendars start ticked as Personal (D-01, D-02). */
export async function refreshCalendarList(h: DB = db(), connectionId: CalendarConnectionId, remote: RemoteCalendar[], account: string | null): Promise<void> {
  await h.transaction(async (tx) => {
    const existing = await tx.select().from(calendars).where(eq(calendars.connectionId, connectionId));
    for (const r of remote) {
      const base = { name: r.name, access: r.access, kind: r.kind, account };
      if (existing.some((e) => e.remoteId === r.remoteId)) {
        await tx.update(calendars).set({ ...base, updatedAt: new Date() }).where(and(eq(calendars.connectionId, connectionId), eq(calendars.remoteId, r.remoteId)));
      } else {
        const enabled = r.kind === "primary" || r.kind === "owned";
        await tx.insert(calendars).values({ connectionId, remoteId: r.remoteId, ...base, enabled, category: enabled ? "personal" : null, isDefault: false });
      }
    }
    // An empty list is far more likely a transient provider glitch than "every calendar deleted"; pruning on it would
    // cascade away the owner's settings and cached events (WR-A03). Disconnect removes everything explicitly.
    const keep = remote.map((r) => r.remoteId);
    if (keep.length) await tx.delete(calendars).where(and(eq(calendars.connectionId, connectionId), notInArray(calendars.remoteId, keep)));
    await lockDefault(tx);
    const all = await tx.select().from(calendars);
    if (!all.some((c) => c.isDefault)) {
      const first = all.find((c) => c.enabled && c.access !== "reader");
      if (first) await tx.update(calendars).set({ isDefault: true }).where(eq(calendars.id, first.id));
    }
  });
}

/** Unticking removes the calendar's events immediately and resets its sync state. */
export async function setCalendarEnabled(h: DB = db(), id: string, enabled: boolean): Promise<void> {
  await h.transaction(async (tx) => {
    await tx.update(calendars).set(enabled ? { enabled } : { enabled, syncCursor: null, ctag: null, isDefault: false }).where(eq(calendars.id, id));
    if (!enabled) await tx.delete(calendarEvents).where(eq(calendarEvents.calendarId, id));
  });
  await aud(h, "calendar.settings", id, { calendarId: id, field: "enabled", value: enabled }); // ids and enums only (WR-A07)
}

export async function setCalendarCategory(h: DB = db(), id: string, category: string): Promise<{ ok: true } | { ok: false; error: "category" }> {
  if (!isCategory(category)) return { ok: false, error: "category" };
  await h.update(calendars).set({ category }).where(eq(calendars.id, id));
  await aud(h, "calendar.settings", id, { calendarId: id, field: "category", value: category });
  return { ok: true };
}

export async function setDefaultCalendar(h: DB = db(), id: string): Promise<{ ok: true } | { ok: false; error: "not_writable" }> {
  const r = await h.transaction(async (tx) => {
    await lockDefault(tx);
    const [c] = await tx.select().from(calendars).where(eq(calendars.id, id));
    if (!c || !c.enabled || c.access === "reader") return { ok: false as const, error: "not_writable" as const };
    await tx.update(calendars).set({ isDefault: false }).where(eq(calendars.isDefault, true));
    await tx.update(calendars).set({ isDefault: true }).where(eq(calendars.id, id));
    return { ok: true as const };
  });
  if (r.ok) await aud(h, "calendar.settings", id, { calendarId: id, field: "isDefault", value: true });
  return r;
}

export async function setLastUsedCalendar(h: DB = db(), id: string): Promise<void> {
  await h
    .insert(settings)
    .values({ key: "calendar.last_used", value: id })
    .onConflictDoUpdate({ target: settings.key, set: { value: id, updatedAt: new Date() } });
}

export function calendarRef(r: Row): CalendarRef {
  return {
    id: r.id,
    connectionId: r.connectionId as CalendarRef["connectionId"],
    remoteId: r.remoteId,
    access: r.access === "owner" || r.access === "writer" ? r.access : "reader",
    syncCursor: r.syncCursor,
    ctag: r.ctag,
  };
}

export async function calendarById(h: DB = db(), id: string): Promise<Row | null> {
  const [r] = await h.select().from(calendars).where(eq(calendars.id, id));
  return r ?? null;
}
