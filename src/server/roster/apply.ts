// Work roster (Phase 13): an owner-enabled rule that keeps the roster's shifts in a chosen calendar. No model sees these emails.
import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { createEvent, deleteEvent, updateEvent, type WriteCtx } from "../calendar/events";
import { ProviderError } from "../calendar/errors";
import type { DB } from "../db/client";
import { calendarEvents, settings } from "../db/schema";
import { TZ } from "../time";
import type { Roster } from "./parse";

export const ROSTER_CONFIG_KEY = "roster.config";
export const ROSTER_SENDER = "rosters@burps.com.au";
export const rosterConfigInput = z.object({
  enabled: z.boolean(),
  calendarId: z.uuid().nullable(),
  sender: z.email().max(200),
  // Roster header text (often cut short) -> the name shown on events.
  branches: z.record(z.string().trim().min(1).max(80), z.string().trim().min(1).max(80)),
});
export type RosterConfig = z.infer<typeof rosterConfigInput>;
const DEFAULTS: RosterConfig = { enabled: false, calendarId: null, sender: ROSTER_SENDER, branches: {} };

export async function rosterConfig(h: DB): Promise<RosterConfig> {
  const [r] = await h.select({ v: settings.value }).from(settings).where(eq(settings.key, ROSTER_CONFIG_KEY));
  const p = rosterConfigInput.safeParse(r?.v);
  return p.success ? p.data : DEFAULTS;
}

/** INBOX only: spam or trash from a forged sender never writes. */
export const isRosterMail = (cfg: RosterConfig, m: { fromAddress: string; labelIds: string[] }) =>
  cfg.enabled && !!cfg.calendarId && m.fromAddress.toLowerCase() === cfg.sender.toLowerCase() && m.labelIds.includes("INBOX") && !m.labelIds.some((l) => l === "SPAM" || l === "TRASH");

const LOCK = "roster.lock";
const STALE_LOCK_MS = 10 * 60_000;

/**
 * One reconciliation at a time across workers; null when another holds the lease (taken over after 10 minutes).
 * f gets renew(): call it before each email; false = the lease was taken over, stop writing.
 */
export async function withRosterLease<T>(h: DB, now: Date, f: (renew: () => Promise<boolean>) => Promise<T>): Promise<T | null> {
  const token = randomUUID();
  const got = await h
    .insert(settings)
    .values({ key: LOCK, value: token, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: token, updatedAt: now }, setWhere: lt(settings.updatedAt, new Date(+now - STALE_LOCK_MS)) })
    .returning({ k: settings.key });
  if (!got.length) return null;
  try {
    const renew = async () => (await h.update(settings).set({ updatedAt: new Date(Math.max(+now, Date.now())) }).where(and(eq(settings.key, LOCK), eq(settings.value, token))).returning({ k: settings.key })).length > 0;
    return await f(renew);
  } finally {
    await h.delete(settings).where(and(eq(settings.key, LOCK), eq(settings.value, token)));
  }
}

/** A shift as written to the calendar. eventId null = a create is in flight under `key`; a retry adopts it. */
type Applied = { date: string; branch: string; name: string; start: string; end: string; break: string | null; calendarId: string; eventId: string | null; key: string };
/** shifts = what the calendar holds; gmailId/receivedAt = the last email fully applied. */
type WeekState = { gmailId: string | null; receivedAt: string | null; shifts: Applied[] };
export const rosterWeekKey = (weekStart: string) => `roster.week.${weekStart}`;

export type Reconciled = { added: number; changed: number; removed: number };

const notFound = (e: unknown) => e instanceof ProviderError && e.kind === "not_found";
const input = (a: Applied) => ({
  title: `Work · ${a.name}`,
  start: a.start,
  end: a.end,
  allDay: false,
  timeZone: TZ,
  location: a.name,
  description: [a.break && `Break ${a.break}`, "From your work roster."].filter(Boolean).join("\n"),
  showAs: "busy" as const,
  repeat: "none" as const,
});

/**
 * Brings the roster's week in the calendar to `r`: update changed shifts, delete removed ones, add new ones. Only events
 * recorded in the week's state are touched. Returns null when this email (or a newer one) was already applied.
 * Throws on calendar failure; progress is checkpointed, so a retry continues where it stopped.
 */
export async function reconcileRoster(h: DB, cfg: RosterConfig & { calendarId: string }, r: Roster, src: { gmailId: string; receivedAt: Date }, ctx: WriteCtx): Promise<Reconciled | null> {
  const key = rosterWeekKey(r.weekStart);
  const [row] = await h.select({ v: settings.value }).from(settings).where(eq(settings.key, key));
  const state: WeekState = (row?.v as WeekState | undefined) ?? { gmailId: null, receivedAt: null, shifts: [] };
  if (state.gmailId === src.gmailId || (state.receivedAt && Date.parse(state.receivedAt) > +src.receivedAt)) return null;
  const save = async () => {
    await h.insert(settings).values({ key, value: state }).onConflictDoUpdate({ target: settings.key, set: { value: state, updatedAt: ctx.now() } });
  };
  const fail = (what: string, error: string) => new Error(`Roster ${what} failed: ${error}`);
  const etag = async (id: string) => (await h.select({ e: calendarEvents.etag }).from(calendarEvents).where(eq(calendarEvents.id, id)))[0];

  async function create(a: Applied) {
    const w = await createEvent(h, { calendarId: a.calendarId, input: input(a), idKey: a.key }, ctx);
    if (!w.ok) throw fail("create", w.error);
    a.eventId = w.eventId;
    await save();
  }
  /**
   * Deletes a's event; one that's already gone counts as deleted. A calendar LifeOS can no longer write to (unsynced or
   * read-only since) is let go too, so one stale calendar can't block every later roster for the week.
   */
  async function remove(a: Applied) {
    const cur = a.eventId ? await etag(a.eventId) : undefined;
    if (!cur) return;
    try {
      const w = await deleteEvent(h, { eventId: a.eventId!, etag: cur.e, scope: "all", instanceStart: null }, ctx);
      if (!w.ok && w.error !== "not_found" && w.error !== "read_only") throw fail("delete", w.error);
    } catch (e) {
      if (!notFound(e)) throw e;
    }
  }
  /** true = updated in place; false = the event is gone. */
  async function update(a: Applied, next: Applied) {
    const cur = a.eventId ? await etag(a.eventId) : undefined;
    if (!cur) return false;
    try {
      const w = await updateEvent(h, { eventId: a.eventId!, etag: cur.e, scope: "all", instanceStart: null, input: input(next) }, ctx);
      if (w.ok) return true;
      if (w.error !== "not_found") throw fail("update", w.error);
    } catch (e) {
      if (!notFound(e)) throw e;
    }
    return false;
  }

  for (const a of state.shifts) if (!a.eventId) await create(a); // finish creates a crashed run started

  const n: Reconciled = { added: 0, changed: 0, removed: 0 };
  const want = new Map(r.shifts.map((s) => [`${s.date}|${s.branch}`, s]));
  for (const a of [...state.shifts]) {
    const s = want.get(`${a.date}|${a.branch}`);
    want.delete(`${a.date}|${a.branch}`);
    if (!s) {
      await remove(a);
      state.shifts = state.shifts.filter((x) => x !== a);
      await save();
      n.removed++;
      continue;
    }
    const fields = { name: cfg.branches[s.branch] ?? s.branch, start: s.start, end: s.end, break: s.break };
    // Unchanged: leave it, even if the owner deleted or moved the event.
    if (a.name === fields.name && a.start === fields.start && a.end === fields.end && a.break === fields.break) continue;
    n.changed++;
    if (a.calendarId === cfg.calendarId && (await update(a, { ...a, ...fields }))) {
      Object.assign(a, fields);
      await save();
      continue;
    }
    // Gone, or the roster calendar changed since: write it fresh in the configured calendar.
    if (a.calendarId !== cfg.calendarId) await remove(a);
    Object.assign(a, fields, { calendarId: cfg.calendarId, eventId: null, key: randomUUID() });
    await save();
    await create(a);
  }
  for (const s of want.values()) {
    const a: Applied = { date: s.date, branch: s.branch, name: cfg.branches[s.branch] ?? s.branch, start: s.start, end: s.end, break: s.break, calendarId: cfg.calendarId, eventId: null, key: randomUUID() };
    state.shifts.push(a);
    await save();
    await create(a);
    n.added++;
  }
  state.gmailId = src.gmailId;
  state.receivedAt = src.receivedAt.toISOString();
  await save();
  return n;
}
