import { eq } from "drizzle-orm";
import { toCalendarDTO, type CalendarConnectionDTO, type CalendarConnectionId } from "../../lib/calendar-types";
import { decrypt, encrypt } from "../crypto";
import { db, type DB } from "../db/client";
import { auditLog, calendars, connections } from "../db/schema";
import { log } from "../log";
import { GMAIL_COMPOSE, GMAIL_READ } from "./google/client";

const IDS: CalendarConnectionId[] = ["google_calendar", "icloud_calendar"];

// Per-handle audit (same style as agents/approvals.ts) so DB tests see the rows. Metadata is ids/account only (D-05).
export async function aud(h: DB, action: string, id: string, metadata: Record<string, unknown>) {
  try {
    await h.insert(auditLog).values({ actor: "owner", action, target: id, metadata });
  } catch (err) {
    log.error({ err, action }, "audit write failed");
  }
}

export const hasGmail = (scopes: string[], which: "read" | "compose") => scopes.includes(which === "read" ? GMAIL_READ : GMAIL_COMPOSE);

/** Create or rotate: overwrites the single row in place, resets status and clears lastError (D-05). */
export async function saveCalendarSecret(
  h: DB = db(),
  id: CalendarConnectionId,
  secret: Record<string, unknown>,
  meta: { account: string; scopes?: string[] },
  opts: { key?: Buffer; now?: Date } = {},
): Promise<void> {
  // last4 "" on purpose: no fragment of an app password or token is kept.
  const row = { ciphertext: encrypt(JSON.stringify(secret), opts.key), last4: "", login: meta.account, expiresAt: null, status: "connected", lastError: null, repos: [] as string[], scopes: meta.scopes ?? [] };
  await h.insert(connections).values({ id, ...row }).onConflictDoUpdate({ target: connections.id, set: { ...row, updatedAt: opts.now ?? new Date() } });
  await aud(h, "connection.save", id, { id, account: meta.account });
}

/** Only providers call this. */
export async function readCalendarSecret<T = Record<string, unknown>>(h: DB = db(), id: CalendarConnectionId, key?: Buffer): Promise<T | null> {
  const [r] = await h.select({ c: connections.ciphertext }).from(connections).where(eq(connections.id, id));
  return r ? (JSON.parse(decrypt(r.c, key)) as T) : null;
}

/** Token refresh: ciphertext only, no status change, no audit. */
export async function updateCalendarSecret(h: DB = db(), id: CalendarConnectionId, secret: Record<string, unknown>, key?: Buffer): Promise<void> {
  await h.update(connections).set({ ciphertext: encrypt(JSON.stringify(secret), key), updatedAt: new Date() }).where(eq(connections.id, id));
}

/** message must be a fixed string (e.g. "Access was rejected."), never provider output. */
export async function markCalendarError(h: DB = db(), id: CalendarConnectionId, message: string): Promise<void> {
  await h.update(connections).set({ status: "error", lastError: message, updatedAt: new Date() }).where(eq(connections.id, id));
}

export async function recordCalendarSync(h: DB = db(), id: CalendarConnectionId, s: { at: Date; error: string | null }): Promise<void> {
  await h.update(connections).set({ lastSyncAt: s.at, lastSyncError: s.error, updatedAt: new Date() }).where(eq(connections.id, id));
}

const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/** Best effort: never blocks or fails the disconnect, never logs the token (IN-A02). */
async function revokeGoogle(h: DB, opts: { fetch?: typeof fetch; key?: Buffer }) {
  try {
    const s = await readCalendarSecret<{ refreshToken?: string }>(h, "google_calendar", opts.key);
    if (!s?.refreshToken) return;
    const res = await (opts.fetch ?? globalThis.fetch)(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: s.refreshToken }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) log.warn({ status: res.status }, "google token revoke failed");
  } catch {
    log.warn("google token revoke failed");
  }
}

/** Cascades to calendars and their events. Google's refresh token is revoked first (best effort). */
export async function removeCalendarConnection(h: DB = db(), id: CalendarConnectionId, opts: { fetch?: typeof fetch; key?: Buffer } = {}): Promise<void> {
  if (id === "google_calendar") await revokeGoogle(h, opts);
  await h.delete(connections).where(eq(connections.id, id));
  await aud(h, "connection.remove", id, { id });
}

export async function getCalendarConnections(h: DB = db(), opts: { googleConfigured: boolean }): Promise<CalendarConnectionDTO[]> {
  // Explicit column list: ciphertext is never selected on the DTO path.
  const rows = await h
    .select({ id: connections.id, status: connections.status, login: connections.login, lastSyncAt: connections.lastSyncAt, lastSyncError: connections.lastSyncError, scopes: connections.scopes })
    .from(connections);
  const cals = await h.select().from(calendars);
  return IDS.map((id) => {
    const r = rows.find((x) => x.id === id);
    const configured = id === "google_calendar" ? opts.googleConfigured : true;
    if (!r) return { id, status: "none", configured, account: null, lastSyncAt: null, lastSyncError: null, calendars: [], gmail: "missing" };
    return {
      id,
      status: r.status === "error" ? "error" : "connected",
      configured,
      account: r.login,
      lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
      lastSyncError: r.lastSyncError,
      gmail: id === "google_calendar" && hasGmail(r.scopes, "read") ? "granted" : "missing",
      calendars: cals.filter((c) => c.connectionId === id).map(toCalendarDTO),
    };
  });
}
