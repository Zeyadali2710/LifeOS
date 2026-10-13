// Eventbrite / Luma keys: read side for sync, save/remove for the owner. Keys are decrypted in memory only.
import { eq, inArray } from "drizzle-orm";
import { decrypt, encrypt } from "../crypto";
import type { DB } from "../db/client";
import { auditLog, connections } from "../db/schema";
import { log } from "../log";

export type EventKeyId = "eventbrite" | "luma";

export async function eventSourceKey(h: DB, id: EventKeyId, key?: Buffer): Promise<string | null> {
  const [r] = await h.select({ c: connections.ciphertext }).from(connections).where(eq(connections.id, id));
  return r ? decrypt(r.c, key) : null;
}

export async function markEventKeyError(h: DB, id: EventKeyId): Promise<void> {
  await h.update(connections).set({ status: "error", lastError: "Access was rejected.", updatedAt: new Date() }).where(eq(connections.id, id));
}

/** Owner audit row on the given handle: ids / last4 / host only, never keys, URLs or titles. */
export async function aud(h: DB, action: string, target: string | null, metadata: Record<string, unknown>): Promise<void> {
  try {
    await h.insert(auditLog).values({ actor: "owner", action, target, metadata });
  } catch (err) {
    log.error({ err, action }, "audit write failed");
  }
}

// Constant validation endpoints (D-02): no caller-supplied host.
const VALIDATE: Record<EventKeyId, (k: string) => { url: string; headers: Record<string, string> }> = {
  eventbrite: (k) => ({ url: "https://www.eventbriteapi.com/v3/users/me/", headers: { Authorization: `Bearer ${k}` } }),
  luma: (k) => ({ url: "https://public-api.luma.com/v1/users/get-self", headers: { "x-luma-api-key": k } }),
};

export type EventKeySaveResult = { ok: true } | { ok: false; error: "invalid" | "rejected" | "unreachable" };

export async function saveEventKey(h: DB, id: EventKeyId, raw: string, opts: { fetch?: typeof fetch; now?: Date; key?: Buffer } = {}): Promise<EventKeySaveResult> {
  const k = raw.trim();
  if (!k || k.length > 255 || !Object.hasOwn(VALIDATE, id)) return { ok: false, error: "invalid" };
  try {
    const v = VALIDATE[id](k);
    const res = await (opts.fetch ?? fetch)(v.url, { headers: v.headers, signal: AbortSignal.timeout(15_000) });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "rejected" };
    if (res.status !== 200) return { ok: false, error: "unreachable" };
  } catch {
    return { ok: false, error: "unreachable" };
  }
  const row = { ciphertext: encrypt(k, opts.key), last4: k.slice(-4), login: null, expiresAt: null, status: "connected", lastError: null, repos: [] as string[] };
  await h.insert(connections).values({ id, ...row }).onConflictDoUpdate({ target: connections.id, set: { ...row, updatedAt: opts.now ?? new Date() } });
  await aud(h, "connection.save", id, { id, last4: row.last4 });
  return { ok: true };
}

export async function removeEventKey(h: DB, id: EventKeyId): Promise<void> {
  await h.delete(connections).where(eq(connections.id, id));
  await aud(h, "connection.remove", id, { id });
}

export async function eventKeyStatus(h: DB): Promise<Record<EventKeyId, { last4: string; status: string } | null>> {
  const rows = await h.select({ id: connections.id, last4: connections.last4, status: connections.status }).from(connections).where(inArray(connections.id, ["eventbrite", "luma"]));
  const f = (id: EventKeyId) => {
    const r = rows.find((x) => x.id === id);
    return r ? { last4: r.last4, status: r.status } : null;
  };
  return { eventbrite: f("eventbrite"), luma: f("luma") };
}
