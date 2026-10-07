import type { Health } from "@/server/health";
import { NOTIFICATION_CATEGORIES } from "@/lib/live-types";
import type { ActivityDTO, NotificationDTO, NotificationsSnapshot } from "@/lib/live-types";

export function nextBackoff(prev: number): number {
  return prev <= 0 ? 1000 : Math.min(prev * 2, 30000);
}

export function mergeById<T extends { id: string }>(current: T[], incoming: T[], key: keyof T, limit: number): T[] {
  const map = new Map<string, T>();
  for (const x of current) map.set(x.id, x);
  for (const x of incoming) map.set(x.id, x);
  return [...map.values()]
    .sort((a, b) => (String(a[key]) < String(b[key]) ? 1 : String(a[key]) > String(b[key]) ? -1 : 0))
    .slice(0, limit);
}

// The snapshot wins, but items that arrived over SSE while it was in flight (unknown when it started) are kept.
export function applySnapshot(cur: NotificationDTO[], snap: NotificationDTO[], knownBefore: ReadonlySet<string>): NotificationDTO[] {
  return mergeById(cur.filter((i) => !knownBefore.has(i.id)), snap, "createdAt", Number.MAX_SAFE_INTEGER);
}

// Undo one optimistic change without clobbering anything else that changed meanwhile.
export function restoreItem(cur: NotificationDTO[], original: NotificationDTO): NotificationDTO[] {
  return mergeById(cur.filter((i) => i.id !== original.id), [original], "createdAt", Number.MAX_SAFE_INTEGER);
}

export function healthFromActivity(a: ActivityDTO): Health | null {
  return a.type.startsWith("system.health_") && a.health ? a.health : null;
}

export function unreadOf(items: NotificationDTO[]): number {
  return items.filter((i) => i.readAt === null).length;
}

export function wakeDelay(nextWake: string | null, now: number): number | null {
  if (!nextWake) return null;
  const t = Date.parse(nextWake);
  if (Number.isNaN(t)) return null;
  return Math.min(Math.max(t - now + 500, 0), 2147483647);
}

const isStr = (x: unknown) => typeof x === "string";
const strOrNull = (x: unknown) => x === null || typeof x === "string";

// Guards for everything that arrives over the wire: a bad frame is dropped instead of crashing render
// (e.g. an old tab receiving a category added by a newer deploy).
export function isNotification(x: unknown): x is NotificationDTO {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    isStr(o.id) && (NOTIFICATION_CATEGORIES as readonly unknown[]).includes(o.category) && isStr(o.source) && isStr(o.title) &&
    isStr(o.createdAt) && strOrNull(o.body) && strOrNull(o.actionUrl) && strOrNull(o.readAt) && strOrNull(o.snoozedUntil)
  );
}

export function isActivity(x: unknown): x is ActivityDTO {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  const h = o.health as Record<string, unknown> | null;
  return (
    isStr(o.id) && isStr(o.at) && isStr(o.type) && isStr(o.source) && isStr(o.title) && strOrNull(o.detail) &&
    (o.tone === null || o.tone === "red" || o.tone === "amber" || o.tone === "green") &&
    (h === null || (typeof h === "object" && isStr(h.status) && isStr(h.db) && isStr(h.worker) && isStr(h.version)))
  );
}

export function parseSnapshot(x: unknown): NotificationsSnapshot | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  if (!Array.isArray(o.items) || !o.items.every(isNotification)) return null;
  if (typeof o.unread !== "number" || !strOrNull(o.nextWake)) return null;
  return { items: o.items, unread: o.unread, nextWake: o.nextWake as string | null };
}
