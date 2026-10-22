import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildPalette } from "@/features/shell/palette-items";
import { SocialConnections } from "@/features/settings/social-connections";
import { SettingsNav } from "@/features/settings/settings-nav";
import { ConnectionRow } from "@/features/settings/connection-row";
import { SpendSection } from "@/features/settings/spend-section";
import { FreePrivacy } from "@/features/settings/free-privacy";
import { OutreachSection } from "@/features/settings/outreach-section";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/shell/live-provider", () => ({ useLiveEvents: vi.fn() }));
vi.mock("@/features/shell/shell-provider", () => ({ useShell: () => ({ toast: vi.fn() }) }));
vi.mock("@/server/socials-actions", () => ({ saveToken: vi.fn(), confirmInstagramSmoke: vi.fn(), disconnect: vi.fn(), saveTikTokCredentials: vi.fn() }));
vi.mock("@/server/settings-actions", () => ({ removeTokenAction: vi.fn(), saveTokenAction: vi.fn(), saveOpenRouterKeyAction: vi.fn() }));
vi.mock("@/server/outreach-actions", () => ({ removeEventKeyAction: vi.fn(), saveEventKeyAction: vi.fn() }));
describe("Social settings and palette", () => {
  it.each([false, true])("describes the current free-model privacy setting (%s)", (value) => {
    const html = renderToStaticMarkup(createElement(FreePrivacy, { value }));
    expect(html).toContain(value ? "On: free models may receive" : "Off: any run that touches");
    expect(html).toContain("Free providers may log or train on prompts.");
    expect(html).not.toContain(value ? "Off: any run that touches" : "On: free models may receive");
  });
  it("keeps long interest chips readable and their removal controls labelled", () => {
    const interest = "W".repeat(40);
    const html = renderToStaticMarkup(createElement(OutreachSection, { interests: [interest] }));
    expect(html).toContain(`title="${interest}"`);
    expect(html).toContain(`aria-label="Remove ${interest}"`);
    expect(html).toContain("/settings?section=connections#event-feeds");
  });
  it("shows real model turns, token details and the free-model privacy boundary", () => {
    const html = renderToStaticMarkup(createElement(SpendSection, {
      mtdUsd: 4.12, capUsd: 20, monthLabel: "October", resetLabel: "1 Nov", freePrivateOk: false,
      rows: [{ model: "sonnet", label: "Sonnet", turns: 188, input: 1000, output: 500, cache: 200, costUsd: 4.12 }],
    }));
    expect(html).toContain("188");
    expect(html).toContain("turns");
    expect(html).toContain("Token usage details");
    expect(html).toContain("Mail, finance and knowledge data never reach a free model");
    const inputId = /<input id="([^"]+)"[^>]*type="number"/.exec(html)?.[1];
    expect(inputId).toBeTruthy();
    expect(html).toContain(`for="${inputId}"`);
  });
  it("keeps all four section deep links and marks the current section", () => {
    const html = renderToStaticMarkup(createElement(SettingsNav, { current: "ai" }));
    for (const section of ["connections", "ai", "outreach", "briefings"]) {
      expect(html).toContain(`href="/settings?section=${section}"`);
    }
    expect(html).toMatch(/aria-current="page"[^>]*>AI and spend/);
  });
  it.each([
    ["none", "Connect", "NOT CONNECTED"],
    ["connected", "Manage", "CONNECTED"],
    ["error", "Reconnect", "RECONNECT"],
  ] as const)("offers the appropriate action for %s connections", (status, action, label) => {
    const html = renderToStaticMarkup(createElement(ConnectionRow, { id: "linkedin", name: "LinkedIn", detail: "Owner account", status }));
    expect(html).toContain(`>${action}</button>`);
    expect(html).toContain(label);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('type="password"');
  });
  it("keeps manual connections free of credential controls", () => {
    const html = renderToStaticMarkup(createElement(ConnectionRow, { name: "Portfolio", detail: "Markdown export", status: "none", statusLabel: "MANUAL", readOnly: true }));
    expect(html).toContain("MANUAL");
    expect(html).not.toContain("<button");
  });
  it("renders Instagram verification and actual TikTok grants without secret props", () => {
    const connection = { status: "connected", last4: "1234", login: "owner", expiresAt: null, credentialGeneration: null, scopes: ["user.info.basic"], lastSyncError: null };
    const html = renderToStaticMarkup(createElement(SocialConnections, { connections: { linkedin: null, instagram: { ...connection, status: "verification_pending" }, tiktok: connection, tiktok_app: connection }, redirectUri: "https://lifeos.example/api/connections/tiktok/callback", result: null }));
    expect(html).toContain("VERIFICATION PENDING"); expect(html).toContain("disabled"); expect(html).toContain("Missing user.info.stats"); expect(html).toContain("Missing video.list"); expect(html).toContain("No connection needed: Markdown export");
    expect(html).toMatch(/Missing user.info.stats<\/span><p[^>]*>Account statistics/);
    expect(html).toMatch(/Missing video.list<\/span><p[^>]*>Video metrics/);
    for (const id of ["linkedin", "instagram", "tiktok", "portfolio"]) expect(html).toContain(`id="social-${id}"`);
  });
  it("offers new-post navigation and title-search post hits", () => {
    expect(buildPalette("", {})[0]!.items.find((i) => i.id === "cmd-new-post")?.run).toEqual({ type: "nav", href: "/socials?new=1" });
    const data = { events: [], outreach: [], tasks: [], projects: [], emails: [], people: [], notes: [], repos: [], agents: [], posts: [{ id: "p", title: "Build log", href: "/socials?post=p", subtitle: "Social post" }] };
    expect(buildPalette("build", { data }).find((g) => g.label === "Posts")?.items[0]?.label).toBe("Build log");
  });
});
