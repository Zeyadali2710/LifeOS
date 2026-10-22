import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildPalette } from "@/features/shell/palette-items";
import { SocialConnections } from "@/settings/social-connections";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/shell/live-provider", () => ({ useLiveEvents: vi.fn() }));
vi.mock("@/features/shell/shell-provider", () => ({ useShell: () => ({ toast: vi.fn() }) }));
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
    expect(buildPalette("", {})[0]!.items.find((i) => i.id === "cmd-new-post")?.run).toEqual({ type: "nav", href: "/socials?new=1" });
    const data = { events: [], outreach: [], tasks: [], projects: [], emails: [], people: [], notes: [], repos: [], agents: [], posts: [{ id: "p", title: "Build log", href: "/socials?post=p", subtitle: "Social post" }] };
    expect(buildPalette("build", { data }).find((g) => g.label === "Posts")?.items[0]?.label).toBe("Build log");
  });
});
