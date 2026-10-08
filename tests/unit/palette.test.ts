import { describe, expect, it } from "vitest";
import { buildPalette } from "@/shell/palette-items";

describe("buildPalette", () => {
  it("empty query: Commands then Jump to", () => {
    const { groups, noMatch } = buildPalette("", { wide: true });
    expect(groups.map((g) => g.label)).toEqual(["Commands", "Jump to"]);
    expect(noMatch).toBe(false);
    const cmds = groups[0]!.items;
    expect(cmds.map((i) => i.label)).toEqual(["Open notifications", "Open approvals", "View agent activity", "Ask LifeOS", "Toggle compact sidebar", "Sign out"]);
    expect(cmds[1]!.hint).toBe("0 waiting");
    expect(cmds[3]!.hint).toBe("Ctrl J");
    expect(cmds[4]!.hint).toBe("Ctrl \\");
    const jump = groups[1]!.items;
    expect(jump.map((i) => i.label)).toEqual(["Home", "Career", "Socials", "Outreach", "Organization", "Projects", "Knowledge", "Goals", "Agents", "Approvals", "Settings"]);
    expect(jump[0]!.hint).toBe("Alt 1");
    expect(jump[8]!.hint).toBe("Alt 9");
    expect(jump[10]!.hint).toBe("Ctrl ,");
  });

  it("approvals hint carries the live count", () => {
    const cmds = buildPalette("", { wide: true, approvalsWaiting: 3 }).groups[0]!.items;
    expect(cmds[1]!.hint).toBe("3 waiting");
  });

  it("narrow omits compact toggle", () => {
    const labels = buildPalette("", { wide: false }).groups[0]!.items.map((i) => i.label);
    expect(labels).not.toContain("Toggle compact sidebar");
  });

  it("query adds Ask row first and filters case-insensitively", () => {
    const { groups, noMatch } = buildPalette("CAR", { wide: true });
    expect(groups[0]!.label).toBe("Ask LifeOS");
    expect(groups[0]!.items).toHaveLength(1);
    expect(groups[0]!.items[0]!.label).toBe('Ask LifeOS: "CAR"');
    expect(groups[0]!.items[0]!.run).toEqual({ type: "ai", prompt: "CAR" });
    expect(groups.some((g) => g.items.some((i) => i.label === "Career"))).toBe(true);
    expect(noMatch).toBe(false);
  });

  it("caps groups at 4 items", () => {
    const { groups } = buildPalette("o", { wide: true });
    for (const g of groups.slice(1)) expect(g.items.length).toBeLessThanOrEqual(4);
  });

  it("no match leaves only the Ask group", () => {
    const { groups, noMatch } = buildPalette("zzzz", { wide: true });
    expect(groups.map((g) => g.label)).toEqual(["Ask LifeOS"]);
    expect(noMatch).toBe(true);
  });
});
