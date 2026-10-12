// Eventbrite / Luma key read side (plan 09 adds save/remove). Keys are decrypted in memory only.
import { eq } from "drizzle-orm";
import { decrypt } from "../crypto";
import type { DB } from "../db/client";
import { connections } from "../db/schema";

export type EventKeyId = "eventbrite" | "luma";

export async function eventSourceKey(h: DB, id: EventKeyId, key?: Buffer): Promise<string | null> {
  const [r] = await h.select({ c: connections.ciphertext }).from(connections).where(eq(connections.id, id));
  return r ? decrypt(r.c, key) : null;
}

export async function markEventKeyError(h: DB, id: EventKeyId): Promise<void> {
  await h.update(connections).set({ status: "error", lastError: "Access was rejected.", updatedAt: new Date() }).where(eq(connections.id, id));
}
