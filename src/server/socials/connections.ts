import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { SocialPlatform } from "@/lib/social-types";
import { decrypt, encrypt } from "../crypto";
import type { DB } from "../db/client";
import { notifyLive } from "../events";
import { auditLog, connections } from "../db/schema";

export type SocialConnection = {
  status: string;
  token: string;
  login?: string | null;
  scopes?: string[];
  expiresAt?: Date | null;
  credentialGeneration: string | null;
};
type SaveResult = { ok: true; login: string } | { ok: false; error: "invalid" | "rejected" | "unreachable" };
type Opts = { fetch?: typeof fetch; now?: Date; key?: Buffer };

async function audit(h: DB, action: string, id: string, last4?: string) {
  await h.insert(auditLog).values({ actor: "owner", action, target: id, metadata: last4 ? { id, last4 } : { id } });
  await notifyLive(h, "socials", id);
}

// Only these fixed validation URLs are ever called with a pasted token.
const VALIDATION_URL = {
  linkedin: "https://api.linkedin.com/v2/userinfo",
  instagram: "https://graph.instagram.com/me?fields=user_id,username",
} as const;

export async function saveSocialToken(h: DB, platform: "linkedin" | "instagram", raw: string, opts: Opts = {}): Promise<SaveResult> {
  const token = raw.trim();
  if (!token || token.length > 4096) return { ok: false, error: "invalid" };
  let identity: Record<string, unknown>;
  try {
    const res = await (opts.fetch ?? fetch)(VALIDATION_URL[platform], {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "rejected" };
    if (!res.ok) return { ok: false, error: "unreachable" };
    identity = await res.json() as Record<string, unknown>;
  } catch {
    return { ok: false, error: "unreachable" };
  }
  const id = platform === "linkedin" ? identity.sub : identity.user_id ?? identity.id;
  if (typeof id !== "string" || !id || !/^[A-Za-z0-9_-]+$/.test(id)) return { ok: false, error: "rejected" };
  const login = platform === "linkedin" ? `urn:li:person:${id}` : id;
  const now = opts.now ?? new Date();
  const row = {
    ciphertext: encrypt(token, opts.key), last4: token.slice(-4), login,
    expiresAt: platform === "linkedin" ? new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000) : null,
    status: platform === "instagram" ? "verification_pending" : "connected", lastError: null,
    credentialGeneration: randomUUID(), scopes: [] as string[], repos: [] as string[],
  };
  await h.insert(connections).values({ id: platform, ...row }).onConflictDoUpdate({ target: connections.id, set: { ...row, updatedAt: now } });
  await audit(h, "connection.save", platform, row.last4);
  return { ok: true, login };
}

export async function saveTikTokApp(h: DB, clientKey: string, clientSecret: string, opts: { key?: Buffer; now?: Date } = {}): Promise<boolean> {
  if (!clientKey.trim() || !clientSecret.trim() || clientKey.length > 255 || clientSecret.length > 255) return false;
  const row = {
    ciphertext: encrypt(JSON.stringify({ clientKey: clientKey.trim(), clientSecret: clientSecret.trim() }), opts.key),
    last4: clientKey.trim().slice(-4), login: null, expiresAt: null, status: "connected", lastError: null,
    credentialGeneration: randomUUID(), repos: [] as string[], scopes: [] as string[],
  };
  await h.insert(connections).values({ id: "tiktok_app", ...row }).onConflictDoUpdate({ target: connections.id, set: { ...row, updatedAt: opts.now ?? new Date() } });
  await audit(h, "connection.save", "tiktok_app", row.last4);
  return true;
}

export async function tikTokAppCredentials(h: DB, key?: Buffer): Promise<{ clientKey: string; clientSecret: string } | null> {
  const [row] = await h.select({ ciphertext: connections.ciphertext }).from(connections).where(eq(connections.id, "tiktok_app"));
  if (!row) return null;
  const value: unknown = JSON.parse(decrypt(row.ciphertext, key));
  if (!value || typeof value !== "object" || !("clientKey" in value) || !("clientSecret" in value) ||
      typeof value.clientKey !== "string" || typeof value.clientSecret !== "string") return null;
  return { clientKey: value.clientKey, clientSecret: value.clientSecret };
}

export async function saveTikTokTokens(h: DB, tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: Date; openId: string; scopes: string[]; expiresAt: Date }, opts: { key?: Buffer; now?: Date } = {}): Promise<void> {
  const row = {
    ciphertext: encrypt(JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, refreshExpiresAt: tokens.refreshExpiresAt.toISOString() }), opts.key),
    last4: tokens.accessToken.slice(-4), login: tokens.openId, expiresAt: tokens.expiresAt,
    scopes: tokens.scopes, status: "connected", lastError: null, credentialGeneration: randomUUID(), repos: [] as string[],
  };
  await h.insert(connections).values({ id: "tiktok", ...row }).onConflictDoUpdate({ target: connections.id, set: { ...row, updatedAt: opts.now ?? new Date() } });
  await audit(h, "connection.save", "tiktok", row.last4);
}

// Provider refreshes keep the logical credential binding; the owner reconnect path above rotates it.
export async function refreshSocialToken(h: DB, platform: "instagram" | "tiktok", value: { accessToken: string; refreshToken?: string; refreshExpiresAt?: Date; expiresAt: Date; scopes?: string[] }, key?: Buffer): Promise<void> {
  const [row] = await h.select().from(connections).where(eq(connections.id, platform));
  if (!row) throw new Error("Connection is missing.");
  const old = platform === "tiktok" ? JSON.parse(decrypt(row.ciphertext, key)) as { refreshToken: string; refreshExpiresAt?: string } : null;
  const plaintext = platform === "tiktok" ? JSON.stringify({ accessToken: value.accessToken, refreshToken: value.refreshToken ?? old!.refreshToken,
    refreshExpiresAt: value.refreshExpiresAt?.toISOString() ?? old!.refreshExpiresAt }) : value.accessToken;
  const [won] = await h.update(connections).set({ ciphertext: encrypt(plaintext, key), last4: value.accessToken.slice(-4), expiresAt: value.expiresAt,
    ...(value.scopes ? { scopes: value.scopes } : {}), updatedAt: new Date() })
    .where(and(eq(connections.id, platform), eq(connections.ciphertext, row.ciphertext))).returning({ id: connections.id });
  if (!won) throw new Error("Connection changed during refresh.");
}

export const TIKTOK_COOKIE = "lifeos_tiktok_oauth";
const TIKTOK_SCOPES = ["user.info.basic", "user.info.stats", "video.list"];
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

function redirectUri(base: string): string {
  if (new URL(base).protocol !== "https:") throw new Error("TikTok requires HTTPS.");
  return `${base.replace(/\/$/, "")}/api/connections/tiktok/callback`;
}

export function tikTokAuthUrl(clientKey: string, state: string, base: string): string {
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.search = new URLSearchParams({ client_key: clientKey, response_type: "code", scope: TIKTOK_SCOPES.join(","), redirect_uri: redirectUri(base), state }).toString();
  return url.toString();
}

export async function startTikTokOAuth(h: DB, base: string, opts: { now?: Date; key?: Buffer } = {}): Promise<{ url: string; cookie: string } | { error: "not_configured" }> {
  try {
    const app = await tikTokAppCredentials(h, opts.key);
    if (!app) return { error: "not_configured" };
    const state = randomBytes(32).toString("base64url");
    return { url: tikTokAuthUrl(app.clientKey, state, base), cookie: encrypt(JSON.stringify({ state, at: (opts.now ?? new Date()).toISOString() }), opts.key) };
  } catch { return { error: "not_configured" }; }
}

type TikTokOAuthResult = { ok: true; scopes: string[] } | { ok: false; error: "state" | "cancelled" | "scope" | "failed" };
export async function completeTikTokOAuth(h: DB, p: { code: string | null; state: string | null; cookie: string | null; base: string; error?: string | null; fetch?: typeof fetch; now?: Date; key?: Buffer }): Promise<TikTokOAuthResult> {
  const now = p.now ?? new Date();
  let saved: { state: string; at: string };
  try { saved = JSON.parse(decrypt(p.cookie ?? "", p.key)); }
  catch { return { ok: false, error: "state" }; }
  const actual = Buffer.from(p.state ?? "");
  const expected = Buffer.from(saved.state ?? "");
  if (!actual.length || actual.length !== expected.length || !timingSafeEqual(actual, expected) ||
      !Number.isFinite(Date.parse(saved.at)) || now.getTime() < Date.parse(saved.at) || now.getTime() - Date.parse(saved.at) > 10 * 60_000) return { ok: false, error: "state" };
  if (p.error) return { ok: false, error: "cancelled" };
  if (!p.code) return { ok: false, error: "failed" };
  try {
    const app = await tikTokAppCredentials(h, p.key);
    if (!app) return { ok: false, error: "failed" };
    const res = await (p.fetch ?? fetch)(TIKTOK_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: app.clientKey, client_secret: app.clientSecret, code: p.code, grant_type: "authorization_code", redirect_uri: redirectUri(p.base) }), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { ok: false, error: "failed" };
    const body = await res.json() as Record<string, unknown>;
    const scopes = typeof body.scope === "string" ? body.scope.split(",").map((s) => s.trim()).filter(Boolean) : [];
    if (!scopes.includes("user.info.basic")) return { ok: false, error: "scope" };
    if (typeof body.access_token !== "string" || typeof body.refresh_token !== "string" || typeof body.open_id !== "string" ||
        typeof body.expires_in !== "number" || !Number.isFinite(body.expires_in) || body.expires_in <= 0 ||
        typeof body.refresh_expires_in !== "number" || !Number.isFinite(body.refresh_expires_in) || body.refresh_expires_in <= 0) return { ok: false, error: "failed" };
    await saveTikTokTokens(h, { accessToken: body.access_token, refreshToken: body.refresh_token, openId: body.open_id,
      scopes, expiresAt: new Date(now.getTime() + body.expires_in * 1000), refreshExpiresAt: new Date(now.getTime() + body.refresh_expires_in * 1000) }, { now, key: p.key });
    return { ok: true, scopes };
  } catch { return { ok: false, error: "failed" }; }
}

export async function socialConnection(h: DB, platform: Exclude<SocialPlatform, "portfolio">, key?: Buffer): Promise<SocialConnection | null> {
  const [row] = await h.select().from(connections).where(eq(connections.id, platform));
  if (!row) return null;
  const raw = decrypt(row.ciphertext, key);
  const token = platform === "tiktok" ? (JSON.parse(raw) as { accessToken: string }).accessToken : raw;
  return { status: row.status, token, login: row.login, scopes: row.scopes, expiresAt: row.expiresAt, credentialGeneration: row.credentialGeneration };
}

export async function socialConnectionStatus(h: DB): Promise<Record<Exclude<SocialPlatform, "portfolio"> | "tiktok_app", { status: string; last4: string; login: string | null; expiresAt: Date | null; credentialGeneration: string | null; scopes: string[]; lastSyncError: string | null } | null>> {
  const ids = ["linkedin", "instagram", "tiktok", "tiktok_app"] as const;
  const rows = await h.select({ id: connections.id, status: connections.status, last4: connections.last4, login: connections.login, expiresAt: connections.expiresAt, credentialGeneration: connections.credentialGeneration, scopes: connections.scopes, lastSyncError: connections.lastSyncError }).from(connections).where(inArray(connections.id, [...ids]));
  return Object.fromEntries(ids.map((id) => [id, rows.find((r) => r.id === id) ?? null])) as Record<(typeof ids)[number], (typeof rows)[number] | null>;
}

export async function verifyInstagramConnection(h: DB, generation: string): Promise<boolean> {
  const [won] = await h.update(connections).set({ status: "connected", lastError: null, updatedAt: new Date() })
    .where(and(eq(connections.id, "instagram"), eq(connections.credentialGeneration, generation), eq(connections.status, "verification_pending")))
    .returning({ id: connections.id });
  if (!won) return false;
  await audit(h, "connection.verify", "instagram");
  return true;
}

export async function markSocialAuthError(h: DB, platform: Exclude<SocialPlatform, "portfolio">): Promise<void> {
  await h.update(connections).set({ status: "error", lastError: "RECONNECT", updatedAt: new Date() }).where(eq(connections.id, platform));
}

export async function removeSocialConnection(h: DB, id: Exclude<SocialPlatform, "portfolio"> | "tiktok_app"): Promise<void> {
  await h.transaction(async (tx) => {
    await tx.delete(connections).where(inArray(connections.id, id === "tiktok_app" ? [id, "tiktok"] : [id]));
    await audit(tx, "connection.remove", id);
  });
}
