import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { SocialPlatform } from "@/lib/social-types";
import { decrypt, encrypt } from "../crypto";
import type { DB } from "../db/client";
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

export async function saveTikTokTokens(h: DB, tokens: { accessToken: string; refreshToken: string; openId: string; scopes: string[]; expiresAt: Date }, opts: { key?: Buffer; now?: Date } = {}): Promise<void> {
  const row = {
    ciphertext: encrypt(JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }), opts.key),
    last4: tokens.accessToken.slice(-4), login: tokens.openId, expiresAt: tokens.expiresAt,
    scopes: tokens.scopes, status: "connected", lastError: null, credentialGeneration: randomUUID(), repos: [] as string[],
  };
  await h.insert(connections).values({ id: "tiktok", ...row }).onConflictDoUpdate({ target: connections.id, set: { ...row, updatedAt: opts.now ?? new Date() } });
  await audit(h, "connection.save", "tiktok", row.last4);
}

// Provider refreshes keep the logical credential binding; the owner reconnect path above rotates it.
export async function refreshSocialToken(h: DB, platform: "instagram" | "tiktok", value: { accessToken: string; refreshToken?: string; expiresAt: Date }, key?: Buffer): Promise<void> {
  const [row] = await h.select().from(connections).where(eq(connections.id, platform));
  if (!row) throw new Error("Connection is missing.");
  const old = platform === "tiktok" ? JSON.parse(decrypt(row.ciphertext, key)) as { refreshToken: string } : null;
  const plaintext = platform === "tiktok" ? JSON.stringify({ accessToken: value.accessToken, refreshToken: value.refreshToken ?? old!.refreshToken }) : value.accessToken;
  await h.update(connections).set({ ciphertext: encrypt(plaintext, key), last4: value.accessToken.slice(-4), expiresAt: value.expiresAt, updatedAt: new Date() }).where(eq(connections.id, platform));
}

export async function socialConnection(h: DB, platform: Exclude<SocialPlatform, "portfolio">, key?: Buffer): Promise<SocialConnection | null> {
  const [row] = await h.select().from(connections).where(eq(connections.id, platform));
  if (!row) return null;
  const raw = decrypt(row.ciphertext, key);
  const token = platform === "tiktok" ? (JSON.parse(raw) as { accessToken: string }).accessToken : raw;
  return { status: row.status, token, login: row.login, scopes: row.scopes, expiresAt: row.expiresAt, credentialGeneration: row.credentialGeneration };
}

export async function socialConnectionStatus(h: DB): Promise<Record<Exclude<SocialPlatform, "portfolio"> | "tiktok_app", { status: string; last4: string; login: string | null; expiresAt: Date | null; credentialGeneration: string | null } | null>> {
  const ids = ["linkedin", "instagram", "tiktok", "tiktok_app"] as const;
  const rows = await h.select({ id: connections.id, status: connections.status, last4: connections.last4, login: connections.login, expiresAt: connections.expiresAt, credentialGeneration: connections.credentialGeneration }).from(connections).where(inArray(connections.id, [...ids]));
  return Object.fromEntries(ids.map((id) => [id, rows.find((r) => r.id === id) ?? null])) as Record<(typeof ids)[number], (typeof rows)[number] | null>;
}

export async function verifyInstagramConnection(h: DB): Promise<void> {
  await h.update(connections).set({ status: "connected", lastError: null, updatedAt: new Date() }).where(eq(connections.id, "instagram"));
  await audit(h, "connection.verify", "instagram");
}

export async function markSocialAuthError(h: DB, platform: Exclude<SocialPlatform, "portfolio">): Promise<void> {
  await h.update(connections).set({ status: "error", lastError: "RECONNECT", updatedAt: new Date() }).where(eq(connections.id, platform));
}

export async function removeSocialConnection(h: DB, id: Exclude<SocialPlatform, "portfolio"> | "tiktok_app"): Promise<void> {
  await h.delete(connections).where(eq(connections.id, id));
  await audit(h, "connection.remove", id);
}
