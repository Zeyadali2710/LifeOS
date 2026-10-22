import { describe, expect, it } from "vitest";
import type { PaletteData } from "@/lib/palette-types";
import { buildPalette } from "@/features/shell/palette-items";

const empty: PaletteData = { events: [], outreach: [], tasks: [], projects: [], posts: [], emails: [], people: [], notes: [], repos: [], agents: [] };
const hit = (n: number, title = `Gym ${n}`) => ({ id: `h${n}`, title, subtitle: "Thu 8 Oct 18:00 · Work", href: `/x${n}` });

describe("buildPalette", () => {
  it("empty query: five commands then every route", () => {
    const groups = buildPalette("", {});
    expect(groups.map((g) => g.label)).toEqual(["Commands", "Jump to"]);
    expect(groups[0]!.items.map((i) => i.label)).toEqual(["New task", "New post", "Import CSV", "Build a briefing now", "Open approvals"]);
    expect(groups[0]!.items[4]!.hint).toBe("0 waiting");
    expect(groups[1]!.items.map((i) => i.label)).toEqual(["Home", "Agents", "Projects", "Organization", "Outreach", "Socials", "Finances", "Career", "Knowledge", "Goals", "Briefings", "Automations", "Settings"]);
    expect(groups[1]!.items[1]!.hint).toBe("Alt+2");
    expect(groups[1]!.items.at(-1)!.hint).toBe("Ctrl+,");
  });

  it("approvals hint carries the live count and opens the Agents Approvals tab", () => {
    const cmd = buildPalette("", { approvalsWaiting: 3 })[0]!.items.find((i) => i.id === "cmd-approvals")!;
    expect(cmd.hint).toBe("3 waiting");
    expect(cmd.run).toEqual({ type: "nav", href: "/agents?view=approvals" });
  });

  it("a query leads with the Ask row and filters case-insensitively", () => {
    const groups = buildPalette("CAR", {});
    expect(groups[0]).toMatchObject({ label: "Ask", items: [{ label: "Ask LifeOS: “CAR”", run: { type: "ai", prompt: "CAR" } }] });
    expect(groups.some((g) => g.items.some((i) => i.label === "Career"))).toBe(true);
  });

  it("All caps hit groups at 4; a single scope lists up to 12 and drops commands and the Ask row", () => {
    const data = { ...empty, events: Array.from({ length: 14 }, (_, i) => hit(i)), tasks: [hit(99)], projects: [hit(7)], posts: [hit(5, "Gym post")] };
    const all = buildPalette("gym", { data });
    expect(all.map((g) => g.label)).toEqual(["Ask", "Projects", "Tasks", "Events", "Posts"]);
    expect(all.find((g) => g.label === "Events")!.items).toHaveLength(4);
    const events = buildPalette("gym", { data, scope: "events" });
    expect(events.map((g) => g.label)).toEqual(["Events"]);
    expect(events[0]!.items).toHaveLength(12);
    expect(events[0]!.items[0]!.run).toEqual({ type: "nav", href: "/x0" });
  });

  it("new scopes map to their groups", () => {
    const data = { ...empty, emails: [hit(1, "Panel invite")], people: [hit(2, "Jordan Lee")], notes: [hit(3, "Pricing")], repos: [hit(4, "me/lifeos")], agents: [hit(5, "Outreach")] };
    expect(buildPalette("", { data, scope: "emails" }).map((g) => g.label)).toEqual(["Emails"]);
    expect(buildPalette("", { data, scope: "people" })[0]!.items[0]!.label).toBe("Jordan Lee");
    expect(buildPalette("", { data, scope: "notes" })[0]!.label).toBe("Notes");
    expect(buildPalette("", { data, scope: "github" })[0]!.label).toBe("GitHub");
    expect(buildPalette("", { data, scope: "agents" })[0]!.label).toBe("Agents");
  });

  it("creation commands keep their routes", () => {
    const cmds = buildPalette("new", {}).flatMap((g) => g.items);
    expect(cmds.find((i) => i.id === "cmd-new-task")!.run).toEqual({ type: "nav", href: "/organization?new=task" });
    expect(cmds.find((i) => i.id === "cmd-new-project")!.run).toEqual({ type: "nav", href: "/projects?new=project" });
    expect(cmds.find((i) => i.id === "cmd-new-post")!.run).toEqual({ type: "nav", href: "/socials?new=1" });
  });

  it("no match leaves only the Ask group", () => {
    expect(buildPalette("zzzz", {}).map((g) => g.label)).toEqual(["Ask"]);
  });
});
