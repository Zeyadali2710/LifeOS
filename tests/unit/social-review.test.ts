import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SocialApprovalBody, socialResolved, toSocialDraft, validateSocialDraft, type SocialPayload } from "@/approvals/social-approval";
import type { ApprovalDTO } from "@/lib/agent-types";
import { ApprovalList } from "@/approvals/approval-list";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/shell/live-provider", () => ({ useLiveEvents: vi.fn() }));
vi.mock("@/shell/shell-provider", () => ({ useShell: () => ({ toast: vi.fn() }) }));
vi.mock("@/server/socials-actions", () => ({ socialReviewFacts: vi.fn(), saveToken: vi.fn(), confirmInstagramSmoke: vi.fn(), disconnect: vi.fn(), saveTikTokCredentials: vi.fn() }));
vi.mock("@/server/approval-actions", () => ({ approveAction: vi.fn(), rejectAction: vi.fn(), saveEditAction: vi.fn() }));
vi.mock("@/server/settings-actions", () => ({ removeTokenAction: vi.fn(), saveTokenAction: vi.fn(), saveOpenRouterKeyAction: vi.fn() }));
vi.mock("@/server/outreach-actions", () => ({ removeEventKeyAction: vi.fn(), saveEventKeyAction: vi.fn() }));

const p: SocialPayload = { variantId: "11111111-1111-4111-8111-111111111111", platform: "instagram", text: "<script>alert(1)</script>", imageUrl: "https://images.example.com/a.jpg", linkUrl: null, publishAt: null, providerMode: "mock", connectionGeneration: null };
const a = { id: "approval", original: p, edited: null, status: "executed", error: null } as ApprovalDTO;
const facts = { postId: "post", approvalId: "approval", status: "scheduled", scheduledAt: "2026-10-20T00:00:00Z", isMock: true, lastError: null, remoteUrl: null, bindingMatches: true, destination: "LifeOS fixture store", draftedFromContent: true };
describe("Social review and connection surfaces", () => {
  it("keeps malformed social payloads from crashing the approval list", () => {
    const html = renderToStaticMarkup(createElement(ApprovalList, { pending: [{ ...a, original: null, status: "pending", agentId: "social", createdAt: "2026-10-15T00:00:00Z", kind: "social_publish" }], resolved: [], tab: "pending", onTab: vi.fn(), selectedId: null, onSelect: vi.fn() }));
    expect(html).toContain("SOCIAL POST");
  });
  it("edits content while retaining locked bindings and rejecting invalid format/time", () => {
    const valid = validateSocialDraft(p, { ...toSocialDraft(p), text: "Owner edit", ...{ platform: "linkedin", providerMode: "real" } });
    expect(valid.success && valid.data).toMatchObject({ platform: "instagram", providerMode: "mock", variantId: p.variantId, text: "Owner edit" });
    expect(validateSocialDraft(p, { ...toSocialDraft(p), imageUrl: null }).success).toBe(false);
    expect(validateSocialDraft(p, { ...toSocialDraft(p), text: "x".repeat(2201) }).success).toBe(false);
    expect(validateSocialDraft(p, { ...toSocialDraft(p), publishAt: "invalid" }).success).toBe(false);
  });
  it("distinguishes approval execution from actual scheduled/publishing/published/failed states", () => {
    expect(socialResolved(a, null)).toContain("checking publish status");
    expect(socialResolved(a, facts)).toContain("Scheduled");
    expect(socialResolved(a, { ...facts, status: "publishing" })).toBe("Publishing…");
    expect(socialResolved(a, { ...facts, status: "published" })).toContain("Nothing left LifeOS");
    expect(socialResolved(a, { ...facts, status: "failed", lastError: "Connection changed" })).toBe("Connection changed");
    expect(socialResolved({ ...a, status: "rejected" }, facts)).toContain("Nothing was posted");
  });
  it("renders exact text/URLs, untrusted note and mock destination safely", () => {
    const html = renderToStaticMarkup(createElement(SocialApprovalBody, { approval: a, draft: toSocialDraft(p), editing: false, onDraft: vi.fn(), facts }));
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
    expect(html).toContain("LifeOS fixture store"); expect(html).toContain("untrusted"); expect(html).toContain(p.imageUrl);
  });

});
