// Outreach read model (server only). Explicit column lists: event_sources.url_ciphertext is never selected.
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { DEFAULT_INTERESTS, INTERESTS_KEY, type OutreachEventDTO, type Signal, type Stage } from "../../lib/outreach-types";
import type { DB } from "../db/client";
import { connections, eventSources, outreachEvents, settings } from "../db/schema";

type Row = typeof outreachEvents.$inferSelect;

export function toEventDTO(r: Row): OutreachEventDTO {
  return {
    id: r.id,
    title: r.title,
    startAt: r.startAt.toISOString(),
    endAt: r.endAt?.toISOString() ?? null,
    allDay: r.allDay,
    timeZone: r.timeZone,
    location: r.location,
    online: r.online,
    organizer: r.organizer,
    priceText: r.priceText,
    url: r.url,
    description: r.description,
    categories: r.categories,
    isMock: r.isMock,
    sourceKinds: [...new Set(r.sources.map((s) => s.kind))],
    score: r.score,
    signals: Array.isArray(r.signals) ? (r.signals as Signal[]) : [],
    why: r.why,
    stage: r.stage as Stage | null,
    calendarEventId: r.calendarEventId,
    dismissedAt: r.dismissedAt?.toISOString() ?? null,
  };
}

// An event is current until it ends (or, with no end, until a day after its start).
const notOver = (now: Date) => or(gte(outreachEvents.endAt, now), and(isNull(outreachEvents.endAt), gte(outreachEvents.startAt, new Date(+now - 86400_000))));
const listWhere = (now: Date, hideMock: boolean) => and(isNull(outreachEvents.dismissedAt), notOver(now), hideMock ? eq(outreachEvents.isMock, false) : undefined);

export async function loadOutreachEvents(h: DB, now: Date, o: { hideMock: boolean }): Promise<OutreachEventDTO[]> {
  const rows = await h.select().from(outreachEvents).where(listWhere(now, o.hideMock)).orderBy(desc(outreachEvents.score), asc(outreachEvents.startAt));
  return rows.map(toEventDTO);
}

export async function eventCount(h: DB, now: Date, hideMock: boolean): Promise<number> {
  const [r] = await h.select({ n: sql<number>`count(*)::int` }).from(outreachEvents).where(listWhere(now, hideMock));
  return r?.n ?? 0;
}

export async function loadEvent(h: DB, id: string): Promise<OutreachEventDTO | null> {
  const [r] = await h.select().from(outreachEvents).where(eq(outreachEvents.id, id));
  return r ? toEventDTO(r) : null;
}

/** Saved events of any date (the pipeline board), not dismissed. */
export async function pipelineEvents(h: DB): Promise<OutreachEventDTO[]> {
  const rows = await h.select().from(outreachEvents).where(and(isNotNull(outreachEvents.stage), isNull(outreachEvents.dismissedAt))).orderBy(asc(outreachEvents.startAt));
  return rows.map(toEventDTO);
}

export type SourceStatus = { hasRealSource: boolean; mockCount: number; failing: { label: string; lastSyncError: string }[] };

export async function sourceStatus(h: DB): Promise<SourceStatus> {
  const [src, keys, [m]] = await Promise.all([
    h.select({ kind: eventSources.kind, label: eventSources.label, enabled: eventSources.enabled, lastSyncError: eventSources.lastSyncError }).from(eventSources).orderBy(eventSources.createdAt),
    h.select({ id: connections.id }).from(connections).where(inArray(connections.id, ["eventbrite", "luma"])),
    h.select({ n: sql<number>`count(*)::int` }).from(outreachEvents).where(and(eq(outreachEvents.isMock, true), isNull(outreachEvents.dismissedAt))),
  ]);
  return {
    hasRealSource: src.some((s) => s.kind === "ics" && s.enabled) || keys.length > 0,
    mockCount: m?.n ?? 0,
    failing: src.filter((s) => s.enabled && s.lastSyncError).map((s) => ({ label: s.label, lastSyncError: s.lastSyncError! })),
  };
}

export async function loadInterests(h: DB): Promise<string[]> {
  const [s] = await h.select({ v: settings.value }).from(settings).where(eq(settings.key, INTERESTS_KEY));
  return Array.isArray(s?.v) && s.v.every((x) => typeof x === "string") ? (s.v as string[]) : DEFAULT_INTERESTS;
}
