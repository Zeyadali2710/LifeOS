import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { boardColumn } from "@/lib/social-types";
import { canPublish, editableVariant, safePostUrl, calendarDays, calendarRange, dayKey, scheduleInstant, followerTotal, metricValue } from "@/socials/model";
import { VariantPanel } from "@/socials/variant-panel";
import { PostsTable } from "@/socials/posts-table";
import { FollowersChart } from "@/socials/followers-chart";
import { AnalyticsView } from "@/socials/analytics-view";
import type { Card, Variant } from "@/socials/model";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/features/shell/shell-provider", () => ({ useShell: () => ({ toast: vi.fn() }) }));
vi.mock("@/server/socials-actions", () => ({ cancelSchedule: vi.fn(), requestPublish: vi.fn(), retryVariant: vi.fn(), saveVariant: vi.fn(), markPosted: vi.fn(), reschedule: vi.fn() }));

const now = new Date("2026-10-15T00:00:00Z");
const card = { platform: "instagram", label: "Instagram", isMock: true, capabilities: { publish: true, schedule: true, analytics: true, draft: true }, connection: null, followers: null, history: [], latest: null } satisfies Card;
const variant = { id: "variant", postId: "post", platform: "instagram", text: "<script>caption</script>", status: "scheduled", imageUrl: "https://images.example.com/photo.jpg", linkUrl: null, scheduledAt: now, publishedAt: null, approvalId: "approval", approvedTextHash: "hash", approvedProviderMode: "mock", approvedConnectionGeneration: null, remoteId: null, remoteUrl: null, importedAccount: null, containerId: null, isMock: false, metrics: null, metricsAt: null, lastError: null, createdAt: now, updatedAt: now } satisfies Variant;
const panel = (patch: Partial<Variant> = {}, account: Card = card) => renderToStaticMarkup(createElement(VariantPanel, { variant: { ...variant, ...patch }, title: "Post", card: account, now, defaultDate: "2026-10-15", parentDirty: false, onDirty: () => {} }));

describe("Socials owner UI rules", () => {
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
