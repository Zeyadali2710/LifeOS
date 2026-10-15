import { isPublicHttpsImageUrl, type SocialCapabilities, type SocialMetrics, type SocialPlatform } from "@/lib/social-types";
import type { SocialConnection } from "./connections";

export type PublishVariant = { text: string; imageUrl?: string | null; linkUrl?: string | null; containerId?: string | null };
export type PublishResult = { state: "published"; remoteId: string; remoteUrl?: string; containerId?: string } | { state: "container_pending"; containerId: string };
export type SyncResult = { account?: { followers?: number; posts?: number }; posts?: { remoteId: string; metrics: SocialMetrics }[] };
export interface SocialProvider {
  platform: SocialPlatform;
  label: string;
  isMock: boolean;
  capabilities: SocialCapabilities;
  credentialGeneration: string | null;
  publish?(variant: PublishVariant, idemKey: string): Promise<PublishResult>;
  findPublished?(variant: PublishVariant): Promise<PublishResult | null>;
  sync?(since?: Date): Promise<SyncResult>;
}

export class ProviderAuthError extends Error { constructor() { super("RECONNECT"); } }
export class SocialProviderError extends Error { constructor() { super("The social service is unavailable."); } }
export class UncertainPublishError extends Error { constructor() { super("Publication may have succeeded. Check the platform before retrying."); } }
type Fetch = typeof fetch;
type Deps = { fetch?: Fetch };

const LABEL: Record<SocialPlatform, string> = { linkedin: "LinkedIn", instagram: "Instagram", tiktok: "TikTok", portfolio: "Portfolio" };
const LINKEDIN = "https://api.linkedin.com";
const INSTAGRAM = "https://graph.instagram.com";
const TIKTOK = "https://open.tiktokapis.com";
const noPublish: SocialCapabilities = { draft: true, publish: false, schedule: false, analytics: false };

async function request(f: Fetch, url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try { res = await f(url, { ...init, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new SocialProviderError(); }
  if (res.status === 401 || res.status === 403) throw new ProviderAuthError();
  if (!res.ok) throw new SocialProviderError();
  return res;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function numberField(source: Record<string, unknown>, from: string, to: keyof SocialMetrics, into: SocialMetrics): void {
  const value = source[from];
  if (typeof value === "number" && Number.isFinite(value)) into[to] = value;
}
function metrics(source: Record<string, unknown>, fields: readonly [string, keyof SocialMetrics][]): SocialMetrics {
  const out: SocialMetrics = {};
  for (const [from, to] of fields) numberField(source, from, to, out);
  return out;
}
async function tikTokBody(res: Response): Promise<Record<string, unknown>> {
  const body = object(await res.json());
  if (object(body.error).code !== "ok") throw new SocialProviderError();
  return body;
}

// LinkedIn's little text parser treats these punctuation characters as syntax.
export function escapeLittleText(value: string): string { return value.replace(/[|{}@\[\]()<>#\\*_~]/g, "\\$&"); }

const mockPublished = new Map<string, PublishResult>();
function mockProvider(platform: Exclude<SocialPlatform, "portfolio">): SocialProvider {
  const caps = platform === "linkedin" ? { draft: true, publish: true, schedule: true, analytics: false }
    : platform === "instagram" ? { draft: true, publish: true, schedule: true, analytics: true }
      : { ...noPublish, analytics: true };
  return {
    platform, label: LABEL[platform], isMock: true, capabilities: caps, credentialGeneration: null,
    ...(caps.publish ? {
      async publish(_variant: PublishVariant, idemKey: string) {
        const key = `${platform}:${idemKey}`;
        const existing = mockPublished.get(key);
        if (existing) return existing;
        const result: PublishResult = { state: "published", remoteId: `mock:${platform}:${mockPublished.size + 1}` };
        mockPublished.set(key, result);
        return result;
      },
      async findPublished() { return null; },
    } : {}),
    ...(caps.analytics ? { async sync() { return { account: { followers: 0 }, posts: [] }; } } : {}),
  };
}

function linkedIn(connection: SocialConnection, f: Fetch): SocialProvider {
  const ready = connection.status === "connected" && !!connection.token && !!connection.login &&
    (!connection.expiresAt || connection.expiresAt.getTime() > Date.now());
  return {
    platform: "linkedin", label: "LinkedIn", isMock: false,
    credentialGeneration: connection.credentialGeneration,
    capabilities: { draft: true, publish: ready, schedule: ready, analytics: false },
    ...(ready ? { async publish(variant: PublishVariant): Promise<PublishResult> {
      const link = variant.linkUrl?.trim();
      if (link) { const url = new URL(link); if (url.protocol !== "https:") throw new SocialProviderError(); }
      const commentary = escapeLittleText(variant.text) + (link ? `\n${link}` : "");
      const payload = { author: connection.login, commentary, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED" }, lifecycleState: "PUBLISHED" };
      let res: Response;
      try {
        res = await request(f, `${LINKEDIN}/rest/posts`, {
          method: "POST", headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json", "Linkedin-Version": "202609", "X-Restli-Protocol-Version": "2.0.0" },
          body: JSON.stringify(payload),
        });
      } catch (err) { if (err instanceof ProviderAuthError) throw err; throw new UncertainPublishError(); }
      const remoteId = res.headers.get("x-restli-id");
      if (!remoteId) throw new UncertainPublishError();
      return { state: "published", remoteId };
    } } : {}),
  };
}

function instagram(connection: SocialConnection, f: Fetch): SocialProvider {
  const verified = connection.status === "connected" && !!connection.token && !!connection.login &&
    (!connection.expiresAt || connection.expiresAt.getTime() > Date.now());
  const headers = { Authorization: `Bearer ${connection.token}` };
  async function containerStatus(id: string): Promise<string> {
    const res = await request(f, `${INSTAGRAM}/${encodeURIComponent(id)}?fields=status_code`, { headers });
    return String(object(await res.json()).status_code ?? "");
  }
  async function findPublished(variant: PublishVariant): Promise<PublishResult | null> {
    if (!variant.containerId) return null;
    const status = await containerStatus(variant.containerId);
    if (status !== "PUBLISHED") return null;
    const res = await request(f, `${INSTAGRAM}/me/media?fields=id,caption&limit=25`, { headers });
    const media = object(await res.json()).data;
    if (!Array.isArray(media)) return null;
    const matches = media.filter((item) => object(item).caption === variant.text && typeof object(item).id === "string");
    return matches.length === 1 ? { state: "published", remoteId: String(object(matches[0]).id), containerId: variant.containerId } : null;
  }
  return {
    platform: "instagram", label: "Instagram", isMock: false, credentialGeneration: connection.credentialGeneration,
    capabilities: { draft: true, publish: verified, schedule: verified, analytics: verified },
    ...(verified ? {
      findPublished,
      async publish(variant: PublishVariant): Promise<PublishResult> {
        let containerId = variant.containerId;
        if (!containerId) {
          if (!variant.imageUrl || !isPublicHttpsImageUrl(variant.imageUrl)) throw new SocialProviderError();
          let res: Response;
          try {
            res = await request(f, `${INSTAGRAM}/${encodeURIComponent(connection.login!)}/media`, {
              method: "POST", headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ image_url: variant.imageUrl, caption: variant.text }).toString(),
            });
          } catch (err) { if (err instanceof ProviderAuthError) throw err; throw new UncertainPublishError(); }
          containerId = String(object(await res.json().catch(() => null)).id ?? "");
          if (!containerId) throw new UncertainPublishError();
          return { state: "container_pending", containerId }; // caller persists this before another request
        }
        const status = await containerStatus(containerId);
        if (status === "PUBLISHED") {
          const found = await findPublished(variant);
          if (found) return found;
          throw new UncertainPublishError();
        }
        if (status !== "FINISHED") return { state: "container_pending", containerId };
        let res: Response;
        try {
          res = await request(f, `${INSTAGRAM}/${encodeURIComponent(connection.login!)}/media_publish`, {
            method: "POST", headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ creation_id: containerId }).toString(),
          });
        } catch (err) { if (err instanceof ProviderAuthError) throw err; throw new UncertainPublishError(); }
        const remoteId = object(await res.json().catch(() => null)).id;
        if (typeof remoteId !== "string" || !remoteId) throw new UncertainPublishError();
        return { state: "published", remoteId, containerId };
      },
      async sync(): Promise<SyncResult> {
        const res = await request(f, `${INSTAGRAM}/me?fields=followers_count,media_count`, { headers });
        const body = object(await res.json());
        const account: NonNullable<SyncResult["account"]> = {};
        if (typeof body.followers_count === "number") account.followers = body.followers_count;
        if (typeof body.media_count === "number") account.posts = body.media_count;
        return { account, posts: [] }; // media metric names require owner smoke evidence
      },
    } : {}),
  };
}

function tikTok(connection: SocialConnection, f: Fetch): SocialProvider {
  const scopes = new Set(connection.scopes ?? []);
  const ready = connection.status === "connected" && !!connection.token && (!connection.expiresAt || connection.expiresAt.getTime() > Date.now());
  const analytics = ready && (scopes.has("user.info.stats") || scopes.has("video.list"));
  const headers = { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" };
  return {
    platform: "tiktok", label: "TikTok", isMock: false, credentialGeneration: connection.credentialGeneration,
    capabilities: { ...noPublish, analytics },
    ...(analytics ? { async sync(): Promise<SyncResult> {
      const out: SyncResult = {};
      if (scopes.has("user.info.stats")) {
        const res = await request(f, `${TIKTOK}/v2/user/info/?fields=follower_count,video_count,likes_count`, { headers });
        const user = object((await tikTokBody(res)).data).user;
        const fields = object(user);
        out.account = {};
        if (typeof fields.follower_count === "number") out.account.followers = fields.follower_count;
        if (typeof fields.video_count === "number") out.account.posts = fields.video_count;
      }
      if (scopes.has("video.list")) {
        const res = await request(f, `${TIKTOK}/v2/video/list/?fields=id,view_count,like_count,comment_count,share_count`, {
          method: "POST", headers, body: JSON.stringify({ max_count: 20 }),
        });
        const body = await tikTokBody(res);
        const videos = object(body.data).videos;
        out.posts = Array.isArray(videos) ? videos.filter((v) => typeof object(v).id === "string").map((v) => ({
          remoteId: String(object(v).id), metrics: metrics(object(v), [["view_count", "views"], ["like_count", "likes"], ["comment_count", "comments"], ["share_count", "shares"]]),
        })) : [];
      }
      return out;
    } } : {}),
  };
}

export function getProvider(platform: SocialPlatform, connection: SocialConnection | null, deps: Deps = {}): SocialProvider {
  if (platform === "portfolio") return { platform, label: LABEL[platform], isMock: false, credentialGeneration: null, capabilities: noPublish };
  if (!connection) return mockProvider(platform);
  const f = deps.fetch ?? fetch;
  if (platform === "linkedin") return linkedIn(connection, f);
  if (platform === "instagram") return instagram(connection, f);
  return tikTok(connection, f);
}
