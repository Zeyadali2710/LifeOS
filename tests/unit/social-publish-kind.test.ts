import { describe, expect, it } from "vitest";
import { approvalKind, approvalSummary, checkLocked, payloadSchemaFor } from "@/lib/approval-kinds";

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
});
