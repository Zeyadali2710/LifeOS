"use server";

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { PLATFORMS, checkVariant } from "@/lib/social-types";
import { db } from "./db/client";
import { agentRuns, approvals, auditLog, socialPosts, socialVariants } from "./db/schema";
import { callTool } from "./agents/gateway";
import { MODELS } from "./agents/registry";
import { TOOLS } from "./agents/tools";
import { currentBinding } from "./agents/tools/socials";
import { log } from "./log";
import { cancelSocialJob, enqueue, QUEUES, rescheduleSocialJob } from "./queue";
import { requireOwner } from "./session";
import { removeSocialConnection, saveSocialToken, saveTikTokApp, verifyInstagramConnection } from "./socials/connections";
import { buildStarter } from "./socials/queries";

const uuid = z.uuid();
const platform = z.enum(PLATFORMS);
const postInput = z.object({ title: z.string().trim().min(1).max(200), body: z.string().max(10_000).default(""), sourceKind: z.enum(["project", "outreach_event", "repo"]).optional(), sourceId: z.string().max(100).optional() });
const variantInput = z.object({ id: uuid, text: z.string().max(10_000), imageUrl: z.url().max(2000).nullable().optional(), linkUrl: z.url().max(2000).nullable().optional() });
const invalid = { ok: false, error: "invalid" } as const;
const denied = { ok: false, error: "not_allowed" } as const;
const missing = { ok: false, error: "not_found" } as const;

async function run<T>(fn: () => Promise<T>): Promise<T | { ok: false; error: "failed" }> {
  try { return await fn(); }
  catch { log.error("social action failed"); return { ok: false, error: "failed" }; }
}
const aud = (action: string, target: string, metadata: Record<string, unknown> = {}) => db().insert(auditLog).values({ actor: "owner", action, target, metadata });

export async function createPost(raw: unknown) {
  await requireOwner();
  const p = postInput.safeParse(raw);
  if (!p.success || Boolean(p.data.sourceKind) !== Boolean(p.data.sourceId)) return invalid;
  return run(async () => {
    const source = p.data.sourceKind ? await buildStarter(db(), p.data.sourceKind, p.data.sourceId!) : null;
    if (p.data.sourceKind && !source) return missing;
    const [row] = await db().insert(socialPosts).values({ ...p.data, sourceKind: p.data.sourceKind ?? null, sourceId: p.data.sourceId ?? null,
      title: p.data.title, body: p.data.body || source?.body || "", draftedFromContent: !!source }).returning({ id: socialPosts.id });
    await aud("social.post.create", row!.id);
    return { ok: true, id: row!.id } as const;
  });
}

export async function savePost(raw: unknown) {
  await requireOwner();
  const p = postInput.extend({ id: uuid }).safeParse(raw);
  if (!p.success) return invalid;
  return run(async () => {
    const [row] = await db().update(socialPosts).set({ title: p.data.title, body: p.data.body, updatedAt: new Date() }).where(eq(socialPosts.id, p.data.id)).returning({ id: socialPosts.id });
    if (!row) return missing;
    await aud("social.post.save", row.id);
    return { ok: true } as const;
  });
}

export async function togglePlatform(postId: string, target: string, enabled: boolean) {
  await requireOwner();
  const p = z.object({ postId: uuid, target: platform, enabled: z.boolean() }).safeParse({ postId, target, enabled });
  if (!p.success) return invalid;
  return run(async () => {
    const h = db();
    if (enabled) {
      const [post] = await h.select().from(socialPosts).where(eq(socialPosts.id, p.data.postId));
      if (!post) return missing;
      await h.insert(socialVariants).values({ postId, platform: target, text: post.body }).onConflictDoNothing();
    } else {
      const [row] = await h.delete(socialVariants).where(and(eq(socialVariants.postId, postId), eq(socialVariants.platform, target), inArray(socialVariants.status, ["draft", "failed", "posted_manually"]))).returning({ id: socialVariants.id });
      if (!row) return denied;
    }
    await aud("social.platform.toggle", postId, { platform: target, enabled });
    return { ok: true } as const;
  });
}

export async function saveVariant(raw: unknown) {
  await requireOwner();
  const p = variantInput.safeParse(raw);
  if (!p.success) return invalid;
  return run(async () => {
    const [row] = await db().update(socialVariants).set({ text: p.data.text, imageUrl: p.data.imageUrl ?? null, linkUrl: p.data.linkUrl ?? null,
      status: "draft", approvalId: null, scheduledAt: null, approvedTextHash: null, approvedProviderMode: null, approvedConnectionGeneration: null, updatedAt: new Date() })
      .where(and(eq(socialVariants.id, p.data.id), inArray(socialVariants.status, ["draft", "failed"]))).returning({ id: socialVariants.id });
    if (!row) return denied;
    await aud("social.variant.save", row.id);
    const [variant] = await db().select({ platform: socialVariants.platform }).from(socialVariants).where(eq(socialVariants.id, row.id));
    return { ok: true, checks: checkVariant(variant!.platform as typeof PLATFORMS[number], p.data) } as const;
  });
}

export async function moveStage(id: string, stage: "idea" | "draft") {
  await requireOwner();
  const p = z.object({ id: uuid, stage: z.enum(["idea", "draft"]) }).safeParse({ id, stage });
  if (!p.success) return invalid;
  return run(async () => {
    const [row] = await db().update(socialPosts).set({ stage, updatedAt: new Date() }).where(eq(socialPosts.id, id)).returning({ id: socialPosts.id });
    if (!row) return missing;
    await aud("social.post.stage", id, { stage });
    return { ok: true } as const;
  });
}

export async function deletePost(id: string) {
  await requireOwner();
  if (!uuid.safeParse(id).success) return invalid;
  return run(async () => {
    const h = db();
    const [blocked] = await h.select({ id: socialVariants.id }).from(socialVariants).where(and(eq(socialVariants.postId, id), inArray(socialVariants.status, ["pending_approval", "scheduled", "publishing"])));
    if (blocked) return denied;
    const [row] = await h.delete(socialPosts).where(eq(socialPosts.id, id)).returning({ id: socialPosts.id });
    if (!row) return missing;
    await aud("social.post.delete", id);
    return { ok: true } as const;
  });
}

export async function markPosted(id: string, remoteUrl?: string) {
  await requireOwner();
  const p = z.object({ id: uuid, remoteUrl: z.url().max(2000).optional() }).safeParse({ id, remoteUrl });
  if (!p.success) return invalid;
  return run(async () => {
    const [v] = await db().select().from(socialVariants).where(eq(socialVariants.id, id));
    if (!v || !["tiktok", "portfolio"].includes(v.platform) || !["draft", "failed"].includes(v.status)) return denied;
    const host = v.platform === "tiktok" ? "tiktok.com" : null;
    const url = remoteUrl ? new URL(remoteUrl) : null;
    if (url && (url.protocol !== "https:" || !!url.username || !!url.password || (host && url.hostname !== host && !url.hostname.endsWith(`.${host}`)))) return invalid;
    const videoId = v.platform === "tiktok" && url ? url.pathname.match(/\/video\/(\d+)/)?.[1] : null;
    if (v.platform === "tiktok" && url && !videoId) return invalid;
    const [posted] = await db().update(socialVariants).set({ status: "posted_manually", remoteUrl: remoteUrl ?? null, remoteId: videoId, publishedAt: new Date(), isMock: false, updatedAt: new Date() })
      .where(and(eq(socialVariants.id, id), inArray(socialVariants.status, ["draft", "failed"]))).returning({ id: socialVariants.id });
    if (!posted) return denied;
    await aud("social.variant.mark_posted", id, { platform: v.platform });
    return { ok: true } as const;
  });
}

export async function cancelSchedule(id: string) {
  await requireOwner();
  if (!uuid.safeParse(id).success) return invalid;
  return run(async () => {
    const row = await db().transaction(async (tx) => {
      const [current] = await tx.select({ approvalId: socialVariants.approvalId }).from(socialVariants).where(and(eq(socialVariants.id, id), eq(socialVariants.status, "scheduled")));
      if (!current) return null;
      const [won] = await tx.update(socialVariants).set({ status: "draft", scheduledAt: null, approvalId: null, approvedTextHash: null, approvedProviderMode: null, approvedConnectionGeneration: null, updatedAt: new Date() })
        .where(and(eq(socialVariants.id, id), eq(socialVariants.status, "scheduled"))).returning({ id: socialVariants.id });
      if (!won) return null;
      if (current.approvalId) await tx.update(approvals).set({ status: "cancelled" }).where(eq(approvals.id, current.approvalId));
      return won;
    });
    if (!row) return denied;
    await cancelSocialJob(id).catch((err) => log.error({ err }, "social job cancel failed"));
    await aud("social.variant.cancel_schedule", id);
    return { ok: true } as const;
  });
}

export async function reschedule(id: string, at: string) {
  await requireOwner();
  const p = z.object({ id: uuid, at: z.iso.datetime({ offset: true }) }).safeParse({ id, at });
  if (!p.success) return invalid;
  return run(async () => {
    const [row] = await db().update(socialVariants).set({ scheduledAt: new Date(at), updatedAt: new Date() })
      .where(and(eq(socialVariants.id, id), eq(socialVariants.status, "scheduled"), isNotNull(socialVariants.approvedTextHash))).returning({ id: socialVariants.id });
    if (!row) return denied;
    await rescheduleSocialJob(id, new Date(at));
    await aud("social.variant.reschedule", id);
    return { ok: true } as const;
  });
}

export async function syncNow() {
  await requireOwner();
  return run(async () => { await enqueue(QUEUES.socialsSync, {}, { singletonKey: "socials.sync" }); await aud("social.sync", "all"); return { ok: true } as const; });
}

export async function saveToken(target: "linkedin" | "instagram", token: string) {
  await requireOwner();
  if (!z.enum(["linkedin", "instagram"]).safeParse(target).success) return invalid;
  return run(() => saveSocialToken(db(), target, token));
}
export async function saveTikTokCredentials(key: string, secret: string) {
  await requireOwner();
  return run(async () => ({ ok: await saveTikTokApp(db(), key, secret) }));
}
export async function disconnect(target: "linkedin" | "instagram" | "tiktok" | "tiktok_app") {
  await requireOwner();
  if (!z.enum(["linkedin", "instagram", "tiktok", "tiktok_app"]).safeParse(target).success) return invalid;
  return run(async () => { await removeSocialConnection(db(), target); return { ok: true } as const; });
}
export async function confirmInstagramSmoke() {
  await requireOwner();
  return run(async () => {
    const { socialConnectionStatus } = await import("./socials/connections");
    const status = (await socialConnectionStatus(db())).instagram;
    if (status?.status !== "verification_pending") return denied;
    await verifyInstagramConnection(db());
    return { ok: true } as const;
  });
}

export async function requestPublish(variantId: string, publishAt?: string | null) {
  await requireOwner();
  const p = z.object({ variantId: uuid, publishAt: z.iso.datetime({ offset: true }).nullable().optional() }).safeParse({ variantId, publishAt });
  if (!p.success) return invalid;
  return run(async () => {
    const h = db();
    const [v] = await h.select().from(socialVariants).where(eq(socialVariants.id, variantId));
    if (!v || v.status !== "draft" || !["linkedin", "instagram"].includes(v.platform)) return denied;
    const target = v.platform as "linkedin" | "instagram";
    if (checkVariant(target, v).errors.length) return invalid;
    const { provider } = await currentBinding(h, target);
    if (!provider.capabilities.publish) return denied;
    const [runRow] = await h.insert(agentRuns).values({ agentId: "social", prompt: `owner publish request ${variantId}`, model: MODELS.sonnet, status: "running", startedAt: new Date() })
      .returning({ id: agentRuns.id });
    const result = await callTool({ handle: h, runId: runRow!.id, agentId: "social", tools: TOOLS }, "socials.publish",
      { variantId, platform: target, text: v.text, imageUrl: v.imageUrl, linkUrl: v.linkUrl, publishAt: publishAt ?? null }, `owner:${variantId}`);
    if (result.status === "waiting_approval") {
      await h.update(agentRuns).set({ status: "waiting_approval" }).where(eq(agentRuns.id, runRow!.id));
      await aud("social.publish.request", variantId, { approvalId: result.approvalId });
      return { ok: true, approvalId: result.approvalId } as const;
    }
    await h.update(agentRuns).set({ status: "failed", error: "Publish approval could not be prepared.", endedAt: new Date() }).where(eq(agentRuns.id, runRow!.id));
    return denied;
  });
}
