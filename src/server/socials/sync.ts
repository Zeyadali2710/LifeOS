import { and, eq, gte, inArray } from "drizzle-orm";
import { sydneyYmd } from "@/lib/project-rules";
import { decrypt } from "../crypto";
import { db, type DB } from "../db/client";
import { connections, socialAccountSnapshots, socialVariants } from "../db/schema";
import { emitActivity, notifyLive } from "../events";
import { log } from "../log";
import { refreshSocialToken, socialConnection, tikTokAppCredentials, markSocialAuthError } from "./connections";
import { getProvider, ProviderAuthError } from "./providers";
import { runScheduled } from "./publish";

const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const DAY = 86_400_000;

async function refreshTikTok(h: DB, now: Date, f: typeof fetch): Promise<void> {
  const [row] = await h.select().from(connections).where(eq(connections.id, "tiktok"));
  if (!row || row.status !== "connected" || !row.expiresAt || row.expiresAt > new Date(now.getTime() + 2 * 60 * 60_000)) return;
  const app = await tikTokAppCredentials(h);
  if (!app) throw new Error("TikTok app credentials missing.");
  const saved = JSON.parse(decrypt(row.ciphertext)) as { refreshToken?: string; refreshExpiresAt?: string };
  if (!saved.refreshToken || !saved.refreshExpiresAt || Date.parse(saved.refreshExpiresAt) <= now.getTime()) throw new ProviderAuthError();
  const res = await f(TIKTOK_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: app.clientKey, client_secret: app.clientSecret, grant_type: "refresh_token", refresh_token: saved.refreshToken }),
    signal: AbortSignal.timeout(15_000) });
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new ProviderAuthError();
  if (!res.ok) throw new Error("TikTok refresh failed.");
  const body = await res.json() as Record<string, unknown>;
  const scopes = typeof body.scope === "string" ? body.scope.split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (!scopes.includes("user.info.basic") || (typeof body.open_id === "string" && body.open_id !== row.login) ||
      typeof body.access_token !== "string" || typeof body.refresh_token !== "string" ||
      typeof body.expires_in !== "number" || !Number.isFinite(body.expires_in) || body.expires_in <= 0 ||
      typeof body.refresh_expires_in !== "number" || !Number.isFinite(body.refresh_expires_in) || body.refresh_expires_in <= 0) throw new Error("TikTok refresh response invalid.");
  await refreshSocialToken(h, "tiktok", { accessToken: body.access_token, refreshToken: body.refresh_token,
    expiresAt: new Date(now.getTime() + body.expires_in * 1000), refreshExpiresAt: new Date(now.getTime() + body.refresh_expires_in * 1000), scopes });
}

async function refreshInstagram(h: DB, now: Date, f: typeof fetch): Promise<void> {
  const [row] = await h.select().from(connections).where(eq(connections.id, "instagram"));
  if (!row || row.status !== "connected" || now.getTime() - row.updatedAt.getTime() < 7 * DAY) return;
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.search = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: decrypt(row.ciphertext) }).toString();
  const res = await f(url.toString(), { signal: AbortSignal.timeout(15_000) });
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new ProviderAuthError();
  if (!res.ok) throw new Error("Instagram refresh failed.");
  const body = await res.json() as Record<string, unknown>;
  if (typeof body.access_token !== "string" || typeof body.expires_in !== "number" || !Number.isFinite(body.expires_in) || body.expires_in <= 0) throw new Error("Instagram refresh response invalid.");
  await refreshSocialToken(h, "instagram", { accessToken: body.access_token, expiresAt: new Date(now.getTime() + body.expires_in * 1000) });
}

async function linkedInExpiry(h: DB, now: Date): Promise<void> {
  const [row] = await h.select().from(connections).where(eq(connections.id, "linkedin"));
  if (!row?.expiresAt || row.status !== "connected") return;
  if (row.expiresAt <= now) {
    await markSocialAuthError(h, "linkedin");
    await emitActivity({ type: "social.connection_expired", source: "social", title: "LinkedIn needs reconnecting", tone: "amber" },
      { category: "IMPORTANT", title: "LinkedIn needs reconnecting", actionUrl: "/settings?section=connections" }, h);
  } else if (row.expiresAt.getTime() - now.getTime() <= 7 * DAY && row.lastError !== "EXPIRES_SOON") {
    await h.update(connections).set({ lastError: "EXPIRES_SOON" }).where(eq(connections.id, "linkedin"));
    await emitActivity({ type: "social.connection_expiring", source: "social", title: "LinkedIn token expires soon", tone: "amber" },
      { category: "IMPORTANT", title: "LinkedIn token expires soon", actionUrl: "/settings?section=connections" }, h);
  }
}

export async function syncSocials(h: DB = db(), now = new Date(), f: typeof fetch = fetch): Promise<void> {
  await linkedInExpiry(h, now);
  for (const platform of ["instagram", "tiktok"] as const) {
    const [row] = await h.select().from(connections).where(eq(connections.id, platform));
    if (!row || row.status !== "connected") continue;
    try {
      if (platform === "tiktok") await refreshTikTok(h, now, f);
      else await refreshInstagram(h, now, f);
      const connection = await socialConnection(h, platform);
      const provider = getProvider(platform, connection, { fetch: f });
      if (!provider.capabilities.analytics || !provider.sync) {
        if (connection?.expiresAt && connection.expiresAt <= now) throw new ProviderAuthError();
        continue;
      }
      const result = await provider.sync(new Date(now.getTime() - 90 * DAY));
      if (result.account) await h.insert(socialAccountSnapshots).values({ platform, date: sydneyYmd(now),
        followers: result.account.followers ?? null, posts: result.account.posts ?? null })
        .onConflictDoUpdate({ target: [socialAccountSnapshots.platform, socialAccountSnapshots.date],
          set: { followers: result.account.followers ?? null, posts: result.account.posts ?? null, updatedAt: now } });
      const posts = new Map((result.posts ?? []).map((p) => [p.remoteId, p.metrics]));
      if (posts.size) {
        const variants = await h.select({ id: socialVariants.id, remoteId: socialVariants.remoteId }).from(socialVariants)
          .where(and(eq(socialVariants.platform, platform), inArray(socialVariants.status, ["published", "posted_manually"]),
            eq(socialVariants.isMock, false), gte(socialVariants.publishedAt, new Date(now.getTime() - 90 * DAY))));
        for (const v of variants) {
          const metrics = v.remoteId ? posts.get(v.remoteId) : undefined;
          if (metrics) await h.update(socialVariants).set({ metrics, metricsAt: now, updatedAt: now }).where(eq(socialVariants.id, v.id));
        }
      }
      await h.update(connections).set({ lastSyncAt: now, lastSyncError: null }).where(eq(connections.id, platform));
    } catch (err) {
      if (err instanceof ProviderAuthError) await markSocialAuthError(h, platform);
      await h.update(connections).set({ lastSyncAt: now, lastSyncError: err instanceof ProviderAuthError ? "RECONNECT" : "Social sync failed. Retry later." }).where(eq(connections.id, platform));
      log.warn({ platform, error: err instanceof Error ? err.name : "unknown" }, "social sync failed");
    }
  }
  await runScheduled(h, now);
  await notifyLive(h, "socials", "sync");
}
