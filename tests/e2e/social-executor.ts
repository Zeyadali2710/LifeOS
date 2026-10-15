// Test-only subprocess: the e2e stack has no queue consumer. Invoke its actual
// publish executor with a future clock, an isolated DB and all network disabled.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb } from "../../src/server/db/client";
import { agentRuns, approvals, connections, socialPosts, socialVariants, toolCalls } from "../../src/server/db/schema";
import { approvedHash } from "../../src/server/agents/tools/socials";
import { removeSocialConnection } from "../../src/server/socials/connections";
import { publishVariant } from "../../src/server/socials/publish";

const [mode, postId] = process.argv.slice(2);
const url = process.env.DATABASE_URL!;
assert.equal(new URL(url).pathname, "/lifeos_e2e");
globalThis.fetch = async () => { throw new Error("Network prohibited in Social e2e executor"); };
const { db: h, pool } = createDb(url);
try {
  let id = postId;
  if (mode === "removed-real") {
    // Seed a queued real binding, remove its fixture credential using production
    // code, then exercise the same executor used by the worker. No token is real.
    assert.equal((await h.select().from(connections).where(eq(connections.id, "linkedin"))).length, 0);
    const generation = randomUUID();
    const [post] = await h.insert(socialPosts).values({ title: `Removed credential ${randomUUID()}`, stage: "draft" }).returning();
    id = post!.id;
    const [variant] = await h.insert(socialVariants).values({ postId: id, platform: "linkedin", text: "Queued owner-approved text" }).returning();
    const payload = { variantId: variant!.id, platform: "linkedin" as const, text: variant!.text, imageUrl: null, linkUrl: null, publishAt: null, providerMode: "real", connectionGeneration: generation };
    const [run] = await h.insert(agentRuns).values({ agentId: "social", prompt: "e2e removed credential fixture", model: "fixture", status: "completed" }).returning();
    const [call] = await h.insert(toolCalls).values({ runId: run!.id, toolUseId: "fixture", seq: 1, tool: "socials.publish", tier: "APPROVE", status: "done", input: payload }).returning();
    const [approval] = await h.insert(approvals).values({ runId: run!.id, toolCallId: call!.id, agentId: "social", tool: "socials.publish", status: "executed", originalPayload: payload, payloadHash: "fixture", expiresAt: new Date(Date.now() + 86400000) }).returning();
    await h.update(socialVariants).set({ status: "scheduled", scheduledAt: new Date(), approvalId: approval!.id, approvedTextHash: approvedHash(payload), approvedProviderMode: "real", approvedConnectionGeneration: generation }).where(eq(socialVariants.id, variant!.id));
    await h.insert(connections).values({ id: "linkedin", ciphertext: "test fixture only", last4: "fake", status: "connected", credentialGeneration: generation });
    await removeSocialConnection(h, "linkedin");
  } else assert.equal(mode, "publish");
  assert.match(id!, /^[0-9a-f-]{36}$/);
  const variants = await h.select().from(socialVariants).where(eq(socialVariants.postId, id!));
  const v = variants.find((v) => v.approvalId && v.status === "scheduled");
  assert(v?.approvalId && v.scheduledAt);
  if (mode === "publish") {
    assert.equal(v.approvedProviderMode, "mock");
    assert.equal((await h.select().from(connections).where(eq(connections.id, v.platform))).length, 0);
  }
  await publishVariant(v.id, v.approvalId, h, new Date(v.scheduledAt.getTime() + 1000));
  // Retry invokes the real executor again: it must be a no-op after publication.
  await publishVariant(v.id, v.approvalId, h, new Date(v.scheduledAt.getTime() + 2000));
  const [result] = await h.select().from(socialVariants).where(eq(socialVariants.id, v.id));
  assert.equal(result!.status, mode === "publish" ? "published" : "failed");
  assert.equal(result!.remoteUrl, null);
  assert.equal(result!.isMock, mode === "publish");
  if (mode === "publish") assert.match(result!.remoteId!, /^mock:/);
  else assert.equal(result!.remoteId, null);
  process.stdout.write(JSON.stringify({ postId: id, status: result!.status, remoteId: result!.remoteId }) + "\n");
} finally { await pool.end(); }
