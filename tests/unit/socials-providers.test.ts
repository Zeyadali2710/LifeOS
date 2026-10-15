import { describe, expect, it, vi } from "vitest";
import { getProvider, ProviderAuthError, SocialProviderError, UncertainPublishError } from "@/server/socials/providers";
import { portfolioMarkdown } from "@/server/socials/markdown";
import { socialFixture } from "../helpers/fake-socials";
import { completeTikTokOAuth, tikTokAuthUrl, refreshSocialToken } from "@/server/socials/connections";
import { decrypt, encrypt } from "@/server/crypto";
import type { DB } from "@/server/db/client";
import { connections } from "@/server/db/schema";

describe("social providers", () => {
  it("keeps disconnected providers mock and manual platforms unpublishable", () => {
    for (const platform of ["linkedin", "instagram", "tiktok"] as const) expect(getProvider(platform, null).isMock).toBe(true);
    expect(getProvider("tiktok", null).capabilities.publish).toBe(false);
    expect(getProvider("portfolio", null)).toMatchObject({ isMock: false, capabilities: { publish: false, analytics: false } });
  });

  it("keeps an unverified real Instagram connection locked", () => {
    const p = getProvider("instagram", { status: "verification_pending", token: "secret", login: "123", credentialGeneration: "generation" });
    expect(p.isMock).toBe(false);
    expect(p.capabilities).toMatchObject({ publish: false, analytics: false });
    expect(p.publish).toBeUndefined();
  });

  it("posts LinkedIn little text with a plain link and current headers", async () => {
    const f = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => { void args; return new Response(null, { status: 201, headers: { "x-restli-id": String((socialFixture("linkedinPost") as { id: string }).id) } }); });
    const p = getProvider("linkedin", { status: "connected", token: "secret", login: "urn:li:person:456", credentialGeneration: "generation" }, { fetch: f });
    expect(await p.publish?.({ text: "Hello #world *today*", linkUrl: "https://example.com" }, "approval:1")).toMatchObject({ remoteId: "urn:li:share:123" });
    expect(f).toHaveBeenCalledOnce();
    expect(f.mock.calls[0]![0]).toBe("https://api.linkedin.com/rest/posts");
    const request = f.mock.calls[0]![1] as RequestInit;
    expect(request.headers).toMatchObject({ "Linkedin-Version": "202609", "X-Restli-Protocol-Version": "2.0.0" });
    expect(JSON.parse(request.body as string)).toMatchObject({
      author: "urn:li:person:456", commentary: "Hello \\#world \\*today\\*\nhttps://example.com", visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED" }, lifecycleState: "PUBLISHED",
    });
    expect(JSON.parse(request.body as string).content).toBeUndefined();
  });

  it("does not create another Instagram container on retry", async () => {
    const f = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => { void args; return new Response(JSON.stringify(socialFixture("instagramContainer")), { status: 200 }); });
    const p = getProvider("instagram", { status: "connected", token: "secret", login: "123", credentialGeneration: "generation" }, { fetch: f });
    expect(await p.findPublished?.({ text: "caption", imageUrl: "https://example.com/image.jpg", containerId: "container" })).toBeNull();
    expect(f.mock.calls.every((call) => (call[1] as RequestInit).method !== "POST")).toBe(true);
  });

  it("reuses a stored Instagram container when publishing becomes possible", async () => {
    const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/media") && init?.method === "POST") return Response.json({ id: "container-1" });
      if (url.includes("container-1?")) return Response.json({ status_code: "FINISHED" });
      if (url.endsWith("/media_publish")) return Response.json({ id: "media-1" });
      throw new Error(`Unexpected request: ${url}`);
    });
    const p = getProvider("instagram", { status: "connected", token: "secret", login: "123", credentialGeneration: "generation" }, { fetch: f });
    const first = await p.publish?.({ text: "caption", imageUrl: "https://example.com/image.jpg" }, "approval:1");
    expect(first).toEqual({ state: "container_pending", containerId: "container-1" });
    expect(await p.publish?.({ text: "caption", imageUrl: "https://example.com/image.jpg", containerId: "container-1" }, "approval:1"))
      .toEqual({ state: "published", remoteId: "media-1", containerId: "container-1" });
    expect(f.mock.calls.filter(([url, init]) => String(url).endsWith("/media") && init?.method === "POST")).toHaveLength(1);
  });

  it.each(["ERROR", "EXPIRED"])("stops retrying a terminal Instagram container: %s", async (status) => {
    const f = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ status_code: status }));
    const p = getProvider("instagram", { status: "connected", token: "secret", login: "123", credentialGeneration: "generation" }, { fetch: f });
    await expect(p.publish?.({ text: "caption", imageUrl: "https://example.com/image.jpg", containerId: "container-1" }, "approval:1"))
      .rejects.toBeInstanceOf(SocialProviderError);
    expect(f).toHaveBeenCalledOnce();
    expect((f.mock.calls[0]![1] as RequestInit).method).toBeUndefined();
  });

  it("will not adopt an Instagram media item if its caption is not unique", async () => {
    const f = vi.fn(async (input: RequestInfo | URL) => Response.json(String(input).includes("/me/media")
      ? { data: [{ id: "one", caption: "caption" }, { id: "two", caption: "caption" }] }
      : { status_code: "PUBLISHED" }));
    const p = getProvider("instagram", { status: "connected", token: "secret", login: "123", credentialGeneration: "generation" }, { fetch: f });
    expect(await p.findPublished?.({ text: "caption", containerId: "container" })).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("checks later Instagram media pages before adopting a caption", async () => {
    const f = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes("/me/media")) return Response.json({ status_code: "PUBLISHED" });
      return Response.json(url.includes("after=page-2")
        ? { data: [{ id: "two", caption: "caption" }] }
        : { data: [{ id: "one", caption: "caption" }], paging: { next: "present", cursors: { after: "page-2" } } });
    });
    const p = getProvider("instagram", { status: "connected", token: "secret", login: "123", credentialGeneration: "generation" }, { fetch: f });
    expect(await p.findPublished?.({ text: "caption", containerId: "container" })).toBeNull();
    expect(f).toHaveBeenCalledTimes(3);
    expect(String(f.mock.calls[2]![0])).toContain("after=page-2");
  });

  it("stops on an ambiguous Instagram container response", async () => {
    const f = vi.fn(async () => { throw new Error("connection lost"); });
    const p = getProvider("instagram", { status: "connected", token: "secret", login: "123", credentialGeneration: "generation" }, { fetch: f });
    await expect(p.publish?.({ text: "caption", imageUrl: "https://example.com/image.jpg" }, "approval:1")).rejects.toBeInstanceOf(UncertainPublishError);
    expect(f).toHaveBeenCalledOnce();
  });

  it("uses granted TikTok scopes and POST video.list without filling absent metrics", async () => {
    const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      return new Response(JSON.stringify(String(input).includes("user/info")
        ? socialFixture("tikTokUser") : socialFixture("tikTokVideos")), { status: 200 });
    });
    const p = getProvider("tiktok", { status: "connected", token: "secret", login: "owner", scopes: ["user.info.basic", "user.info.stats", "video.list"], credentialGeneration: "generation" }, { fetch: f });
    expect(p.capabilities.analytics).toBe(true);
    const result = await p.sync?.();
    expect(result?.account?.followers).toBe(10);
    expect(result?.posts?.[0]?.metrics).toEqual({ views: 0 });
    expect(f.mock.calls[1]![0]).toContain("/v2/video/list/");
    expect((f.mock.calls[1]![1] as RequestInit).method).toBe("POST");
    expect(getProvider("tiktok", { status: "connected", token: "secret", scopes: ["user.info.basic"], credentialGeneration: "generation" }).capabilities.analytics).toBe(false);
    const statsOnly = getProvider("tiktok", { status: "connected", token: "secret", scopes: ["user.info.basic", "user.info.stats"], credentialGeneration: "generation" }, { fetch: f });
    f.mockClear();
    expect((await statsOnly.sync?.())?.posts).toBeUndefined();
    expect(f).toHaveBeenCalledOnce();
    const videosOnly = getProvider("tiktok", { status: "connected", token: "secret", scopes: ["user.info.basic", "video.list"], credentialGeneration: "generation" }, { fetch: f });
    f.mockClear();
    expect((await videosOnly.sync?.())?.account).toBeUndefined();
    expect((f.mock.calls[0]![1] as RequestInit).method).toBe("POST");
  });

  it("exports Portfolio markdown and maps auth errors to a fixed class", async () => {
    expect(portfolioMarkdown({ title: "Title", text: "Body", date: "2026-10-15", imageUrl: "https://example.com/a.jpg" })).toContain("Body");
    const f = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => { void args; return new Response(null, { status: 401 }); });
    const p = getProvider("linkedin", { status: "connected", token: "secret", login: "urn:li:person:1", credentialGeneration: "generation" }, { fetch: f });
    await expect(p.publish?.({ text: "hi" }, "approval:1")).rejects.toBeInstanceOf(ProviderAuthError);
  });

  it("builds a web authorization URL without PKCE and rejects missing OAuth state", async () => {
    const url = new URL(tikTokAuthUrl("client-key", "random-state", "https://lifeos.example"));
    expect(url.origin + url.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(url.searchParams.get("scope")).toBe("user.info.basic,user.info.stats,video.list");
    expect(url.searchParams.get("redirect_uri")).toBe("https://lifeos.example/api/connections/tiktok/callback");
    expect(url.searchParams.has("code_challenge")).toBe(false);
    expect(await completeTikTokOAuth({} as DB, { code: "code", state: "bad", cookie: null, base: "https://lifeos.example" })).toEqual({ ok: false, error: "state" });
  });

  it("stores both rotated TikTok tokens without rotating the approval generation", async () => {
    const key = Buffer.alloc(32, 7);
    const previous = { ciphertext: encrypt(JSON.stringify({ accessToken: "old-access", refreshToken: "old-refresh" }), key), credentialGeneration: "same-generation" };
    let updated: Record<string, unknown> = {};
    const h = {
      select: () => ({ from: () => ({ where: async () => [previous] }) }),
      update: () => ({ set: (value: Record<string, unknown>) => { updated = value; return { where: () => ({ returning: async () => [{ id: "tiktok" }] }) }; } }),
    } as unknown as DB;
    await refreshSocialToken(h, "tiktok", { accessToken: "new-access", refreshToken: "new-refresh", expiresAt: new Date("2026-10-16T00:00:00Z"), refreshExpiresAt: new Date("2027-10-16T00:00:00Z") }, key);
    expect(JSON.parse(decrypt(updated.ciphertext as string, key))).toMatchObject({ accessToken: "new-access", refreshToken: "new-refresh", refreshExpiresAt: "2027-10-16T00:00:00.000Z" });
    expect(updated.credentialGeneration).toBeUndefined();
    const changed = { ...h, update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }) } as unknown as DB;
    await expect(refreshSocialToken(changed, "tiktok", { accessToken: "late", expiresAt: new Date() }, key)).rejects.toThrow("Connection changed");
  });

  it("pages TikTok videos until the 90-day boundary", async () => {
    const f = vi.fn(async () => Response.json(f.mock.calls.length === 1
      ? { data: { videos: [{ id: "new", create_time: 1792000000, view_count: 4 }], has_more: true, cursor: 1 }, error: { code: "ok" } }
      : { data: { videos: [{ id: "old", create_time: 1000000000, view_count: 9 }], has_more: true, cursor: 2 }, error: { code: "ok" } }));
    const p = getProvider("tiktok", { status: "connected", token: "secret", scopes: ["user.info.basic", "video.list"], credentialGeneration: "generation" }, { fetch: f });
    expect((await p.sync?.(new Date("2026-10-01T00:00:00Z")))?.posts).toEqual([{ remoteId: "new", metrics: { views: 4 } }]);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("accepts only actually granted TikTok scopes from the token response", async () => {
    const key = Buffer.alloc(32, 8);
    const cookie = encrypt(JSON.stringify({ state: "state-1", at: "2026-10-15T00:00:00Z" }), key);
    const app = { ciphertext: encrypt(JSON.stringify({ clientKey: "key", clientSecret: "secret" }), key) };
    let saved: Record<string, unknown> | undefined;
    const h = {
      select: () => ({ from: () => ({ where: async () => [app] }) }),
      insert: (table: unknown) => ({ values: (value: Record<string, unknown>) => {
        if (table === connections) saved = value;
        return { onConflictDoUpdate: async () => undefined };
      } }),
    } as unknown as DB;
    const body = { access_token: "access", refresh_token: "refresh", open_id: "owner", expires_in: 86400, refresh_expires_in: 31536000, scope: "user.info.basic,video.list" };
    const f = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(init?.body)).not.toContain("code_verifier");
      return Response.json(body);
    });
    const p = { code: "code", state: "state-1", cookie, base: "https://lifeos.example", fetch: f, now: new Date("2026-10-15T00:01:00Z"), key };
    expect(await completeTikTokOAuth(h, p)).toEqual({ ok: true, scopes: ["user.info.basic", "video.list"] });
    expect(saved?.scopes).toEqual(["user.info.basic", "video.list"]);
    expect(JSON.parse(decrypt(saved?.ciphertext as string, key))).toMatchObject({ refreshToken: "refresh" });
    body.scope = "video.list";
    saved = undefined;
    expect(await completeTikTokOAuth(h, p)).toEqual({ ok: false, error: "scope" });
    expect(saved).toBeUndefined();
  });
});
