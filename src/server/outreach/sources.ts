// OUT-01 owner source management: iCal feeds (D-04), URL import (D-05), organizer ids, interests (D-15).
// Feed URLs are AES-GCM at rest; DTOs expose host + label only. Fixed error codes, never URLs, in results/logs.
import { and, eq, sql } from "drizzle-orm";
import { INTERESTS_KEY, type EventSourceDTO, type EventSourceKind } from "../../lib/outreach-types";
import { isSafeUrl } from "../../lib/safe-url";
import { encrypt } from "../crypto";
import type { DB } from "../db/client";
import { eventSources, outreachEvents, settings } from "../db/schema";
import { notifyLive } from "../events";
import { log } from "../log";
import { safeGet, SafeGetError } from "../net/safe-get";
import { aud } from "./connections";
import { parseFeed } from "./ics";
import { extractEvent } from "./jsonld";
import { moveStage } from "./pipeline";
import { rescoreAll, upsertEvents } from "./sync";

type Get = typeof safeGet;

export type AddFeedResult = { ok: true; id: string } | { ok: false; error: "invalid" | "blocked" | "unreadable" };

export async function addFeed(h: DB, input: { label: string; url: string }, deps: { get?: Get; key?: Buffer; now?: Date } = {}): Promise<AddFeedResult> {
  const label = input.label.trim();
  const url = input.url.trim();
  if (label.length < 1 || label.length > 60 || !isSafeUrl(url)) return { ok: false, error: "invalid" };
  try {
    const r = await (deps.get ?? safeGet)(url, { maxBytes: 2_000_000, accept: "text/calendar" });
    parseFeed(r.body, deps.now ?? new Date()); // throws FeedError when it isn't iCal
  } catch (e) {
    if (e instanceof SafeGetError) return { ok: false, error: e.code === "blocked" ? "blocked" : e.code === "invalid" ? "invalid" : "unreadable" };
    return { ok: false, error: "unreadable" };
  }
  const [row] = await h.insert(eventSources).values({ kind: "ics", label, urlCiphertext: encrypt(url, deps.key), host: new URL(url).host }).returning({ id: eventSources.id });
  await aud(h, "outreach.feed.add", row!.id, { id: row!.id, host: new URL(url).host });
  return { ok: true, id: row!.id };
}

export async function setFeedEnabled(h: DB, id: string, enabled: boolean): Promise<boolean> {
  const r = await h.update(eventSources).set({ enabled, updatedAt: new Date() }).where(and(eq(eventSources.id, id), eq(eventSources.kind, "ics"))).returning({ id: eventSources.id });
  if (r.length) await aud(h, "outreach.feed.toggle", id, { id, enabled });
  return r.length > 0;
}

export async function removeFeed(h: DB, id: string): Promise<boolean> {
  const r = await h.delete(eventSources).where(and(eq(eventSources.id, id), eq(eventSources.kind, "ics"))).returning({ id: eventSources.id });
  if (r.length) await aud(h, "outreach.feed.remove", id, { id });
  return r.length > 0;
}

export async function saveEventbriteOrganizers(h: DB, ids: string[]): Promise<{ ok: true } | { ok: false; error: "invalid" }> {
  const clean = ids.map((i) => i.trim());
  if (clean.length > 20 || clean.some((i) => !/^\d{1,20}$/.test(i))) return { ok: false, error: "invalid" };
  await h.insert(eventSources).values({ kind: "eventbrite", label: "Eventbrite" }).onConflictDoNothing();
  // config replaced wholesale: dropping `discover` makes the next sync re-probe organizer listing.
  await h.update(eventSources).set({ config: { organizerIds: clean }, updatedAt: new Date() }).where(eq(eventSources.kind, "eventbrite"));
  await aud(h, "outreach.organizers", "eventbrite", { count: clean.length });
  return { ok: true };
}

export async function listEventSources(h: DB): Promise<EventSourceDTO[]> {
  const rows = await h
    .select({
      id: eventSources.id,
      kind: eventSources.kind,
      label: eventSources.label,
      host: eventSources.host,
      enabled: eventSources.enabled,
      lastSyncAt: eventSources.lastSyncAt,
      lastSyncError: eventSources.lastSyncError,
      config: eventSources.config,
    })
    .from(eventSources)
    .orderBy(eventSources.createdAt);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as EventSourceKind,
    label: r.label,
    host: r.host,
    enabled: r.enabled,
    lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
    lastSyncError: r.lastSyncError,
    discover: r.config.discover ?? null,
  }));
}

export type ImportResult = { ok: true; id: string; existed: boolean } | { ok: false; error: "invalid" | "blocked" | "unreachable" | "too_large" | "no_event" };

export async function importEventUrl(h: DB, url: string, deps: { get?: Get; now?: Date } = {}): Promise<ImportResult> {
  const u = url.trim();
  if (!isSafeUrl(u)) return { ok: false, error: "invalid" };
  const now = deps.now ?? new Date();
  let body: string;
  let finalUrl: string;
  try {
    const r = await (deps.get ?? safeGet)(u, { maxBytes: 2_000_000, accept: "text/html", truncateOk: true });
    body = r.body;
    finalUrl = r.finalUrl || u;
  } catch (e) {
    if (e instanceof SafeGetError) return { ok: false, error: e.code === "blocked" ? "blocked" : e.code === "invalid" ? "invalid" : e.code === "too_large" ? "too_large" : "unreachable" };
    return { ok: false, error: "unreachable" };
  }
  const raw = extractEvent(body, finalUrl);
  if (!raw) return { ok: false, error: "no_event" };
  const { added } = await upsertEvents(h, { id: "url", kind: "url" }, [raw], false, now, { filter: false });
  const [row] = await h
    .select({ id: outreachEvents.id, stage: outreachEvents.stage })
    .from(outreachEvents)
    .where(sql`${outreachEvents.sources} @> ${JSON.stringify([{ sourceId: "url", remoteId: raw.remoteId }])}::jsonb`)
    .limit(1);
  if (!row) return { ok: false, error: "no_event" };
  let existed = !added.includes(row.id);
  if (row.stage === null) {
    const m = await moveStage(h, row.id, null, "SAVED", now);
    if (!m.ok && m.error !== "changed") return { ok: false, error: "no_event" };
  } else existed = true;
  await rescoreAll(h, now);
  return { ok: true, id: row.id, existed };
}

export type InterestsResult = { ok: true } | { ok: false; error: "empty" | "too_long" | "too_many" | "duplicate" };

export async function saveInterests(h: DB, list: string[], now: Date = new Date()): Promise<InterestsResult> {
  const items = list.map((i) => i.trim());
  if (items.length > 20) return { ok: false, error: "too_many" };
  if (items.some((i) => !i)) return { ok: false, error: "empty" };
  if (items.some((i) => i.length > 40)) return { ok: false, error: "too_long" };
  if (new Set(items.map((i) => i.toLowerCase())).size !== items.length) return { ok: false, error: "duplicate" };
  await h.insert(settings).values({ key: INTERESTS_KEY, value: items }).onConflictDoUpdate({ target: settings.key, set: { value: items } });
  await rescoreAll(h, now);
  await notifyLive(h, "outreach", "interests");
  await aud(h, "outreach.interests", INTERESTS_KEY, { count: items.length });
  return { ok: true };
}

/** D-14: project changes refresh event scores. DB-only; a failure must never fail the project write. */
export async function rescoreAfterProjectChange(h: DB, now: Date): Promise<void> {
  try {
    await rescoreAll(h, now);
  } catch (err) {
    log.error({ err }, "outreach rescore failed");
  }
}
