// OUT-01 sync: providers -> normalize -> upsert/merge (D-11) -> rescore -> prune (D-12) -> one activity (D-13).
// Owner pipeline state (stage, stageChangedAt, dismissedAt, calendarEventId) is never written here (Pitfall 6).
import { and, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { CATEGORY_LABEL, type ProjectCategory } from "../../lib/project-types";
import {
  DEFAULT_INTERESTS,
  EVENT_SOURCE_KINDS,
  INTERESTS_KEY,
  SOURCE_LABEL,
  type RawEvent,
} from "../../lib/outreach-types";
import { sched, loadInstances } from "../calendar/queries";
import { db, type DB } from "../db/client";
import { calendars, connections, eventSources, outreachEvents, projects, settings } from "../db/schema";
import { emitActivity, notifyLive } from "../events";
import { log } from "../log";
import type { safeGet } from "../net/safe-get";
import { canonTitle, canonUrl, inWindow, minuteKey, sameEvent, sydneyCheck } from "./normalize";
import { markEventKeyError } from "./connections";
import { DISCOVER_DENIED, ProviderAuthError, providerForSource, SourceError } from "./providers";
import { projectKeywords, scoreEvent } from "./score";

const DAY = 86_400_000;
type Src = { sourceId: string; kind: string; remoteId: string };

export async function upsertEvents(
  h: DB,
  source: { id: string; kind: string },
  raws: RawEvent[],
  isMock: boolean,
  now: Date,
  opts: { filter?: boolean } = {},
): Promise<{ added: string[]; updated: number }> {
  const added: string[] = [];
  let updated = 0;
  let invalid = 0;
  await h.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('outreach.upsert'))`);
    for (const raw of raws) {
      // One bad provider date must not roll back the whole source (WR-S06).
      if (Number.isNaN(raw.startAt.getTime()) || (raw.endAt && Number.isNaN(raw.endAt.getTime()))) {
        invalid++;
        continue;
      }
      const sc = sydneyCheck(raw);
      if (opts.filter !== false && (!inWindow(raw, now) || !sc.keep)) continue; // owner imports (D-05) skip the filter
      const canonicalUrl = raw.urlFromText ? null : canonUrl(raw.url);
      const titleKey = canonTitle(raw.title);
      const fields = {
        title: raw.title,
        titleKey,
        startAt: raw.startAt,
        endAt: raw.endAt,
        allDay: raw.allDay,
        timeZone: raw.timeZone,
        location: raw.location ?? (sc.tag === "unknown" ? "Location unknown" : null),
        lat: raw.lat,
        lng: raw.lng,
        online: raw.online || sc.tag === "online",
        organizer: raw.organizer,
        priceText: raw.priceText,
        url: raw.url,
        canonicalUrl,
        description: raw.description,
        categories: raw.categories,
      };
      const ref: Src = { sourceId: source.id, kind: source.kind, remoteId: raw.remoteId };

      let [match] = await tx
        .select()
        .from(outreachEvents)
        .where(sql`${outreachEvents.sources} @> ${JSON.stringify([{ sourceId: ref.sourceId, remoteId: ref.remoteId }])}::jsonb`)
        .limit(1);
      if (!match) {
        const start = new Date(minuteKey(raw.startAt));
        const cands = await tx
          .select()
          .from(outreachEvents)
          .where(
            and(
              gte(outreachEvents.startAt, start),
              lt(outreachEvents.startAt, new Date(+start + 60_000)),
              canonicalUrl ? sql`(${outreachEvents.canonicalUrl} = ${canonicalUrl} or ${outreachEvents.titleKey} = ${titleKey})` : eq(outreachEvents.titleKey, titleKey),
            ),
          );
        match = cands.find((c) => sameEvent({ url: c.canonicalUrl, title: c.title, startAt: c.startAt }, { url: canonicalUrl, title: raw.title, startAt: raw.startAt }));
      }

      if (match) {
        const has = (match.sources as Src[]).some((s) => s.sourceId === ref.sourceId && s.remoteId === ref.remoteId);
        const refresh = match.isMock || !isMock; // a mock never overwrites real data
        await tx
          .update(outreachEvents)
          .set({
            ...(refresh ? fields : {}),
            sources: has ? match.sources : [...(match.sources as Src[]), ref],
            isMock: match.isMock && isMock,
            lastSeenAt: now,
            updatedAt: now,
          })
          .where(eq(outreachEvents.id, match.id));
        updated++;
      } else {
        const [r] = await tx.insert(outreachEvents).values({ ...fields, isMock, sources: [ref], lastSeenAt: now }).returning({ id: outreachEvents.id });
        added.push(r!.id);
      }
    }
  });
  if (invalid) log.warn({ source: source.kind, invalid }, "outreach events with invalid dates skipped");
  return { added, updated };
}

const strings = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null);

export async function rescoreAll(h: DB, now: Date): Promise<Map<string, number>> {
  const [s] = await h.select({ v: settings.value }).from(settings).where(eq(settings.key, INTERESTS_KEY));
  const interests = strings(s?.v) ?? DEFAULT_INTERESTS;
  const ps = await h.select().from(projects).where(eq(projects.status, "active"));
  const proj = ps.map((p) => ({ name: p.name, category: CATEGORY_LABEL[p.category as ProjectCategory] ?? p.category, keywords: projectKeywords(p.context) }));
  const [cal] = await h.select({ id: calendars.id }).from(calendars).where(and(eq(calendars.enabled, true), isNotNull(calendars.category))).limit(1);
  const busy = cal ? (await loadInstances(h, now, new Date(+now + 60 * DAY))).map(sched) : null;

  const rows = await h.select().from(outreachEvents).where(gte(outreachEvents.startAt, new Date(+now - DAY)));
  const out = new Map<string, number>();
  for (const e of rows) {
    const r = scoreEvent(e, { interests, projects: proj, busy });
    out.set(e.id, r.score);
    await h.update(outreachEvents).set({ score: r.score, signals: r.signals, why: r.why }).where(eq(outreachEvents.id, e.id));
  }
  return out;
}

type Opts = { handle?: DB; fetch?: typeof fetch; get?: typeof safeGet; emit?: typeof emitActivity; now?: () => Date; key?: Buffer };
export type OutreachSyncResult = { sources: number; added: number; updated: number; errors: number };

export function createOutreachSync(opts: Opts = {}) {
  async function run(): Promise<OutreachSyncResult> {
    const res: OutreachSyncResult = { sources: 0, added: 0, updated: 0, errors: 0 };
    try {
      const h = opts.handle ?? db();
      const emit = opts.emit ?? emitActivity;
      const now = (opts.now ?? (() => new Date()))();

      const builtin = EVENT_SOURCE_KINDS.filter((k) => k !== "ics");
      await h.insert(eventSources).values(builtin.map((kind) => ({ kind, label: SOURCE_LABEL[kind] }))).onConflictDoNothing();

      const rows = await h.select().from(eventSources).where(eq(eventSources.enabled, true));
      const addedIds: string[] = [];
      for (const row of rows) {
        res.sources++;
        try {
          const p = await providerForSource(h, row, { get: opts.get, fetch: opts.fetch, key: opts.key });
          const raws = await p.list(now);
          const r = await upsertEvents(h, { id: row.id, kind: row.kind }, raws, p.isMock, now);
          addedIds.push(...r.added);
          res.added += r.added.length;
          res.updated += r.updated;
          let err: string | null = null;
          let config = row.config;
          if (p.discoverDenied !== undefined && (row.config.organizerIds?.length ?? 0) > 0) {
            config = { ...row.config, discover: !p.discoverDenied };
            if (p.discoverDenied) err = DISCOVER_DENIED;
          }
          await h.update(eventSources).set({ lastSyncAt: now, lastSyncError: err, config }).where(eq(eventSources.id, row.id));
          if (!p.isMock && (row.kind === "eventbrite" || row.kind === "luma")) {
            // D-09: real data replaces this built-in source's unsaved mock rows.
            await h
              .delete(outreachEvents)
              .where(
                and(
                  isNull(outreachEvents.stage),
                  eq(outreachEvents.isMock, true),
                  sql`jsonb_array_length(${outreachEvents.sources}) = 1 and ${outreachEvents.sources}->0->>'sourceId' = ${row.id}`,
                ),
              );
            await h.update(connections).set({ status: "connected", lastError: null }).where(and(eq(connections.id, row.kind), eq(connections.status, "error")));
          }
        } catch (e) {
          res.errors++;
          let msg = "Sync failed. Retrying later.";
          if (e instanceof ProviderAuthError && (row.kind === "eventbrite" || row.kind === "luma")) {
            await markEventKeyError(h, row.kind).catch(() => undefined);
            msg = "Access was rejected. Replace the key in Settings.";
          } else if (e instanceof SourceError) msg = e.message;
          else log.error({ err: e, kind: row.kind }, "outreach source sync failed");
          await h.update(eventSources).set({ lastSyncAt: now, lastSyncError: msg }).where(eq(eventSources.id, row.id));
        }
      }

      const scores = await rescoreAll(h, now);

      // Prune (D-12): unsaved only, saved events are never touched.
      await h.delete(outreachEvents).where(and(isNull(outreachEvents.stage), lt(sql`coalesce(${outreachEvents.endAt}, ${outreachEvents.startAt})`, new Date(+now - 30 * DAY))));
      const ids = new Set((await h.select({ id: eventSources.id }).from(eventSources)).map((r) => r.id));
      for (const e of await h.select({ id: outreachEvents.id, sources: outreachEvents.sources }).from(outreachEvents).where(isNull(outreachEvents.stage))) {
        const keep = (e.sources as Src[]).filter((s) => s.sourceId === "url" || ids.has(s.sourceId));
        if (keep.length === e.sources.length) continue;
        if (keep.length) await h.update(outreachEvents).set({ sources: keep }).where(eq(outreachEvents.id, e.id));
        else await h.delete(outreachEvents).where(eq(outreachEvents.id, e.id));
      }

      const hot = addedIds.filter((id) => (scores.get(id) ?? 0) >= 70).length;
      if (hot > 0) await emit({ type: "outreach.synced", source: "outreach", title: "New events worth a look", detail: `${hot} new events scored 70+` }, undefined, h);
      await notifyLive(h, "outreach", "sync");
    } catch (err) {
      res.errors++;
      log.error({ err }, "outreach sync failed");
    }
    return res;
  }
  return { run };
}
