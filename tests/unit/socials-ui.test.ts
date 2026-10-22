import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { boardColumn } from "@/lib/social-types";
import { canPublish, editableVariant, safePostUrl, calendarDays, calendarRange, dayKey, scheduleInstant, followerTotal, metricValue, matchesStatus } from "@/features/socials/model";
import { VariantPanel } from "@/features/socials/variant-panel";
import { PostsTable } from "@/features/socials/posts-table";
import { FollowersChart } from "@/features/socials/followers-chart";
import { AnalyticsView } from "@/features/socials/analytics-view";
import type { Card, Variant } from "@/features/socials/model";
import type { SocialReview } from "@/server/socials-view";
import { PostPreview } from "@/features/socials/post-preview";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/features/shell/shell-provider", () => ({ useShell: () => ({ toast: vi.fn() }) }));
vi.mock("@/server/approval-actions", () => ({ approveAction: vi.fn(), rejectAction: vi.fn() }));
vi.mock("@/server/socials-actions", () => ({ cancelSchedule: vi.fn(), requestPublish: vi.fn(), retryVariant: vi.fn(), saveVariant: vi.fn(), markPosted: vi.fn(), reschedule: vi.fn() }));

const now = new Date("2026-10-15T00:00:00Z");
const card = { platform: "instagram", label: "Instagram", isMock: true, capabilities: { publish: true, schedule: true, analytics: true, draft: true }, connection: null, followers: null, history: [], latest: null } satisfies Card;
const variant = { id: "variant", postId: "post", platform: "instagram", text: "<script>caption</script>", status: "scheduled", imageUrl: "https://images.example.com/photo.jpg", linkUrl: null, scheduledAt: now, publishedAt: null, approvalId: "approval", approvedTextHash: "hash", approvedProviderMode: "mock", approvedConnectionGeneration: null, remoteId: null, remoteUrl: null, importedAccount: null, containerId: null, isMock: false, metrics: null, metricsAt: null, lastError: null, createdAt: now, updatedAt: now } satisfies Variant;
const panel = (patch: Partial<Variant> = {}, account: Card = card) => renderToStaticMarkup(createElement(VariantPanel, { variant: { ...variant, ...patch }, title: "Post", card: account, now, defaultDate: "2026-10-15", parentDirty: false, onDirty: () => {} }));

describe("Socials owner UI rules", () => {
  it("keeps proposals and publishing out of published feed results", () => {
    for (const status of ["draft", "pending_approval", "scheduled", "publishing", "failed"]) expect(matchesStatus(status, "published")).toBe(false);
    for (const status of ["published", "posted_manually"]) expect(matchesStatus(status, "published")).toBe(true);
    expect(matchesStatus("publishing", "scheduled")).toBe(true);
    expect(matchesStatus("failed", "review")).toBe(true);
    expect(matchesStatus("pending_approval", "review")).toBe(true);
  });
  it("reviews the current edited proposal and blocks approval after the account binding changes", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const payload = { variantId: id, platform: "instagram", text: "Current edited proposal", imageUrl: variant.imageUrl, linkUrl: null, publishAt: "2026-10-16T01:00:00Z", providerMode: "mock", connectionGeneration: null };
    const review: SocialReview = {
      approval: { id: "approval", runId: "run", agentId: "social", tool: "socials.publish", status: "pending", kind: "social_publish", original: { ...payload, text: "Old proposal" }, edited: payload, reason: null, createdAt: now.toISOString(), expiresAt: "2026-10-17T00:00:00Z", decidedAt: null, result: null, error: null, repoPrivate: null, targetChanged: null },
      facts: { postId: "post", status: "pending_approval", approvalId: "approval", scheduledAt: null, remoteUrl: null, isMock: false, lastError: null, draftedFromContent: false, bindingMatches: true, destination: "LifeOS fixture store" },
    };
    const render = (value: SocialReview) => renderToStaticMarkup(createElement(VariantPanel, { variant: { ...variant, id, status: "pending_approval" }, title: "Post", card, now, defaultDate: "2026-10-15", parentDirty: false, onDirty: () => {}, review: value }));
    const html = render(review);
    expect(html).toContain("Current edited proposal");
    expect(html).not.toContain("Old proposal");
    expect(html).not.toContain("&lt;script&gt;caption");
    expect(html).toContain("Approve &amp; schedule");
    expect(html).toContain("Back to draft");
    expect(html).toContain("Not published");
    expect(html).not.toContain("<textarea");
    const changed = render({ ...review, facts: { ...review.facts, bindingMatches: false } });
    expect(changed).toMatch(/<button[^>]*disabled=""[^>]*>Approve &amp; schedule/);
    expect(changed).toContain("The account binding changed");
    expect(render({ ...review, approval: { ...review.approval, expiresAt: "2026-10-14T00:00:00Z" } })).toMatch(/<button[^>]*disabled=""[^>]*>Approve &amp; schedule/);
  });
  it("shows platform-specific missing media without rendering unsafe image URLs", () => {
    const render = (platform: "instagram" | "tiktok" | "linkedin", imageUrl: string | null) => renderToStaticMarkup(createElement(PostPreview, { platform, imageUrl, text: "Caption", title: "Draft" }));
    expect(render("instagram", null)).toContain("Instagram needs a photo");
    expect(render("tiktok", null)).toContain("a 9:16 video posted in the app");
    expect(render("linkedin", null)).not.toContain("No media attached");
    expect(render("instagram", "http://images.example.com/photo.jpg")).not.toContain("<img");
    expect(render("instagram", "https://images.example.com/photo.jpg")).toContain('data-platform="instagram"');
  });
  it("shows January imported posts in the default year-to-date analytics view", () => {
    const january = new Date("2026-01-12T01:00:00Z");
    const post = { id: "post", title: "January archive", body: "old caption", stage: "draft", createdBy: "owner", draftedFromContent: true, sourceKind: null, sourceId: null, createdAt: january, updatedAt: january, column: "Published" as const,
      variants: [{ ...variant, status: "posted_manually", publishedAt: january, importedAccount: "owner", isMock: false, metrics: { views: 12 } }] };
    const html = renderToStaticMarkup(createElement(AnalyticsView, { data: { cards: [card], board: [post], post: null, sources: null, calendar: [], analytics: null, now }, onOpen: () => {} }));
    expect(html).toContain("January archive");
    expect(html).toContain("1 this year");
    expect(html).toContain(">YTD</label>");
    const imported = panel({ status: "posted_manually", publishedAt: january, importedAccount: "owner", imageUrl: null });
    expect(imported).toContain("Imported from Instagram");
    expect(imported).not.toContain("Publish now");
    expect(imported).not.toContain("Instagram needs one public HTTPS image");
  });
  it("shows the Portfolio image error before export", () => {
    const html = panel({ platform: "portfolio", status: "draft", imageUrl: "http://images.example.com/photo.jpg" }, { ...card, platform: "portfolio", isMock: false, capabilities: { ...card.capabilities, publish: false } });
    expect(html).toContain("Portfolio image URL must be public HTTPS.");
    expect(html).not.toContain("Ready to post");
  });
  it("derives board columns from approvals and schedules before owner stage", () => {
    expect(boardColumn("idea", ["scheduled", "pending_approval"])).toBe("Review");
    expect(boardColumn("draft", ["published", "posted_manually"])).toBe("Published");
    expect(boardColumn("idea", [])).toBe("Ideas");
  });
  it("allows only draft edits and server-declared publish capabilities", () => {
    for (const status of ["pending_approval", "scheduled", "publishing", "published", "failed", "posted_manually"]) expect(editableVariant(status)).toBe(false);
    expect(editableVariant("draft")).toBe(true);
    expect(canPublish({ platform: "instagram", isMock: true, capabilities: { publish: true }, connection: null })).toBe(true);
    expect(canPublish({ platform: "instagram", isMock: false, capabilities: { publish: true }, connection: { status: "verification_pending" } })).toBe(false);
    expect(canPublish({ platform: "instagram", isMock: false, capabilities: { publish: true }, connection: { status: "error" } })).toBe(false);
    for (const platform of ["tiktok", "portfolio"]) expect(canPublish({ platform, isMock: true, capabilities: { publish: true }, connection: null })).toBe(false);
  });
  it("validates HTTPS platform hosts and TikTok video IDs", () => {
    expect(safePostUrl("tiktok", "https://www.tiktok.com/@owner/video/123")).toBeTruthy();
    for (const url of ["https://tiktok.com.evil.test/video/123", "https://evil.test/video/123", "https://user@tiktok.com/video/123", "http://tiktok.com/video/123", "https://tiktok.com/@owner"]) expect(safePostUrl("tiktok", url)).toBeNull();
    expect(safePostUrl("portfolio", "javascript:alert(1)")).toBeNull();
    expect(safePostUrl("portfolio", "https://example.com/post")).toBeTruthy();
  });
  it("uses Sydney dates across UTC and daylight savings boundaries", () => {
    expect(dayKey(new Date("2026-10-14T14:00:00Z"))).toBe("2026-10-15");
    expect(calendarDays("2026-10-15", "week")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
    expect(calendarDays("2026-10-15", "month")).toHaveLength(35);
    const { from, to } = calendarRange("2026-10-15", "month");
    expect(dayKey(from)).toBe("2026-09-28");
    expect(dayKey(to)).toBe("2026-11-02");
    for (const day of ["2026-09-28", "2026-11-01"]) {
      const post = scheduleInstant(day, "23:59")!;
      expect(post >= from && post < to).toBe(true);
    }
    expect(scheduleInstant("2026-10-15", "10:00")?.toISOString()).toBe("2026-10-14T23:00:00.000Z");
    expect(scheduleInstant("2026-10-04", "02:30")).toBeNull();
    expect(scheduleInstant("2026-02-30", "10:00")).toBeNull();
  });
  it("keeps missing metrics distinct from returned zero and excludes mock followers", () => {
    expect(metricValue({}, "views")).toBeNull();
    expect(metricValue({ views: 0 }, "views")).toBe(0);
    expect(followerTotal([{ isMock: true, followers: 500 }, { isMock: false, followers: 0 }, { isMock: false, followers: 12 }])).toBe(12);
    expect(followerTotal([{ isMock: true, followers: 500 }])).toBeNull();
  });
  it("renders scheduled content read-only, escapes text, and exposes only time/cancel actions", () => {
    const html = panel();
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("Publish now");
    expect(html).toContain("Reschedule");
    expect(html).toContain("Cancel schedule");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("renders mock Instagram approval buttons but removes real verification-pending publish", () => {
    expect(panel({ status: "draft" })).toContain("Publish now");
    const html = panel({ status: "draft" }, { ...card, isMock: false, connection: { id: "instagram", status: "verification_pending", last4: "1234", login: "owner", scopes: [], expiresAt: null, lastSyncAt: null, lastSyncError: null } });
    expect(html).not.toContain("Publish now");
    expect(html).not.toContain(">Schedule<");
    expect(html).toContain("unavailable until the owner verifies");
  });
  it("renders only returned metric columns while preserving zero and missing cells", () => {
    const html = renderToStaticMarkup(createElement(PostsTable, { variants: [{ ...variant, status: "published", metrics: { views: 0 } }, { ...variant, id: "other", metrics: null, isMock: true }], posts: [], onOpen: () => {} }));
    expect(html).toContain(">views</th>");
    expect(html).not.toContain(">reach</th>");
    expect(html).toContain(">0</td>");
    expect(html).toContain("not provided");
    expect(html).toContain(">MOCK<");
    expect(renderToStaticMarkup(createElement(FollowersChart, { cards: [card] }))).toContain("No follower history yet");
  });
});

