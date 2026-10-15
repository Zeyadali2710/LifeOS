import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildPalette } from "@/shell/palette-items";
import { SocialConnections } from "@/settings/social-connections";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/shell/live-provider", () => ({ useLiveEvents: vi.fn() }));
vi.mock("@/shell/shell-provider", () => ({ useShell: () => ({ toast: vi.fn() }) }));
vi.mock("@/server/socials-actions", () => ({ saveToken: vi.fn(), confirmInstagramSmoke: vi.fn(), disconnect: vi.fn(), saveTikTokCredentials: vi.fn() }));
vi.mock("@/server/settings-actions", () => ({ removeTokenAction: vi.fn(), saveTokenAction: vi.fn(), saveOpenRouterKeyAction: vi.fn() }));
vi.mock("@/server/outreach-actions", () => ({ removeEventKeyAction: vi.fn(), saveEventKeyAction: vi.fn() }));
describe("Social settings and palette", () => {
  it("renders Instagram verification and actual TikTok grants without secret props", () => {
    const connection = { status: "connected", last4: "1234", login: "owner", expiresAt: null, credentialGeneration: null, scopes: ["user.info.basic"], lastSyncError: null };
    const html = renderToStaticMarkup(createElement(SocialConnections, { connections: { linkedin: null, instagram: { ...connection, status: "verification_pending" }, tiktok: connection, tiktok_app: connection }, redirectUri: "https://lifeos.example/api/connections/tiktok/callback", result: null }));
    expect(html).toContain("VERIFICATION PENDING"); expect(html).toContain("disabled"); expect(html).toContain("Missing user.info.stats"); expect(html).toContain("Missing video.list"); expect(html).toContain("No connection needed: Markdown export");
    for (const id of ["linkedin", "instagram", "tiktok", "portfolio"]) expect(html).toContain(`id="social-${id}"`);
  });
  it("offers new-post navigation and title-search post hits", () => {
    expect(buildPalette("", {}).groups[0]!.items.find((i) => i.id === "cmd-new-post")?.run).toEqual({ type: "nav", href: "/socials?new=1" });
    const groups = buildPalette("build", { scope: "posts", data: { events: [], outreach: [], tasks: [], projects: [], posts: [{ id: "p", title: "Build log", href: "/socials?post=p", subtitle: "Social post" }] } }).groups;
    expect(groups[1]?.label).toBe("Posts"); expect(groups[1]?.items[0]?.label).toBe("Build log");
  });
});
