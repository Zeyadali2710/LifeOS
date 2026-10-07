import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { ActivityDTO, ActivityTone, NotificationCategory, NotificationDTO } from "../lib/live-types";
import { db, type DB } from "./db/client";
import { activityEvents, notifications } from "./db/schema";
import { log } from "./log";

export const CHANNEL = "lifeos_events";

type ActivityInput = {
  type: string;
  source: string;
  title: string;
  detail?: string;
  tone?: ActivityTone;
  payload?: Record<string, unknown>;
};
type NotificationInput = { category: NotificationCategory; title: string; body?: string; actionUrl?: string };

const notify = (k: string, id: string) => sql`select pg_notify(${CHANNEL}, ${JSON.stringify({ k, id })})`;

// Like audit(): never throws, so callers (auth hooks, worker jobs) can't be broken by it.
export async function emitActivity(
  a: ActivityInput,
  n?: NotificationInput,
  handle?: DB,
): Promise<{ activityId: string; notificationId?: string } | null> {
  try {
    const h = handle ?? db();
    return await h.transaction(async (tx) => {
      const [ev0] = await tx
        .insert(activityEvents)
        .values({
          type: a.type,
          source: a.source,
          title: a.title,
          payload: { detail: a.detail, tone: a.tone, ...a.payload },
        })
        .returning({ id: activityEvents.id });
      const ev = ev0!;
      await tx.execute(notify("activity", ev.id));
      if (!n) return { activityId: ev.id };
      const [nr0] = await tx
        .insert(notifications)
        .values({ ...n, source: a.source, activityEventId: ev.id })
        .returning({ id: notifications.id });
      const nr = nr0!;
      await tx.execute(notify("notification", nr.id));
      return { activityId: ev.id, notificationId: nr.id };
    });
  } catch (err) {
    log.error({ err, type: a.type }, "emitActivity failed");
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : null);

export function toActivityDTO(r: typeof activityEvents.$inferSelect): ActivityDTO {
  const p = r.payload ?? {};
  const tone = p.tone === "red" || p.tone === "amber" || p.tone === "green" ? p.tone : null;
  const health = p.health && typeof p.health === "object" ? (p.health as ActivityDTO["health"]) : null;
  return {
    id: r.id,
    at: r.occurredAt.toISOString(),
    type: r.type,
    source: r.source,
    title: r.title,
    detail: str(p.detail),
    tone,
    health,
  };
}

export function toNotificationDTO(r: typeof notifications.$inferSelect): NotificationDTO {
  return {
    id: r.id,
    category: r.category,
    source: r.source,
    title: r.title,
    body: r.body,
    actionUrl: r.actionUrl,
    createdAt: r.createdAt.toISOString(),
    readAt: r.readAt?.toISOString() ?? null,
    snoozedUntil: r.snoozedUntil?.toISOString() ?? null,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadEventRow(
  handle: DB,
  p: { k: string; id: string },
  now = new Date(),
): Promise<ActivityDTO | NotificationDTO | null> {
  if (!UUID.test(p.id)) return null;
  try {
    if (p.k === "activity") {
      const [r] = await handle.select().from(activityEvents).where(eq(activityEvents.id, p.id));
      return r ? toActivityDTO(r) : null;
    }
    if (p.k === "notification") {
      const [r] = await handle
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.id, p.id),
            isNull(notifications.dismissedAt),
            or(isNull(notifications.snoozedUntil), lte(notifications.snoozedUntil, now)),
          ),
        );
      return r ? toNotificationDTO(r) : null;
    }
    return null;
  } catch (err) {
    log.error({ err, k: p.k }, "loadEventRow failed");
    return null;
  }
}

export async function recentActivity(handle: DB = db(), limit = 20): Promise<ActivityDTO[]> {
  const rows = await handle.select().from(activityEvents).orderBy(desc(activityEvents.occurredAt)).limit(limit);
  return rows.map(toActivityDTO);
}
