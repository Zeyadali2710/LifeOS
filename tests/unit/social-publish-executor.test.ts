import { describe, expect, it } from "vitest";
import { approvedHash } from "@/server/agents/tools/socials";
import { inspectPublish } from "@/server/socials/publish";

const payload = {
  variantId: "11111111-1111-4111-8111-111111111111", platform: "linkedin" as const,
  text: "Approved text", imageUrl: null, linkUrl: "https://example.com",
  providerMode: "real" as const, connectionGeneration: "22222222-2222-4222-8222-222222222222", publishAt: null,
};
const variant = {
  id: payload.variantId, platform: payload.platform, status: "scheduled", approvalId: "approval-1",
  text: payload.text, imageUrl: payload.imageUrl, linkUrl: payload.linkUrl,
  approvedTextHash: approvedHash(payload), approvedProviderMode: payload.providerMode,
  approvedConnectionGeneration: payload.connectionGeneration, remoteId: null, containerId: null,
  scheduledAt: new Date("2026-10-15T00:00:00Z"), updatedAt: new Date("2026-10-15T00:00:00Z"),
};
const provider = { platform: "linkedin" as const, isMock: false, credentialGeneration: payload.connectionGeneration,
  capabilities: { draft: true, publish: true, schedule: true, analytics: false } };
const approval = { id: variant.approvalId, status: "executed", payload };
const now = new Date("2026-10-15T01:00:00Z");

describe("social publish guard", () => {
  it("accepts only the exact approved payload and binding", () => {
    expect(inspectPublish(variant, approval, provider, now)).toBe("claim");
    for (const edit of [{ text: "changed" }, { imageUrl: "https://example.com/a.jpg" }, { linkUrl: "https://example.com/new" }])
      expect(inspectPublish({ ...variant, ...edit }, approval, provider, now)).toBe("fail");
    expect(inspectPublish(variant, approval, { ...provider, isMock: true }, now)).toBe("fail");
    expect(inspectPublish({ ...variant, approvedProviderMode: "mock" }, approval, provider, now)).toBe("fail");
    expect(inspectPublish(variant, approval, { ...provider, credentialGeneration: "new" }, now)).toBe("fail");
    expect(inspectPublish(variant, approval, { ...provider, capabilities: { ...provider.capabilities, publish: false } }, now)).toBe("fail");
    expect(inspectPublish({ ...variant, approvalId: "other" }, approval, provider, now)).toBe("noop");
  });

  it("no-ops early jobs and duplicate completion; reviews ambiguous real retries", () => {
    expect(inspectPublish({ ...variant, scheduledAt: new Date("2026-10-16T00:00:00Z") }, approval, provider, now)).toBe("noop");
    expect(inspectPublish({ ...variant, scheduledAt: null }, approval, provider, now)).toBe("fail");
    expect(inspectPublish({ ...variant, status: "published", remoteId: "urn:li:share:1" }, approval, provider, now)).toBe("noop");
    expect(inspectPublish({ ...variant, status: "publishing", updatedAt: now }, approval, provider, now)).toBe("noop");
    expect(inspectPublish({ ...variant, status: "publishing" }, approval, provider, now)).toBe("review");
    expect(inspectPublish({ ...variant, platform: "instagram", status: "publishing", containerId: "c1", text: "caption", imageUrl: "https://example.com/a.jpg", approvedTextHash: approvedHash({ platform: "instagram", text: "caption", imageUrl: "https://example.com/a.jpg", linkUrl: payload.linkUrl }) },
      { ...approval, payload: { ...payload, platform: "instagram", text: "caption", imageUrl: "https://example.com/a.jpg" } },
      { ...provider, platform: "instagram" }, now)).toBe("adopt");
  });
});
