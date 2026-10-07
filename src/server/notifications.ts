import { and, count, desc, eq, inArray, isNull, lte, min, or, gt } from "drizzle-orm";
import type { NotificationDTO, NotificationsSnapshot } from "../lib/live-types";
import { db, type DB } from "./db/client";
import { notifications as n } from "./db/schema";
import { toNotificationDTO } from "./events";

// Inbox = not dismissed and not currently snoozed. No activity emission here (D-10).
const visible = (now: Date) => and(isNull(n.dismissedAt), or(isNull(n.snoozedUntil), lte(n.snoozedUntil, now)));
const unreadWhere = (now: Date) => and(visible(now), isNull(n.readAt));

export async function inbox(handle: DB = db(), now = new Date(), limit = 100): Promise<NotificationDTO[]> {
  const rows = await handle.select().from(n).where(visible(now)).orderBy(desc(n.createdAt)).limit(limit);
  return rows.map(toNotificationDTO);
}

export async function unreadCount(handle: DB = db(), now = new Date()): Promise<number> {
  const [r] = await handle.select({ c: count() }).from(n).where(unreadWhere(now));
  return r?.c ?? 0;
}

export async function unreadImportantCount(handle: DB = db(), now = new Date()): Promise<number> {
  const [r] = await handle
    .select({ c: count() })
    .from(n)
    .where(and(unreadWhere(now), inArray(n.category, ["URGENT", "IMPORTANT"])));
  return r?.c ?? 0;
}

export async function nextWake(handle: DB = db(), now = new Date()): Promise<string | null> {
  const [r] = await handle
    .select({ t: min(n.snoozedUntil) })
    .from(n)
    .where(and(isNull(n.dismissedAt), gt(n.snoozedUntil, now)));
  return r?.t ? new Date(r.t).toISOString() : null;
}

export async function snapshot(handle: DB = db(), now = new Date()): Promise<NotificationsSnapshot> {
  const [items, unread, wake] = await Promise.all([inbox(handle, now), unreadCount(handle, now), nextWake(handle, now)]);
  return { items, unread, nextWake: wake };
}

export async function setRead(handle: DB, id: string, read: boolean, now = new Date()): Promise<boolean> {
  const r = await handle.update(n).set({ readAt: read ? now : null }).where(eq(n.id, id)).returning({ id: n.id });
  return r.length > 0;
}

export async function readAll(handle: DB, now = new Date()): Promise<boolean> {
  await handle.update(n).set({ readAt: now }).where(unreadWhere(now));
  return true;
}

export async function snoozeUntil(handle: DB, id: string, until: Date): Promise<boolean> {
  const r = await handle.update(n).set({ snoozedUntil: until }).where(eq(n.id, id)).returning({ id: n.id });
  return r.length > 0;
}

export async function dismissOne(handle: DB, id: string, now = new Date()): Promise<boolean> {
  const r = await handle.update(n).set({ dismissedAt: now }).where(eq(n.id, id)).returning({ id: n.id });
  return r.length > 0;
}
