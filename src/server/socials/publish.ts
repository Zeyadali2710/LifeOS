import { and, eq, inArray, isNotNull, lte, lt, or } from "drizzle-orm";
import { socialPublishPayload } from "@/lib/approval-kinds";
import { checkVariant, type SocialPlatform } from "@/lib/social-types";
import { approvedHash, currentBinding } from "../agents/tools/socials";
import { db, type DB } from "../db/client";
import { approvals, socialVariants } from "../db/schema";
import { emitActivity } from "../events";
import { log } from "../log";
import { enqueue, QUEUES, type Enqueue } from "../queue";
import { markSocialAuthError } from "./connections";
import { ProviderAuthError, UncertainPublishError, type PublishResult, type SocialProvider } from "./providers";

type Variant = typeof socialVariants.$inferSelect;
type Bound = Pick<SocialProvider, "platform" | "isMock" | "credentialGeneration" | "capabilities">;
type Approval = { id: string; status: string; payload: unknown } | null;
export type PublishDecision = "claim" | "adopt" | "review" | "fail" | "noop";
const PUBLISH_STALE_MS = 2 * 60_000;

export function inspectPublish(v: Pick<Variant, "id" | "platform" | "status" | "approvalId" | "text" | "imageUrl" | "linkUrl" | "approvedTextHash" | "approvedProviderMode" | "approvedConnectionGeneration" | "remoteId" | "containerId" | "scheduledAt" | "updatedAt">,
  approval: Approval, provider: Bound, now: Date): PublishDecision {
  if (!approval || v.approvalId !== approval.id || !["scheduled", "publishing"].includes(v.status) || !["approved", "executed"].includes(approval.status)) return "noop";
  const parsed = socialPublishPayload.safeParse(approval.payload);
  if (!parsed.success) return "fail";
  const p = parsed.data;
  if (p.variantId !== v.id || p.platform !== v.platform || p.text !== v.text || p.imageUrl !== v.imageUrl || p.linkUrl !== v.linkUrl ||
      approvedHash(p) !== v.approvedTextHash || approvedHash({ platform: p.platform, text: v.text, imageUrl: v.imageUrl, linkUrl: v.linkUrl }) !== v.approvedTextHash ||
      p.providerMode !== v.approvedProviderMode || p.connectionGeneration !== v.approvedConnectionGeneration ||
      provider.platform !== v.platform || (provider.isMock ? "mock" : "real") !== p.providerMode ||
      provider.credentialGeneration !== p.connectionGeneration || !provider.capabilities.publish ||
      checkVariant(p.platform, v).errors.length) return "fail";
  if (v.status === "scheduled") return !v.scheduledAt ? "fail" : v.scheduledAt > now ? "noop" : "claim";
  if (v.remoteId) return "adopt";
  if (now.getTime() - v.updatedAt.getTime() < PUBLISH_STALE_MS) return "noop";
  if (provider.isMock || (v.platform === "instagram" && v.containerId)) return "adopt";
  return "review";
}

const STALE = "Connection or approved content changed. Request a new approval.";
const LINKEDIN_REVIEW = "LinkedIn may have posted this. Check your profile, then Mark as posted or Retry.";
const INSTAGRAM_REVIEW = "Instagram may have posted this. Check Instagram before retrying.";
export async function queueContainerContinuation(variantId: string, approvalId: string, persistedAt: Date, send: Enqueue = enqueue): Promise<void> {
  await send(QUEUES.socialsPublish, { variantId, approvalId }, { startAfter: new Date(persistedAt.getTime() + PUBLISH_STALE_MS + 5_000) });
}

async function fail(h: DB, v: Variant, message: string, reconnect = false): Promise<void> {
  const [won] = await h.update(socialVariants).set({ status: "failed", lastError: message, updatedAt: new Date() })
    .where(and(eq(socialVariants.id, v.id), eq(socialVariants.approvalId, v.approvalId!), inArray(socialVariants.status, ["scheduled", "publishing"])))
    .returning({ id: socialVariants.id });
  if (!won) return;
  if (reconnect && (v.platform === "linkedin" || v.platform === "instagram")) await markSocialAuthError(h, v.platform);
  await emitActivity({ type: "social.publish_failed", source: "social", title: "Social post needs attention", detail: message, tone: "amber", payload: { variantId: v.id } },
    { category: "IMPORTANT", title: "Social post needs attention", body: message, actionUrl: "/socials" }, h);
}

export async function publishVariant(variantId: string, approvalId: string, h: DB = db(), now = new Date()): Promise<void> {
  const [v] = await h.select().from(socialVariants).where(eq(socialVariants.id, variantId));
  if (!v || v.approvalId !== approvalId || !["scheduled", "publishing"].includes(v.status)) return;
  const [a] = await h.select().from(approvals).where(eq(approvals.id, approvalId));
  let provider: SocialProvider;
  try { provider = (await currentBinding(h, v.platform as SocialPlatform)).provider; }
  catch { await fail(h, v, STALE); return; }
  const choice = inspectPublish(v, a ? { id: a.id, status: a.status, payload: a.editedPayload ?? a.originalPayload } : null, provider, now);
  if (choice === "noop") return;
  if (choice === "fail") { await fail(h, v, STALE); return; }
  if (choice === "review") { await fail(h, v, v.platform === "linkedin" ? LINKEDIN_REVIEW : INSTAGRAM_REVIEW); return; }
  if (choice === "claim") {
    const [won] = await h.update(socialVariants).set({ status: "publishing", updatedAt: now })
      .where(and(eq(socialVariants.id, variantId), eq(socialVariants.approvalId, approvalId), eq(socialVariants.status, "scheduled"), lte(socialVariants.scheduledAt, now)))
      .returning({ id: socialVariants.id });
    if (!won) return;
  } else {
    const [won] = await h.update(socialVariants).set({ updatedAt: now })
      .where(and(eq(socialVariants.id, variantId), eq(socialVariants.approvalId, approvalId), eq(socialVariants.status, "publishing"), lt(socialVariants.updatedAt, new Date(now.getTime() - PUBLISH_STALE_MS))))
      .returning({ id: socialVariants.id });
    if (!won) return;
  }
  try {
    let result: PublishResult | null = v.remoteId ? { state: "published", remoteId: v.remoteId, remoteUrl: v.remoteUrl ?? undefined } : null;
    if (!result) {
      if (!provider.publish) throw new Error("publish unavailable");
      const input = { text: v.text, imageUrl: v.imageUrl, linkUrl: v.linkUrl, containerId: v.containerId };
      if (choice === "adopt" && provider.findPublished) result = await provider.findPublished(input);
      if (!result) result = await provider.publish(input, `approval:${approvalId}`);
      if (result.state === "container_pending") {
        const persistedAt = new Date();
        const [saved] = await h.update(socialVariants).set({ containerId: result.containerId, updatedAt: persistedAt })
          .where(and(eq(socialVariants.id, variantId), eq(socialVariants.approvalId, approvalId), eq(socialVariants.status, "publishing")))
          .returning({ id: socialVariants.id });
        if (saved) await queueContainerContinuation(variantId, approvalId, persistedAt).catch(() => undefined);
        // The next attempt reuses this container; the sweep covers an enqueue failure.
        return;
      }
      await h.update(socialVariants).set({ remoteId: result.remoteId, remoteUrl: result.remoteUrl ?? null,
        containerId: result.containerId ?? v.containerId, updatedAt: new Date() })
        .where(and(eq(socialVariants.id, variantId), eq(socialVariants.approvalId, approvalId), eq(socialVariants.status, "publishing")));
    }
    const [published] = await h.update(socialVariants).set({ status: "published", publishedAt: new Date(), isMock: provider.isMock, lastError: null, updatedAt: new Date() })
      .where(and(eq(socialVariants.id, variantId), eq(socialVariants.approvalId, approvalId), eq(socialVariants.status, "publishing"), isNotNull(socialVariants.remoteId)))
      .returning({ id: socialVariants.id });
    if (published) await emitActivity({ type: "social.published", source: "social", title: `${provider.label} post published`, tone: "green", payload: { variantId } },
      { category: "FYI", title: `${provider.label} post published`, actionUrl: "/socials" }, h);
  } catch (err) {
    if (err instanceof ProviderAuthError) await fail(h, v, "RECONNECT", true);
    else if (err instanceof UncertainPublishError) await fail(h, v, v.platform === "linkedin" ? LINKEDIN_REVIEW : INSTAGRAM_REVIEW);
    else {
      log.warn({ variantId, error: err instanceof Error ? err.name : "unknown" }, "social publish failed");
      await fail(h, v, "Social publishing failed. Review the post before retrying.");
    }
  }
}

export async function runScheduled(h: DB = db(), now = new Date()): Promise<number> {
  const rows = await h.select({ id: socialVariants.id, approvalId: socialVariants.approvalId }).from(socialVariants)
    .where(or(and(eq(socialVariants.status, "scheduled"), lte(socialVariants.scheduledAt, now)),
      and(eq(socialVariants.status, "publishing"), lte(socialVariants.updatedAt, new Date(now.getTime() - PUBLISH_STALE_MS)))));
  let queued = 0;
  for (const row of rows) {
    if (!row.approvalId) continue;
    try { await enqueue(QUEUES.socialsPublish, { variantId: row.id, approvalId: row.approvalId }, { singletonKey: row.id }); queued++; }
    catch { /* next sweep retries */ }
  }
  return queued;
}
