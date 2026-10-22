import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { socialResolved, toSocialDraft, validateSocialDraft, type SocialPayload } from "@/features/approvals/model/social";
import type { ApprovalDTO } from "@/lib/agent-types";
import { ApprovalDetail, rowTitle } from "@/features/approvals/detail";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/shell/live-provider", () => ({ useLiveEvents: vi.fn() }));
vi.mock("@/features/shell/shell-provider", () => ({ useShell: () => ({ toast: vi.fn() }) }));
vi.mock("@/features/shell/agent-status", () => ({ useAgentStatus: () => ({ refresh: vi.fn(), status: null }) }));
vi.mock("@/server/socials-actions", () => ({ socialReviewFacts: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/server/approval-actions", () => ({ approveAction: vi.fn(), rejectAction: vi.fn(), saveEditAction: vi.fn(), retryApprovalAction: vi.fn(), reviewFinanceAction: vi.fn() }));
vi.mock("@/server/mail-actions", () => ({ saveReplyToDraftsAction: vi.fn() }));

const p: SocialPayload = { variantId: "11111111-1111-4111-8111-111111111111", platform: "instagram", text: "<script>alert(1)</script>", imageUrl: "https://images.example.com/a.jpg", linkUrl: null, publishAt: null, providerMode: "mock", connectionGeneration: null };
const a = { id: "approval", tool: "socials.publish", kind: "social_publish", agentId: "social", original: p, edited: null, status: "executed", error: null, createdAt: "2026-10-15T00:00:00Z", expiresAt: "2026-10-22T00:00:00Z", decidedAt: "2026-10-15T01:00:00Z", reason: null } as unknown as ApprovalDTO;
const facts = { postId: "post", approvalId: "approval", status: "scheduled", scheduledAt: "2026-10-20T00:00:00Z", isMock: true, lastError: null, remoteUrl: null, bindingMatches: true, destination: "LifeOS fixture store", draftedFromContent: true };
const write = { connected: false, login: null, last4: null };

describe("Social review", () => {
  it("keeps malformed social payloads from crashing the approval list", () => {
    expect(rowTitle({ ...a, original: null, status: "pending" })).toBe("Publish on a social platform");
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
  it("renders the exact post text as text, never markup, and shows mock publishing", () => {
    const html = renderToStaticMarkup(createElement(ApprovalDetail, { approval: a, write, onChange: vi.fn() }));
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("MOCK");
    expect(html).toContain("Publish on Instagram");
  });
  it("a pending post is editable before approval", () => {
    const html = renderToStaticMarkup(createElement(ApprovalDetail, { approval: { ...a, status: "pending", decidedAt: null }, write, onChange: vi.fn() }));
    expect(html).toContain("AWAITING YOUR APPROVAL");
    expect(html).toContain("POST TEXT · YOU CAN EDIT BEFORE APPROVING");
    expect(html).toContain(p.imageUrl);
  });
});
