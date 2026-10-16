import { eq, isNotNull, sql } from "drizzle-orm";
import { decrypt, encrypt } from "./crypto";
import type { DB } from "./db/client";
import { auditLog, connections, eventSources } from "./db/schema";

/** Every column holding AES-GCM ciphertext under LIFEOS_MASTER_KEY. Keep in sync when adding encrypted storage. */
export const ENCRYPTED_COLUMNS = ["connections.ciphertext", "event_sources.url_ciphertext"] as const;

export function parseKey(b64: string | undefined, name: string): Buffer {
  const k = Buffer.from(b64 ?? "", "base64");
  if (k.length !== 32) throw new Error(`${name} must be 32 bytes, base64 encoded (openssl rand -base64 32).`);
  return k;
}

/**
 * Re-encrypts every secret from `oldKey` to `newKey` in one transaction (all or nothing). Each value is decrypted with
 * the old key and the new ciphertext is verified by decrypting it with the new key before the commit. `dryRun` checks
 * that every value decrypts with the old key and writes nothing.
 */
export async function rotateMasterKey(h: DB, oldKey: Buffer, newKey: Buffer, opts: { dryRun?: boolean } = {}): Promise<{ connections: number; eventSources: number }> {
  if (oldKey.equals(newKey)) throw new Error("The new key is the same as the current key.");
  return h.transaction(async (tx) => {
    // Block concurrent token writes (reconnects, refreshes) for the duration.
    await tx.execute(sql`lock table connections, event_sources in share row exclusive mode`);
    const conns = await tx.select({ id: connections.id, c: connections.ciphertext }).from(connections);
    const feeds = await tx.select({ id: eventSources.id, c: eventSources.urlCiphertext }).from(eventSources).where(isNotNull(eventSources.urlCiphertext));
    const rewrap = (label: string, c: string) => {
      let plain: string;
      try { plain = decrypt(c, oldKey); } catch { throw new Error(`${label} does not decrypt with the current key; nothing was changed.`); }
      const next = encrypt(plain, newKey);
      if (decrypt(next, newKey) !== plain) throw new Error(`${label} failed verification; nothing was changed.`);
      return next;
    };
    const plan = [...conns.map((r) => ({ table: "connections" as const, id: r.id, next: rewrap(`connections/${r.id}`, r.c) })),
      ...feeds.map((r) => ({ table: "event_sources" as const, id: r.id, next: rewrap(`event_sources/${r.id}`, r.c!) }))];
    if (opts.dryRun) return { connections: conns.length, eventSources: feeds.length };
    for (const p of plan) {
      if (p.table === "connections") await tx.update(connections).set({ ciphertext: p.next }).where(eq(connections.id, p.id));
      else await tx.update(eventSources).set({ urlCiphertext: p.next }).where(eq(eventSources.id, p.id));
    }
    await tx.insert(auditLog).values({ actor: "system", action: "crypto.master_key_rotated", metadata: { connections: conns.length, eventSources: feeds.length } });
    return { connections: conns.length, eventSources: feeds.length };
  });
}
