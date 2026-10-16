import { describe, expect, it } from "vitest";
import { buildPalette } from "@/shell/palette-items";

describe("buildPalette", () => {
  it("empty query: Commands then Jump to", () => {
    const { groups, noMatch } = buildPalette("", {});
    expect(groups.map((g) => g.label)).toEqual(["Commands", "Jump to"]);
    expect(noMatch).toBe(false);
    const cmds = groups[0]!.items;
    expect(cmds.map((i) => i.label)).toEqual(["Open notifications", "Open approvals", "View agent activity", "New event", "New task", "New project", "New post", "Import event URL", "Ask LifeOS", "Sign out"]);
    expect(cmds[1]!.hint).toBe("0 waiting");
    expect(cmds[8]!.hint).toBe("Ctrl J");
    const jump = groups[1]!.items;
    expect(jump.map((i) => i.label)).toEqual(["Home", "Career", "Socials", "Outreach", "Organization", "Projects", "Knowledge", "Goals", "Agents", "Finances", "Approvals", "Briefings", "Automations", "Settings"]);
    expect(jump[0]!.hint).toBe("Alt 1");
    expect(jump[8]!.hint).toBe("Alt 9");
    expect(jump.find((i) => i.label === "Settings")!.hint).toBe("Ctrl ,");
  });

  it("approvals hint carries the live count", () => {
    const cmds = buildPalette("", { approvalsWaiting: 3 }).groups[0]!.items;
    expect(cmds[1]!.hint).toBe("3 waiting");
  });


  it("query adds Ask row first and filters case-insensitively", () => {
    const { groups, noMatch } = buildPalette("CAR", {});
    expect(groups[0]!.label).toBe("Ask LifeOS");
    expect(groups[0]!.items).toHaveLength(1);
    expect(groups[0]!.items[0]!.label).toBe('Ask LifeOS: "CAR"');
    expect(groups[0]!.items[0]!.run).toEqual({ type: "ai", prompt: "CAR" });
    expect(groups.some((g) => g.items.some((i) => i.label === "Career"))).toBe(true);
    expect(noMatch).toBe(false);
  });

  it("caps groups at 4 items", () => {
    const { groups } = buildPalette("o", {});
    for (const g of groups.slice(1)) expect(g.items.length).toBeLessThanOrEqual(4);
  });

  it("data adds Events and Tasks groups, capped at 4, and scope narrows them", () => {
    const hit = (n: number) => ({ id: `h${n}`, title: `Gym ${n}`, subtitle: "Thu 8 Oct 18:00 · Work", href: `/x${n}` });
    const data = { events: [1, 2, 3, 4, 5].map(hit), outreach: [], tasks: [hit(9)], projects: [hit(7)] };
    const all = buildPalette("gym", { data });
    expect(all.groups.map((g) => g.label)).toEqual(["Ask LifeOS", "Events", "Tasks", "Projects"]);
    expect(buildPalette("gym", { data, scope: "projects" }).groups.map((g) => g.label)).toEqual(["Ask LifeOS", "Projects"]);
    expect(buildPalette("gym", { data, scope: "events" }).groups.map((g) => g.label)).toEqual(["Ask LifeOS", "Events"]);
    expect(all.groups[1]!.items).toHaveLength(4);
    expect(all.groups[1]!.items[0]!.run).toEqual({ type: "nav", href: "/x1" });
    expect(buildPalette("gym", { data, scope: "tasks" }).groups.map((g) => g.label)).toEqual(["Ask LifeOS", "Tasks"]);
    expect(buildPalette("gym", { data }).noMatch).toBe(false);
  });

  it("creation commands navigate to the organization page", () => {
    const cmds = buildPalette("", {}).groups[0]!.items;
    expect(cmds.find((i) => i.id === "cmd-new-event")!.run).toEqual({ type: "nav", href: "/organization?new=event" });
    expect(cmds.find((i) => i.id === "cmd-new-task")!.run).toEqual({ type: "nav", href: "/organization?new=task" });
    expect(cmds.find((i) => i.id === "cmd-new-project")!.run).toEqual({ type: "nav", href: "/projects?new=project" });
  });

  it("Import event URL command and a distinct Outreach events scope", () => {
    const cmds = buildPalette("", {}).groups[0]!.items;
    expect(cmds.find((i) => i.id === "cmd-import-event")).toMatchObject({ label: "Import event URL", run: { type: "nav", href: "/outreach?import=1" } });
    const hit = { id: "e1", title: "AI Night", subtitle: "Tue 20 Oct � Saved � Mock", href: "/outreach/events/e1" };
    const data = { events: [{ ...hit, id: "c1", href: "/organization" }], outreach: [hit], tasks: [], projects: [] };
    const all = buildPalette("night", { data });
    expect(all.groups.map((g) => g.label)).toEqual(["Ask LifeOS", "Events", "Outreach events"]);
    const only = buildPalette("night", { data, scope: "outreach" });
    expect(only.groups.map((g) => g.label)).toEqual(["Ask LifeOS", "Outreach events"]);
    expect(only.groups[1]!.items[0]).toMatchObject({ label: "AI Night", hint: "Tue 20 Oct � Saved � Mock", run: { type: "nav", href: "/outreach/events/e1" } });
  });

  it("no match leaves only the Ask group", () => {
    const { groups, noMatch } = buildPalette("zzzz", {});
    expect(groups.map((g) => g.label)).toEqual(["Ask LifeOS"]);
    expect(noMatch).toBe(true);
  });
});
