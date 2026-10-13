// Google connect flow (D-05): auth code + PKCE, state bound to an encrypted single-use cookie. Redirects use BETTER_AUTH_URL only.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, type DB } from "../../db/client";
import { connections } from "../../db/schema";
import { decrypt, encrypt } from "../../crypto";
import { env } from "../../env";
import { log } from "../../log";
import { enqueue as realEnqueue, QUEUES, type Enqueue } from "../../queue";
import { refreshCalendarList } from "../calendars";
import { mailSyncState } from "../../mail/sync";
import { resetMailState, saveCalendarSecret } from "../connections";
import { CALENDAR_SCOPES, createGoogle, exchangeCode, GMAIL_COMPOSE, GMAIL_READ, googleAuthUrl } from "./client";
import { createGoogleProvider } from "./provider";

export const GOOGLE_COOKIE = "lifeos_google_oauth";
const TTL_MS = 10 * 60_000;
const b64 = () => randomBytes(32).toString("base64url");
const redirectUri = () => `${env().BETTER_AUTH_URL}/api/connections/google/callback`;

export function startGoogleOAuth({ now = new Date(), key }: { now?: Date; key?: Buffer } = {}): { url: string; cookie: string } | { error: "not_configured" } {
  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) return { error: "not_configured" };
  const state = b64();
  const verifier = b64();
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return {
    url: googleAuthUrl({ clientId: e.GOOGLE_CLIENT_ID, redirectUri: redirectUri(), state, challenge }),
    cookie: encrypt(JSON.stringify({ state, verifier, at: now.toISOString() }), key),
  };
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export type OAuthResult = { ok: true; calendars: number; gmail: boolean } | { ok: false; error: "cancelled" | "state" | "scope" | "failed" };

export async function completeGoogleOAuth(
  h: DB = db(),
  p: { code: string | null; state: string | null; error: string | null; cookie: string | null; fetch?: typeof fetch; now?: Date; key?: Buffer; enqueue?: Enqueue },
): Promise<OAuthResult> {
  const now = p.now ?? new Date();
  let saved: { state: string; verifier: string; at: string };
  try {
    saved = JSON.parse(decrypt(p.cookie ?? "", p.key));
  } catch {
    return { ok: false, error: "state" };
  }
  if (!p.state || !same(saved.state, p.state) || now.getTime() - Date.parse(saved.at) > TTL_MS) return { ok: false, error: "state" };
  if (p.error) return { ok: false, error: "cancelled" };
  const e = env();
  if (!p.code || !e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) return { ok: false, error: "failed" };
  try {
    const t = await exchangeCode({ code: p.code, verifier: saved.verifier, redirectUri: redirectUri(), clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET, fetch: p.fetch, now });
    if (!CALENDAR_SCOPES.every((s) => t.scopes.includes(s))) return { ok: false, error: "scope" };
    const provider = createGoogleProvider({ google: createGoogle({ getToken: async () => t.accessToken, fetch: p.fetch }) });
    const remote = await provider.listCalendars();
    const account = remote.find((c) => c.kind === "primary")?.remoteId ?? "Google";
    // A different Google account: the stored mail and historyId belong to the old mailbox (CR-S01). Full sync re-reads the owner email.
    const [prev] = await h.select({ login: connections.login }).from(connections).where(eq(connections.id, "google_calendar"));
    const mailEmail = (await mailSyncState(h)).email;
    const differs = (a: string | null | undefined) => !!a && a.toLowerCase() !== account.toLowerCase();
    if (differs(prev?.login) || (account.includes("@") && differs(mailEmail))) await resetMailState(h);
    await saveCalendarSecret(h, "google_calendar", { refreshToken: t.refreshToken, accessToken: t.accessToken, expiresAt: t.expiresAt }, { account, scopes: t.scopes }, { key: p.key, now });
    await refreshCalendarList(h, "google_calendar", remote, account);
    const enqueue = p.enqueue ?? realEnqueue;
    await enqueue(QUEUES.calendarSync, {}, { singletonKey: "calendar.sync" }).catch(() => undefined);
    const gmail = [GMAIL_READ, GMAIL_COMPOSE].every((s) => t.scopes.includes(s));
    if (gmail) await enqueue(QUEUES.mailSync, {}, { singletonKey: "mail.sync" }).catch(() => undefined); // IN-S03
    return { ok: true, calendars: remote.length, gmail };
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "google oauth failed"); // message is a fixed string, never a token
    return { ok: false, error: "failed" };
  }
}
