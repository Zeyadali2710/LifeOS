import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { BRIEFING_KINDS, BRIEFING_LABEL, composeBriefing, DEFAULT_SCHEDULE, dueBriefings, periodKey, type BriefingKind, type BriefingSchedule } from "@/lib/digest";
import type { DB } from "./db/client";
import { briefings, settings } from "./db/schema";
import { completedInWeek, loadDigest } from "./digest";
import { emitActivity } from "./events";
import { log } from "./log";
import { sydneyParts } from "./time";

export const SCHEDULE_KEY = "briefings.schedule";
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const scheduleInput = z.object(Object.fromEntries(BRIEFING_KINDS.map((k) => [k, z.object({ on: z.boolean(), time: hm })])) as Record<BriefingKind, z.ZodObject<{ on: z.ZodBoolean; time: typeof hm }>>);

export async function getSchedule(h: DB): Promise<BriefingSchedule> {
  const [r] = await h.select({ v: settings.value }).from(settings).where(eq(settings.key, SCHEDULE_KEY));
  const p = scheduleInput.safeParse(r?.v);
  return p.success ? (p.data as BriefingSchedule) : DEFAULT_SCHEDULE;
}

export async function saveSchedule(h: DB, s: BriefingSchedule): Promise<void> {
  await h.insert(settings).values({ key: SCHEDULE_KEY, value: s }).onConflictDoUpdate({ target: settings.key, set: { value: s } });
}

/**
 * Builds one briefing for the current period. Scheduled: stores it (or replaces an early manual build) and notifies once;
 * returns null when the scheduled one already exists. Manual ("Build now"): creates or refreshes it without notifying.
 */
export async function generateBriefing(h: DB, kind: BriefingKind, now: Date, emit: typeof emitActivity = emitActivity, opts: { manual?: boolean } = {}): Promise<string | null> {
  const digest = await loadDigest(h, now);
  const period = periodKey(kind, digest.today);
  const body = composeBriefing(kind, period, digest, kind === "weekly" ? { completed: await completedInWeek(h, period) } : undefined);
  if (opts.manual) {
    const [row] = await h.insert(briefings).values({ kind, period, headline: body.headline, body })
      .onConflictDoUpdate({ target: [briefings.kind, briefings.period], set: { headline: body.headline, body } }).returning({ id: briefings.id });
    return row!.id;
  }
  return h.transaction(async (tx) => {
    const [row] = await tx.insert(briefings).values({ kind, period, headline: body.headline, body, scheduled: true })
      .onConflictDoUpdate({ target: [briefings.kind, briefings.period], set: { headline: body.headline, body, scheduled: true, readAt: null, createdAt: now }, setWhere: sql`${briefings.scheduled} = false` })
      .returning({ id: briefings.id });
    if (!row) return null;
    // Counts only in the notification: briefing sections can hold mail subjects and stay on the owner-only page.
    const sent = await emit(
      { type: "briefing.ready", source: "briefings", title: BRIEFING_LABEL[kind], detail: body.headline },
      { category: "FYI", title: BRIEFING_LABEL[kind], body: body.headline, actionUrl: `/briefings/${row.id}` },
      tx as unknown as DB,
    );
    if (!sent) throw new Error("briefing notification failed"); // roll back so the next tick retries the pair
    return row.id;
  });
}

/** Worker tick: generate every enabled briefing whose Sydney time has passed in its current period. */
export async function runBriefings(h: DB, now: Date): Promise<number> {
  const p = sydneyParts(now);
  const local = { ymd: `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`, hm: `${String(p.hour % 24).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`, weekday: p.weekday };
  let made = 0;
  for (const kind of dueBriefings(await getSchedule(h), local)) {
    try {
      if (await generateBriefing(h, kind, now)) made++;
    } catch (err) {
      log.error({ err, kind }, "briefing generation failed; retrying next tick");
    }
  }
  return made;
}

export async function listBriefings(h: DB, limit = 30) {
  return h.select({ id: briefings.id, kind: briefings.kind, period: briefings.period, headline: briefings.headline, readAt: briefings.readAt, createdAt: briefings.createdAt })
    .from(briefings).orderBy(desc(briefings.createdAt)).limit(limit);
}

export async function getBriefing(h: DB, id: string) {
  const [r] = await h.select().from(briefings).where(eq(briefings.id, id));
  return r ?? null;
}
