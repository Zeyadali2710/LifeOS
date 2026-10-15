import { eq } from "drizzle-orm";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decide, executeApproved, expireDue } from "@/server/agents/approvals";
import { callTool } from "@/server/agents/gateway";
import { cancelRun } from "@/server/agents/runs";
import { TOOLS } from "@/server/agents/tools";
import { approvedHash, saveDraft } from "@/server/agents/tools/socials";
import { decrypt } from "@/server/crypto";
import { activityEvents, agentRuns, approvals, auditLog, connections, notifications, socialAccountSnapshots, socialPosts, socialVariants } from "@/server/db/schema";
import { cancelSchedule, confirmInstagramSmoke, deletePost, requestPublish, reschedule, retryVariant, saveVariant, socialReviewFacts } from "@/server/socials-actions";
import { markSocialAuthError, removeSocialConnection, saveSocialToken, saveTikTokApp, saveTikTokTokens, socialConnectionStatus } from "@/server/socials/connections";
import { getProvider } from "@/server/socials/providers";
import { publishVariant, runScheduled } from "@/server/socials/publish";
import { syncSocials } from "@/server/socials/sync";
import { setupTestDb } from "./helpers";

const key = vi.hoisted(() => Buffer.alloc(32, 11).toString("base64"));
const enqueue = vi.hoisted(() => vi.fn(async () => undefined));
const cancelJob = vi.hoisted(() => vi.fn(async () => undefined));
const rescheduleJob = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/server/env", () => ({ env: () => ({ LIFEOS_MASTER_KEY: key }) }));
vi.mock("@/server/session", () => ({ requireOwner: async () => undefined }));
vi.mock("@/server/queue", async (orig) => ({ ...(await orig<object>()), enqueue, cancelSocialJob: cancelJob, rescheduleSocialJob: rescheduleJob }));
const t = setupTestDb();
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => t.handle() }));

const h = () => t.handle();
const image = "https://images.example.com/owner.jpg";
const json = (body: object, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });
const noNetwork = async () => { throw new Error("Unexpected provider call in a DB test"); };
async function waitForPostWaiters(observer: Client, count: number) {
  for (let i = 0; i < 200; i++) {
    const result = await observer.query<{ n: number }>("select count(*)::int n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%social_posts%for update%'");
    if (result.rows[0]!.n >= count) return;
  }
  throw new Error("Expected parent row lock waiters");
}
const variantRow = async (id: string) => (await h().select().from(socialVariants).where(eq(socialVariants.id, id)))[0]!;
const approvalRow = async (id: string) => (await h().select().from(approvals).where(eq(approvals.id, id)))[0]!;

async function variant(platform: "linkedin" | "instagram" | "tiktok", text = "Original text") {
  const [post] = await h().insert(socialPosts).values({ title: "Test post", body: text }).returning();
  const [row] = await h().insert(socialVariants).values({ postId: post!.id, platform, text, imageUrl: platform === "instagram" ? image : null }).returning();
  return row!;
}
async function pending(id: string, publishAt?: string) {
  const result = await requestPublish(id, publishAt);
  if (!result.ok || !("approvalId" in result)) throw new Error(`Publish request failed: ${JSON.stringify(result)}`);
  return result.approvalId;
}
async function approve(id: string, edited?: unknown, now = new Date()) {
  expect(await decide(h(), id, "approve", { edited, now: () => now, enqueue })).toMatchObject({ ok: true });
  return approvalRow(id);
}
async function connect(platform: "linkedin" | "instagram", f: typeof fetch) {
  expect(await saveSocialToken(h(), platform, "fixture_token_1234", { fetch: f })).toMatchObject({ ok: true });
}

beforeEach(async () => {
  enqueue.mockClear(); cancelJob.mockClear(); rescheduleJob.mockClear();
  vi.stubGlobal("fetch", noNetwork);
  for (const table of [socialPosts, agentRuns, socialAccountSnapshots, connections, activityEvents, notifications, auditLog]) await h().delete(table);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("approved Social publishing", () => {
  it.each(["delete", "request"])("serializes deletion against publication when %s locks first", async (first) => {
    const v = await variant("linkedin");
    const blocker = await t.pool().connect();
    const observer = new Client({ connectionString: t.url() });
    await observer.connect();
    let deleting: ReturnType<typeof deletePost> | undefined;
    let requesting: ReturnType<typeof requestPublish> | undefined;
    try {
      await blocker.query("begin");
      await blocker.query("select id from social_posts where id = $1 for update", [v.postId]);
      if (first === "delete") deleting = deletePost(v.postId); else requesting = requestPublish(v.id);
      await waitForPostWaiters(observer, 1);
      if (first === "delete") requesting = requestPublish(v.id); else deleting = deletePost(v.postId);
      await waitForPostWaiters(observer, 2);
      await blocker.query("commit");
      const [removed, requested] = await Promise.all([deleting!, requesting!]);
      expect([removed.ok, requested.ok]).toEqual(first === "delete" ? [true, false] : [false, true]);
      if (first === "request") expect(await variantRow(v.id)).toMatchObject({ status: "pending_approval" });
      else expect(await h().select().from(socialVariants).where(eq(socialVariants.id, v.id))).toEqual([]);
    } finally {
      await blocker.query("rollback"); blocker.release(); await observer.end();
      await Promise.allSettled([deleting, requesting]);
    }
  });

  it("rolls back agent post edits after a concurrent owner request wins the parent lock", async () => {
    const v = await variant("linkedin");
    const [run] = await h().insert(agentRuns).values({ agentId: "social", prompt: "draft", model: "fixture" }).returning();
    const blocker = await t.pool().connect(); const observer = new Client({ connectionString: t.url() }); await observer.connect();
    let requesting: ReturnType<typeof requestPublish> | undefined; let saving: Promise<unknown> | undefined;
    try {
      await blocker.query("begin"); await blocker.query("select id from social_posts where id = $1 for update", [v.postId]);
      requesting = requestPublish(v.id); await waitForPostWaiters(observer, 1);
      saving = saveDraft.handler({ postId: v.postId, title: "Overwrite", body: "Changed", variants: [{ platform: "linkedin", text: "Changed" }] },
        { handle: h(), runId: run!.id, agentId: "social", toolUseId: "save", now: () => new Date() }).catch((err: unknown) => err);
      await waitForPostWaiters(observer, 2); await blocker.query("commit");
      expect((await requesting).ok).toBe(true); expect(await saving).toBeInstanceOf(Error);
      expect((await h().select().from(socialPosts).where(eq(socialPosts.id, v.postId)))[0]!.title).toBe("Test post");
      expect(await variantRow(v.id)).toMatchObject({ status: "pending_approval", text: "Original text" });
    } finally {
      await blocker.query("rollback"); blocker.release(); await observer.end(); await Promise.allSettled([requesting, saving]);
    }
  });
  it.each([new Error("queue unavailable"), new DOMException("timed out", "TimeoutError")])("recovers durable approved enqueue failure: %s", async (failure) => {
    const v = await variant("linkedin");
    const id = await pending(v.id);
    await approve(id);
    enqueue.mockRejectedValueOnce(failure);
    expect(await executeApproved(h(), id)).toMatchObject({ status: "executed" });
    expect((await approvalRow(id)).status).toBe("executed");
    expect(await runScheduled(h(), new Date(Date.now() + 1000))).toBe(1);
    await publishVariant(v.id, id, h(), new Date(Date.now() + 1000));
    expect(await variantRow(v.id)).toMatchObject({ status: "published", isMock: true });
  });
  it.each([false, true])("actual cancelRun releases only its pending/unclaimed social variant (approved=%s)", async (approved) => {
    const v = await variant("linkedin");
    const id = await pending(v.id);
    if (approved) await approve(id);
    expect(await cancelRun(h(), (await approvalRow(id)).runId)).toBe(true);
    expect(await variantRow(v.id)).toMatchObject({ status: "draft", approvalId: null, approvedTextHash: null });
    expect((await approvalRow(id)).status).toBe("cancelled");
    const fresh = await pending(v.id);
    expect(fresh).not.toBe(id);
    await publishVariant(v.id, id, h());
    expect(await variantRow(v.id)).toMatchObject({ status: "pending_approval", approvalId: fresh });
  });
  it("uses a synthetic owner run, persists edited content and its hash, and publishes a mock once", async () => {
    const v = await variant("instagram");
    const id = await pending(v.id);
    const [run] = await h().select().from(agentRuns).where(eq(agentRuns.id, (await approvalRow(id)).runId));
    expect(run).toMatchObject({ agentId: "social", status: "waiting_approval" });
    expect(await variantRow(v.id)).toMatchObject({ status: "pending_approval", approvalId: id });
    const original = (await approvalRow(id)).originalPayload as Record<string, unknown>;
    const edited = { ...original, text: "Owner-approved text", imageUrl: "https://images.example.com/approved.jpg", linkUrl: "https://example.com/story" };
    await approve(id, edited);
    expect(await variantRow(v.id)).toMatchObject({ status: "scheduled", text: edited.text, imageUrl: edited.imageUrl, linkUrl: edited.linkUrl,
      approvedTextHash: approvedHash(edited as Parameters<typeof approvedHash>[0]), approvedProviderMode: "mock", approvedConnectionGeneration: null });
    expect(await executeApproved(h(), id)).toMatchObject({ status: "executed" });
    await publishVariant(v.id, id, h(), new Date(Date.now() + 1000));
    await publishVariant(v.id, id, h(), new Date(Date.now() + 2000));
    expect(await variantRow(v.id)).toMatchObject({ status: "published", isMock: true, remoteUrl: null });
    expect((await h().select().from(activityEvents).where(eq(activityEvents.type, "social.published")))).toHaveLength(1);
  });

  it("does not create approvals for unsupported owner or agent requests; a draft is not floored", async () => {
    const tikTok = await variant("tiktok");
    expect(await requestPublish(tikTok.id)).toEqual({ ok: false, error: "not_allowed" });
    const [run] = await h().insert(agentRuns).values({ agentId: "social", prompt: "draft", model: "fixture" }).returning();
    const ctx = { handle: h(), runId: run!.id, agentId: "social", tools: TOOLS };
    expect((await callTool(ctx, "socials.list_posts", {}, "read-1")).status).toBe("ok");
    expect((await callTool(ctx, "socials.save_draft", { title: "Draft", body: "Body", variants: [{ platform: "tiktok", text: "Caption" }] }, "draft-1")).status).toBe("ok");
    const ig = await variant("instagram", "Caption");
    const validate = vi.fn(async () => json({ user_id: "owner_1", username: "owner" })) as typeof fetch;
    await connect("instagram", validate); // verification_pending has no publish capability
    expect((await callTool(ctx, "socials.publish", { variantId: ig.id, platform: "instagram", text: ig.text, imageUrl: image }, "publish-1")).status).toBe("error");
    expect(await h().select().from(approvals)).toHaveLength(0);
  });

  it("rejects or expires only the matching pending variant", async () => {
    const first = await variant("linkedin");
    const second = await variant("linkedin", "Another post");
    const a = await pending(first.id);
    const b = await pending(second.id);
    expect(await decide(h(), a, "reject")).toEqual({ ok: true });
    expect(await variantRow(first.id)).toMatchObject({ status: "draft", approvalId: null });
    expect(await variantRow(second.id)).toMatchObject({ status: "pending_approval", approvalId: b });
    await h().update(approvals).set({ expiresAt: new Date(0) }).where(eq(approvals.id, b));
    expect(await expireDue(h(), new Date(), { enqueue })).toBe(1);
    expect(await variantRow(second.id)).toMatchObject({ status: "draft", approvalId: null });
  });

  it("carries recorded content reads through new and existing drafts into approval facts", async () => {
    const [run] = await h().insert(agentRuns).values({ agentId: "social", prompt: "draft", model: "fixture" }).returning();
    const ctx = { handle: h(), runId: run!.id, agentId: "social", tools: TOOLS };
    expect((await callTool(ctx, "socials.list_posts", {}, "read-source")).status).toBe("ok");
    const blank = await variant("linkedin");
    for (const postId of [undefined, blank.postId]) {
      const result = await callTool(ctx, "socials.save_draft", { postId, title: "From content", body: "Body", variants: [{ platform: "linkedin", text: "Caption" }] }, `save-${postId ?? "new"}`);
      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("save failed");
      const savedId = (result.output as { postId: string }).postId;
      const [v] = await h().select().from(socialVariants).where(eq(socialVariants.postId, savedId));
      const approval = await pending(v!.id);
      expect(await socialReviewFacts(approval)).toMatchObject({ draftedFromContent: true });
    }
  });

  it("reschedules time only, then cancels and voids an old queued approval", async () => {
    const v = await variant("linkedin");
    const first = new Date(Date.now() + 3_600_000);
    const second = new Date(Date.now() + 7_200_000);
    const id = await pending(v.id, first.toISOString());
    await approve(id);
    expect(await executeApproved(h(), id)).toMatchObject({ status: "executed" });
    expect(await reschedule(v.id, second.toISOString())).toEqual({ ok: true });
    expect(await variantRow(v.id)).toMatchObject({ status: "scheduled", scheduledAt: second, approvalId: id });
    expect(rescheduleJob).toHaveBeenCalledWith(v.id, id, second);
    expect(await cancelSchedule(v.id)).toEqual({ ok: true });
    expect(await variantRow(v.id)).toMatchObject({ status: "draft", approvalId: null, approvedTextHash: null });
    expect((await approvalRow(id)).status).toBe("cancelled");
    await publishVariant(v.id, id, h(), new Date(second.getTime() + 1000));
    expect((await variantRow(v.id)).status).toBe("draft");
    expect(cancelJob).toHaveBeenCalledWith(v.id);
  });

  it("leaves a future schedule alone until its approved time", async () => {
    const v = await variant("linkedin");
    const at = new Date(Date.now() + 3_600_000);
    const id = await pending(v.id, at.toISOString());
    await approve(id);
    await publishVariant(v.id, id, h(), new Date(at.getTime() - 1000));
    expect(await variantRow(v.id)).toMatchObject({ status: "scheduled", remoteId: null });
    await publishVariant(v.id, id, h(), at);
    expect(await variantRow(v.id)).toMatchObject({ status: "published", isMock: true });
  });

  it("fails closed when a mock approval becomes real or the real credential is replaced", async () => {
    const f = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/v2/userinfo")) return json({ sub: "owner_1" });
      throw new Error("Unexpected publish request");
    }) as typeof fetch;
    vi.stubGlobal("fetch", f);
    const mock = await variant("linkedin");
    const mockApproval = await pending(mock.id);
    await approve(mockApproval);
    await connect("linkedin", f);
    await publishVariant(mock.id, mockApproval, h(), new Date(Date.now() + 1000));
    expect(await variantRow(mock.id)).toMatchObject({ status: "failed", remoteId: null });
    const real = await variant("linkedin", "Real-bound text");
    const realApproval = await pending(real.id);
    await approve(realApproval);
    const generation = (await h().select().from(connections).where(eq(connections.id, "linkedin")))[0]!.credentialGeneration;
    await connect("linkedin", f);
    expect((await h().select().from(connections).where(eq(connections.id, "linkedin")))[0]!.credentialGeneration).not.toBe(generation);
    await publishVariant(real.id, realApproval, h(), new Date(Date.now() + 1000));
    expect(await variantRow(real.id)).toMatchObject({ status: "failed", remoteId: null });
    expect(f).toHaveBeenCalledTimes(2); // validation only; no LinkedIn POST
    await markSocialAuthError(h(), "linkedin", { credentialGeneration: (await socialConnectionStatus(h())).linkedin!.credentialGeneration });
    expect(await requestPublish((await variant("linkedin", "Unavailable")).id)).toEqual({ ok: false, error: "not_allowed" });
  });

  it("does not approve a pending request after the connection loses publish capability", async () => {
    const f = vi.fn(async () => json({ sub: "owner_1" })) as typeof fetch;
    await connect("linkedin", f);
    const v = await variant("linkedin");
    const id = await pending(v.id);
    await markSocialAuthError(h(), "linkedin", { credentialGeneration: (await socialConnectionStatus(h())).linkedin!.credentialGeneration });
    expect(await decide(h(), id, "approve", { enqueue })).toMatchObject({ ok: false, reason: "invalid" });
    expect((await approvalRow(id)).status).toBe("pending");
    expect(await variantRow(v.id)).toMatchObject({ status: "pending_approval", remoteId: null });
  });
});

describe("connection, retry and analytics contracts", () => {
  it("publishes newly approved Instagram content through a fresh container after a terminal attempt", async () => {
    const created: URLSearchParams[] = []; const published: string[] = [];
    const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("fields=user_id,username")) return json({ user_id: "owner" });
      if (url.endsWith("/media") && init?.method === "POST") { created.push(new URLSearchParams(String(init.body))); return json({ id: `container-${created.length}` }); }
      if (url.includes("fields=status_code")) return json({ status_code: url.includes("container-1?") ? "ERROR" : "FINISHED" });
      if (url.endsWith("/media_publish")) { published.push(String(init?.body)); return json({ id: "new-remote" }); }
      throw new Error("Unexpected fake request");
    }) as typeof fetch;
    vi.stubGlobal("fetch", f);
    await connect("instagram", f);
    expect(await confirmInstagramSmoke((await socialConnectionStatus(h())).instagram!.credentialGeneration!)).toEqual({ ok: true });
    const v = await variant("instagram", "Old caption"); const first = await pending(v.id); await approve(first);
    await publishVariant(v.id, first, h());
    await publishVariant(v.id, first, h(), new Date(Date.now() + 3 * 60_000));
    expect(await variantRow(v.id)).toMatchObject({ status: "failed", containerId: "container-1" });
    expect(await saveVariant({ id: v.id, text: "New draft", imageUrl: image })).toMatchObject({ ok: true });
    expect(await variantRow(v.id)).toMatchObject({ containerId: null, remoteId: null, approvalId: null });
    const second = await pending(v.id);
    const original = (await approvalRow(second)).originalPayload as Record<string, unknown>;
    await approve(second, { ...original, text: "New approved caption", imageUrl: "https://images.example.com/new.jpg" });
    await publishVariant(v.id, second, h());
    await publishVariant(v.id, second, h(), new Date(Date.now() + 3 * 60_000));
    expect(created.map((body) => [body.get("caption"), body.get("image_url")])).toEqual([["Old caption", image], ["New approved caption", "https://images.example.com/new.jpg"]]);
    expect(published).toEqual(["creation_id=container-2"]);
    expect(await variantRow(v.id)).toMatchObject({ status: "published", remoteId: "new-remote" });
  });

  it("reconciles a stored remote ID without creating a new approval", async () => {
    const v = await variant("instagram"); const id = await pending(v.id); await approve(id);
    await h().update(socialVariants).set({ status: "failed", remoteId: "old-remote" }).where(eq(socialVariants.id, v.id));
    const failed = await variantRow(v.id);
    expect(await saveVariant({ id: v.id, text: "Different content", imageUrl: image })).toEqual({ ok: false, error: "not_allowed" });
    expect(await retryVariant(v.id, failed.updatedAt.toISOString(), false)).toEqual({ ok: true, published: true });
    expect(await variantRow(v.id)).toMatchObject({ status: "published", approvalId: id, remoteId: "old-remote", text: v.text });
    expect(await requestPublish(v.id)).toEqual({ ok: false, error: "not_allowed" });
  });
  it("starts account B history fresh while preserving a token replacement for account A", async () => {
    const tokens = { accessToken: "access", refreshToken: "refresh", openId: "A", scopes: ["user.info.basic", "user.info.stats"], expiresAt: new Date("2030-01-01"), refreshExpiresAt: new Date("2031-01-01") };
    await saveTikTokTokens(h(), tokens);
    await h().insert(socialAccountSnapshots).values({ platform: "tiktok", date: "2026-10-14", followers: 100 });
    await saveTikTokTokens(h(), { ...tokens, accessToken: "rotated" });
    expect(await h().select().from(socialAccountSnapshots)).toHaveLength(1);
    await saveTikTokTokens(h(), { ...tokens, openId: "B" });
    expect(await h().select().from(socialAccountSnapshots)).toEqual([]);
    await syncSocials(h(), new Date("2026-10-15T02:00:00Z"), async () => json({ error: { code: "ok" }, data: { user: { follower_count: 7 } } }));
    expect(await h().select().from(socialAccountSnapshots)).toMatchObject([{ followers: 7, date: "2026-10-15" }]);
    await removeSocialConnection(h(), "tiktok");
    expect(await h().select().from(socialAccountSnapshots)).toEqual([]);
  });
  it.each([200, 401])("ignores a deferred refresh response after account replacement (%s)", async (status) => {
    const now = new Date("2026-10-15T02:00:00Z");
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    await saveTikTokApp(h(), "key", "secret");
    const tokens = { accessToken: "A", refreshToken: "refresh-A", openId: "A", scopes: ["user.info.basic", "user.info.stats"], expiresAt: new Date("2026-10-15T03:00:00Z"), refreshExpiresAt: new Date("2030-01-01") };
    await saveTikTokTokens(h(), tokens);
    let signal!: () => void; const started = new Promise<void>((r) => { signal = r; });
    let finish!: (value: Response) => void; const response = new Promise<Response>((r) => { finish = r; });
    const f = vi.fn(async () => { signal(); return response; }) as typeof fetch;
    const syncing = syncSocials(h(), now, f);
    await started;
    await saveTikTokTokens(h(), { ...tokens, openId: "B", accessToken: "replacement-B" });
    const [replacement] = await h().select().from(connections).where(eq(connections.id, "tiktok"));
    finish(status === 401 ? json({}, status) : json({ access_token: "late-A", refresh_token: "late-refresh-A", open_id: "A", scope: "user.info.basic,user.info.stats", expires_in: 86400, refresh_expires_in: 31536000 }));
    await syncing;
    const [after] = await h().select().from(connections).where(eq(connections.id, "tiktok"));
    expect(after).toMatchObject({ ciphertext: replacement!.ciphertext, credentialGeneration: replacement!.credentialGeneration, login: "B", status: "connected", lastSyncError: null });
    expect(await h().select().from(socialAccountSnapshots)).toHaveLength(0);
  });
  it("disconnects the dependent TikTok account when removing app credentials", async () => {
    await saveTikTokApp(h(), "fixture_key", "fixture_secret");
    await saveTikTokTokens(h(), { accessToken: "access", refreshToken: "refresh", openId: "owner", scopes: ["user.info.basic", "user.info.stats"], expiresAt: new Date("2030-01-01"), refreshExpiresAt: new Date("2031-01-01") });
    await removeSocialConnection(h(), "tiktok_app");
    const status = await socialConnectionStatus(h());
    expect(status.tiktok).toBeNull(); expect(status.tiktok_app).toBeNull();
    expect(getProvider("tiktok", null).isMock).toBe(true);
    const f = vi.fn(noNetwork);
    await syncSocials(h(), new Date(), f);
    expect(f).not.toHaveBeenCalled();
  });
  it("requires owner confirmation for Instagram and resets it on token replacement or 401", async () => {
    const f = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("https://graph.instagram.com/me?fields=user_id")) return json({ user_id: "owner_1", username: "owner" });
      return json({}, 401);
    }) as typeof fetch;
    vi.stubGlobal("fetch", f);
    await connect("instagram", f);
    expect((await socialConnectionStatus(h())).instagram?.status).toBe("verification_pending");
    const oldGeneration = (await socialConnectionStatus(h())).instagram!.credentialGeneration!;
    expect(await confirmInstagramSmoke(oldGeneration)).toEqual({ ok: true });
    expect((await socialConnectionStatus(h())).instagram?.status).toBe("connected");
    await connect("instagram", f);
    expect((await socialConnectionStatus(h())).instagram?.status).toBe("verification_pending");
    expect(await confirmInstagramSmoke(oldGeneration)).toEqual({ ok: false, error: "not_allowed" });
    expect(await confirmInstagramSmoke((await socialConnectionStatus(h())).instagram!.credentialGeneration!)).toEqual({ ok: true });
    await syncSocials(h(), new Date(), f);
    expect((await socialConnectionStatus(h())).instagram?.status).toBe("error");
    expect((await h().select().from(connections).where(eq(connections.id, "instagram")))[0]!.lastError).toBe("RECONNECT");
  });

  it("adopts one Instagram container and stops for owner review when media matching is inconclusive", async () => {
    let matches: object[] = [{ id: "media_1", caption: "Caption" }];
    const calls: string[] = [];
    const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
      if (url.includes("fields=user_id,username")) return json({ user_id: "owner_1" });
      if (url.endsWith("/media") && init?.method === "POST") return json({ id: "container_1" });
      if (url.includes("fields=status_code")) return json({ status_code: "PUBLISHED" });
      if (url.includes("/me/media")) return json({ data: matches });
      throw new Error(`Unexpected fake call: ${url}`);
    }) as typeof fetch;
    vi.stubGlobal("fetch", f);
    await connect("instagram", f);
    expect(await confirmInstagramSmoke((await socialConnectionStatus(h())).instagram!.credentialGeneration!)).toEqual({ ok: true });
    const v = await variant("instagram", "Caption");
    const id = await pending(v.id);
    await approve(id);
    await publishVariant(v.id, id, h(), new Date());
    expect(await variantRow(v.id)).toMatchObject({ status: "publishing", containerId: "container_1", remoteId: null });
    const later = new Date(Date.now() + 3 * 60_000);
    await publishVariant(v.id, id, h(), later);
    expect(await variantRow(v.id)).toMatchObject({ status: "published", remoteId: "media_1", containerId: "container_1" });
    expect(calls.filter((x) => x === "POST /owner_1/media")).toHaveLength(1);
    expect(calls.some((x) => x.includes("media_publish"))).toBe(false);

    const ambiguous = await variant("instagram", "Caption");
    const ambiguousId = await pending(ambiguous.id);
    await approve(ambiguousId);
    await publishVariant(ambiguous.id, ambiguousId, h(), new Date());
    matches = [{ id: "media_1", caption: "Caption" }, { id: "media_2", caption: "Caption" }];
    await publishVariant(ambiguous.id, ambiguousId, h(), later);
    expect(await variantRow(ambiguous.id)).toMatchObject({ status: "failed", remoteId: null });
    expect(calls.filter((x) => x === "POST /owner_1/media")).toHaveLength(2);
  });

  it("never reposts an ambiguous LinkedIn request", async () => {
    let posts = 0;
    const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/v2/userinfo")) return json({ sub: "owner_1" });
      if (String(input).endsWith("/rest/posts") && init?.method === "POST") { posts++; throw new TypeError("network ambiguity"); }
      throw new Error("Unexpected fake call");
    }) as typeof fetch;
    vi.stubGlobal("fetch", f);
    await connect("linkedin", f);
    const v = await variant("linkedin");
    const id = await pending(v.id);
    await approve(id);
    await publishVariant(v.id, id, h(), new Date());
    await publishVariant(v.id, id, h(), new Date(Date.now() + 3 * 60_000));
    expect(posts).toBe(1);
    expect(await variantRow(v.id)).toMatchObject({ status: "failed", remoteId: null, lastError: expect.stringContaining("may have posted") });
  });

  it("upserts today's real snapshot, respects partial TikTok grants, and rotates tokens without changing the binding", async () => {
    const now = new Date("2026-10-15T02:00:00Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    await saveTikTokApp(h(), "fixture_key", "fixture_secret");
    await saveTikTokTokens(h(), { accessToken: "fixture_access_1", refreshToken: "fixture_refresh_1", refreshExpiresAt: new Date("2027-10-15T00:00:00Z"),
      openId: "owner_1", scopes: ["user.info.basic", "user.info.stats"], expiresAt: new Date("2026-10-15T03:00:00Z") });
    const generation = (await h().select().from(connections).where(eq(connections.id, "tiktok")))[0]!.credentialGeneration;
    const calls: string[] = [];
    let followers = 12;
    const f = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/v2/oauth/token/")) return json({ access_token: "fixture_access_2", refresh_token: "fixture_refresh_2", open_id: "owner_1",
        scope: "user.info.basic,user.info.stats", expires_in: 86_400, refresh_expires_in: 365 * 86_400 });
      if (url.includes("/v2/user/info/")) return json({ error: { code: "ok" }, data: { user: { follower_count: followers, video_count: 3 } } });
      throw new Error("Unexpected TikTok fake call");
    }) as typeof fetch;
    await syncSocials(h(), now, f);
    const row = (await h().select().from(connections).where(eq(connections.id, "tiktok")))[0]!;
    expect(row.credentialGeneration).toBe(generation);
    expect(JSON.parse(decrypt(row.ciphertext))).toMatchObject({ accessToken: "fixture_access_2", refreshToken: "fixture_refresh_2" });
    followers = 13;
    await syncSocials(h(), now, f);
    expect(await h().select().from(socialAccountSnapshots)).toMatchObject([{ platform: "tiktok", followers: 13, posts: 3 }]);
    expect(calls.filter((url) => url.includes("/v2/video/list/"))).toHaveLength(0);
  });

  it("marks TikTok RECONNECT on an analytics 401 without inventing a snapshot", async () => {
    await saveTikTokTokens(h(), { accessToken: "fixture_access", refreshToken: "fixture_refresh", refreshExpiresAt: new Date("2027-10-15T00:00:00Z"),
      openId: "owner_1", scopes: ["user.info.basic", "user.info.stats"], expiresAt: new Date("2027-10-15T00:00:00Z") });
    const f = vi.fn(async () => json({}, 401)) as typeof fetch;
    await syncSocials(h(), new Date("2026-10-15T02:00:00Z"), f);
    expect((await socialConnectionStatus(h())).tiktok?.status).toBe("error");
    expect((await h().select().from(connections).where(eq(connections.id, "tiktok")))[0]!.lastSyncError).toBe("RECONNECT");
    expect(await h().select().from(socialAccountSnapshots)).toHaveLength(0);
  });
});
