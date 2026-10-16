import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatCount } from "@/socials/platform";
import { PlatformCard, type PlatformCardData } from "@/socials/platform-card";
import type { listBoard } from "@/server/socials/queries";

const now = new Date("2026-10-15T00:00:00Z");
const card = (patch: Partial<PlatformCardData> = {}): PlatformCardData => ({
  platform: "instagram", label: "Instagram", isMock: true,
  capabilities: { draft: true, publish: true, schedule: true, analytics: true },
  connection: null, followers: null, history: [], latest: null, ...patch,
});
const render = (data: PlatformCardData, posts: Awaited<ReturnType<typeof listBoard>> = []) => renderToStaticMarkup(createElement(PlatformCard, { card: data, posts, now }));

describe("Socials overview", () => {
  it("formats counts without turning missing data into zero", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(9999)).toBe("9,999");
    expect(formatCount(12400)).toBe("12.4k");
    expect(render(card())).toContain("not available");
  });
  it("keeps real Instagram verification pending distinct from MOCK", () => {
    const html = render(card({ isMock: false, connection: { id: "instagram", status: "verification_pending", last4: "1234", login: "123", expiresAt: null, scopes: [], lastSyncAt: null, lastSyncError: null } }));
    expect(html).toContain("VERIFICATION PENDING");
    expect(html).toContain("unavailable until the owner verifies");
    expect(html).not.toContain(">MOCK<");
  });
  it("shows real TikTok partial grants and escapes provider text", () => {
    const html = render(card({ platform: "tiktok", isMock: false, connection: { id: "tiktok", status: "connected", last4: "1234", login: "internal-account-id", expiresAt: null, scopes: ["user.info.basic"], lastSyncAt: null, lastSyncError: "<script>alert(1)</script>" } }));
    expect(html).toContain("Profile: granted");
    expect(html).toContain("Account stats: not granted");
    expect(html).toContain("Video stats: not granted");
    expect(html).not.toContain("internal-account-id");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("not available");
  });
  it("finds mock schedules using approved mode before isMock is set at publish", () => {
    const posts = [{ variants: [{ platform: "instagram", status: "scheduled", approvedProviderMode: "mock", isMock: false, scheduledAt: new Date("2026-10-16T00:00:00Z") }] }] as Awaited<ReturnType<typeof listBoard>>;
    expect(render(card(), posts)).not.toContain("Nothing scheduled");
    expect(render(card({ isMock: false }), posts)).toContain("Nothing scheduled");
  });
  it("shows expired tokens as reconnect", () => {
    expect(render(card({ isMock: false, connection: { id: "instagram", status: "connected", last4: "1234", login: "123", expiresAt: new Date("2026-10-14"), scopes: [], lastSyncAt: null, lastSyncError: null } }))).toContain("RECONNECT");
  });
});
