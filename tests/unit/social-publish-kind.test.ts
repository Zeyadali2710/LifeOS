import { describe, expect, it } from "vitest";
import { approvalKind, approvalSummary, checkLocked, payloadSchemaFor } from "@/lib/approval-kinds";
import { getAgent } from "@/server/agents/registry";
import { TOOLS } from "@/server/agents/tools";
import { approvedHash, prepareApprovedSocial, publish } from "@/server/agents/tools/socials";
import type { DB } from "@/server/db/client";
import type { ToolContext } from "@/server/agents/types";

const base = {
  variantId: "11111111-1111-4111-8111-111111111111",
  platform: "linkedin",
  text: "Building LifeOS in public #7",
  imageUrl: null,
  linkUrl: null,
  providerMode: "mock",
  connectionGeneration: null,
  publishAt: null,
};

describe("social publish approval", () => {
  it("uses its own approval kind and editable content", () => {
    expect(approvalKind("socials.publish")).toBe("social_publish");
    expect(payloadSchemaFor("socials.publish").safeParse(base).success).toBe(true);
    expect(checkLocked("social_publish", base, { ...base, text: "Edited" })).toBeNull();
  });

  it.each(["variantId", "platform", "providerMode", "connectionGeneration"] as const)("locks %s", (key) => {
    expect(checkLocked("social_publish", base, { ...base, [key]: "changed" })).toHaveProperty(key);
  });

  it("rejects invalid content and unsupported platform", () => {
    expect(payloadSchemaFor("socials.publish").safeParse({ ...base, text: "" }).success).toBe(false);
    expect(payloadSchemaFor("socials.publish").safeParse({ ...base, platform: "tiktok" }).success).toBe(false);
    expect(payloadSchemaFor("socials.publish").safeParse({ ...base, platform: "instagram", imageUrl: null }).success).toBe(false);
  });

  it("summarizes the platform without leaking full text", () => {
    const summary = approvalSummary("socials.publish", base, new Date("2026-10-19T01:00:00Z"));
    expect(summary.title).toContain("LinkedIn");
    expect(summary.title).toContain("Building LifeOS");
  });

  it("registers the live Social agent and its approval tool", () => {
    const agent = getAgent("social")!;
    expect(agent.live).toBe(true);
    expect(agent.tools).toContain("socials.publish");
    expect(TOOLS["socials.publish"]).toBe(publish);
    expect(publish.tier).toBe("APPROVE");
    expect(publish.sideEffect).toBe(true);
  });

  it("hashes all approved content fields", () => {
    const hash = approvedHash(base as Parameters<typeof approvedHash>[0]);
    for (const edit of [{ text: "other" }, { imageUrl: "https://example.com/a.jpg" }, { linkUrl: "https://example.com" }, { platform: "instagram" }]) {
      expect(approvedHash({ ...base, ...edit } as Parameters<typeof approvedHash>[0])).not.toBe(hash);
    }
  });

  it("checks the live variant before requesting an approval", async () => {
    let reads = 0;
    const variant = { id: base.variantId, platform: "linkedin", status: "draft" };
    const fake = { select: () => ({ from: () => ({ where: async () => (++reads === 1 ? [variant] : []) }) }) } as unknown as DB;
    const ctx = { handle: fake } as ToolContext;
    const input = { variantId: base.variantId, platform: "linkedin" as const, text: base.text, imageUrl: null, linkUrl: null, publishAt: null };
    expect(await publish.resolve!(input, ctx)).toMatchObject({ providerMode: "mock", connectionGeneration: null });
    variant.status = "pending_approval";
    reads = 0;
    await expect(publish.resolve!(input, ctx)).rejects.toThrow("not a draft");
  });

  it("persists edited content and its hash together only for a matching binding", async () => {
    const approvalId = "22222222-2222-4222-8222-222222222222";
    const variant = { ...base, id: base.variantId, status: "pending_approval", approvalId };
    let reads = 0;
    const writes: Record<string, unknown>[] = [];
    const fake = {
      execute: async () => undefined,
      select: () => ({ from: () => ({ where: async () => (++reads % 2 === 1 ? [variant] : []) }) }),
      update: () => ({ set: (value: Record<string, unknown>) => { writes.push(value); return { where: () => ({ returning: async () => [{ id: base.variantId }] }) }; } }),
    } as unknown as DB;
    const edited = { ...base, text: "Owner revised text", linkUrl: "https://example.com/post" };
    expect(await prepareApprovedSocial(fake, approvalId, edited as Parameters<typeof prepareApprovedSocial>[2], new Date("2026-10-15T00:00:00Z"))).toBe(true);
    expect(writes[0]).toMatchObject({ status: "scheduled", text: edited.text, imageUrl: null, linkUrl: edited.linkUrl,
      approvedTextHash: approvedHash(edited as Parameters<typeof approvedHash>[0]), approvedProviderMode: "mock", approvedConnectionGeneration: null });
    const wrong = { ...edited, providerMode: "real" };
    expect(await prepareApprovedSocial(fake, approvalId, wrong as Parameters<typeof prepareApprovedSocial>[2], new Date())).toBe(false);
    expect(writes).toHaveLength(1);
  });
});
