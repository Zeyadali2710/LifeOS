// Minimal fetch-based Google client (no googleapis). Fixed hosts only (SSRF); tokens never appear in errors or logs.
import { z } from "zod";
import { db, type DB } from "../../db/client";
import { env } from "../../env";
import { readCalendarSecret, updateCalendarSecret } from "../connections";
import { ProviderError, type ProviderErrorKind } from "../errors";

export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.calendarlist.readonly", "https://www.googleapis.com/auth/calendar.events"];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://www.googleapis.com/calendar/v3";

const MSG: Record<string, string> = {
  auth: "Access was rejected.",
  rate_limit: "Google rate limit reached.",
  not_found: "That event no longer exists in Google.",
  conflict: "This event changed in Google since you opened it.",
  gone: "Google sync state expired.",
  unavailable: "Google didn't respond.",
  client: "Google rejected the change.",
};
const fail = (kind: ProviderErrorKind, status: number, retry?: number) => new ProviderError("google", kind, status, MSG[kind] ?? MSG.client!, retry);

export function googleAuthUrl(p: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const u = new URL(AUTH_URL);
  u.search = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
  }).toString();
  return u.toString();
}

const tokenRes = z.object({ access_token: z.string(), expires_in: z.number(), refresh_token: z.string().nullish(), scope: z.string().nullish() });

async function tokenCall(form: Record<string, string>, f: typeof fetch) {
  let res: Response;
  try {
    res = await f(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form), signal: AbortSignal.timeout(15000) });
  } catch {
    throw fail("unavailable", 0);
  }
  if (!res.ok) {
    const e = (await res.json().catch(() => null)) as { error?: string } | null;
    if (res.status >= 500) throw fail("unavailable", res.status);
    throw e?.error === "invalid_grant" || res.status === 401 ? fail("auth", res.status === 401 ? 401 : 400) : fail("client", res.status);
  }
  return tokenRes.parse(await res.json());
}

const expiry = (now: Date | undefined, sec: number) => new Date((now ?? new Date()).getTime() + sec * 1000).toISOString();

export async function exchangeCode(p: { code: string; verifier: string; redirectUri: string; clientId: string; clientSecret: string; fetch?: typeof fetch; now?: Date }) {
  const t = await tokenCall(
    { code: p.code, code_verifier: p.verifier, redirect_uri: p.redirectUri, client_id: p.clientId, client_secret: p.clientSecret, grant_type: "authorization_code" },
    p.fetch ?? globalThis.fetch,
  );
  if (!t.refresh_token) throw new ProviderError("google", "client", 400, "Google didn't return offline access.");
  return { refreshToken: t.refresh_token, accessToken: t.access_token, expiresAt: expiry(p.now, t.expires_in), scopes: (t.scope ?? "").split(" ").filter(Boolean) };
}

export async function refreshAccessToken(p: { refreshToken: string; clientId: string; clientSecret: string; fetch?: typeof fetch; now?: Date }) {
  const t = await tokenCall({ refresh_token: p.refreshToken, client_id: p.clientId, client_secret: p.clientSecret, grant_type: "refresh_token" }, p.fetch ?? globalThis.fetch);
  return { accessToken: t.access_token, expiresAt: expiry(p.now, t.expires_in) };
}

function checkPath(path: string) {
  if (!path.startsWith("/") || path.includes("//") || path.includes("://")) throw new Error("Invalid Google path");
}

export function createGoogle({ getToken, fetch = globalThis.fetch, timeoutMs = 15000 }: { getToken: () => Promise<string>; fetch?: typeof globalThis.fetch; timeoutMs?: number }) {
  async function call<T>(method: string, path: string, schema: z.ZodType<T>, opts: { body?: unknown; ifMatch?: string | null } = {}): Promise<T | null> {
    checkPath(path);
    const headers: Record<string, string> = { Authorization: `Bearer ${await getToken()}` };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.ifMatch) headers["If-Match"] = opts.ifMatch;
    let res: Response;
    try {
      res = await fetch(API_BASE + path, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw fail("unavailable", 0);
    }
    if (!res.ok) {
      const s = res.status;
      if (s === 401) throw fail("auth", s);
      const reason = ((await res.json().catch(() => null)) as { error?: { errors?: { reason?: string }[] } } | null)?.error?.errors?.[0]?.reason;
      if (s === 429 || (s === 403 && (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded"))) {
        const ra = Number(res.headers.get("retry-after"));
        throw fail("rate_limit", s, Number.isFinite(ra) && ra > 0 ? ra : undefined);
      }
      // A removed scope needs a reconnect. Plain "forbidden" (e.g. writing a read-only calendar) stays a client error,
      // so one refused write never pauses sync (IN-A07).
      if (s === 403 && reason === "insufficientPermissions") throw fail("auth", s);
      if (s === 404) throw fail("not_found", s);
      if (s === 409 || s === 412) throw fail("conflict", s);
      if (s === 410) throw fail("gone", s);
      throw fail(s >= 500 ? "unavailable" : "client", s);
    }
    if (res.status === 204) return null;
    return schema.parse(await res.json());
  }

  /** truncated: the page limit was hit, so items is not the complete set (WR-A02). */
  async function paginate<T>(path: string, itemSchema: z.ZodType<T>, maxPages = 40): Promise<{ items: T[]; nextSyncToken: string | null; truncated: boolean }> {
    const page = z.object({ items: z.array(itemSchema).nullish(), nextPageToken: z.string().nullish(), nextSyncToken: z.string().nullish() });
    const items: T[] = [];
    let token: string | null = null;
    let sync: string | null = null;
    for (let i = 0; i < maxPages; i++) {
      const sep = path.includes("?") ? "&" : "?";
      const r: z.infer<typeof page> = (await call("GET", token ? `${path}${sep}pageToken=${encodeURIComponent(token)}` : path, page))!;
      items.push(...(r.items ?? []));
      sync = r.nextSyncToken ?? sync;
      token = r.nextPageToken ?? null;
      if (!token) break;
    }
    return { items, nextSyncToken: sync, truncated: token !== null };
  }

  return { call, paginate };
}

type Secret = { refreshToken: string; accessToken: string; expiresAt: string };

/** Returns a valid access token, refreshing (and persisting) once when < 60 s remain. */
export function googleTokenSource(h: DB = db(), o: { fetch?: typeof fetch; now?: () => Date; key?: Buffer } = {}): () => Promise<string> {
  return async () => {
    const s = await readCalendarSecret<Secret>(h, "google_calendar", o.key);
    if (!s) throw new ProviderError("google", "auth", 401, "Google Calendar isn't connected.");
    const now = o.now?.() ?? new Date();
    if (s.accessToken && Date.parse(s.expiresAt) - now.getTime() > 60_000) return s.accessToken;
    const e = env();
    if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) throw new ProviderError("google", "auth", 401, "Google Calendar isn't connected.");
    const t = await refreshAccessToken({ refreshToken: s.refreshToken, clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET, fetch: o.fetch, now });
    await updateCalendarSecret(h, "google_calendar", { ...s, ...t }, o.key);
    return t.accessToken;
  };
}
