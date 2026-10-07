import type { IconName } from "@/ui/icon-names";
import { NAV_ITEMS, SECONDARY_ITEMS } from "./nav";

export type PaletteRun =
  | { type: "nav"; href: string }
  | { type: "notifications" }
  | { type: "ai"; prompt?: string }
  | { type: "compact" }
  | { type: "signout" };

export type PaletteItem = { id: string; label: string; icon: IconName; hint?: string; run: PaletteRun };
export type PaletteGroup = { label: "Ask LifeOS" | "Commands" | "Jump to"; items: PaletteItem[] };

const spaced = (s?: string) => s?.replace("+", " ");

export function buildPalette(query: string, opts: { wide: boolean }): { groups: PaletteGroup[]; noMatch: boolean } {
  const commands: PaletteItem[] = [
    { id: "cmd-notifications", label: "Open notifications", icon: "notifications", run: { type: "notifications" } },
    { id: "cmd-ai", label: "Ask LifeOS", icon: "auto_awesome", hint: "Ctrl J", run: { type: "ai" } },
    ...(opts.wide
      ? [{ id: "cmd-compact", label: "Toggle compact sidebar", icon: "left_panel_close", hint: "Ctrl \\", run: { type: "compact" } } satisfies PaletteItem]
      : []),
    { id: "cmd-signout", label: "Sign out", icon: "logout", run: { type: "signout" } },
  ];
  const jump: PaletteItem[] = [...NAV_ITEMS, ...SECONDARY_ITEMS].map((n) => ({
    id: `nav-${n.key}`,
    label: n.label,
    icon: n.icon,
    hint: spaced(n.shortcut),
    run: { type: "nav", href: n.href },
  }));

  const q = query.trim();
  if (!q) {
    return {
      groups: [
        { label: "Commands", items: commands },
        { label: "Jump to", items: jump },
      ],
      noMatch: false,
    };
  }
  const needle = q.toLowerCase();
  const pick = (items: PaletteItem[]) => items.filter((i) => i.label.toLowerCase().includes(needle)).slice(0, 4);
  const filtered: PaletteGroup[] = [
    { label: "Commands" as const, items: pick(commands) },
    { label: "Jump to" as const, items: pick(jump) },
  ].filter((g) => g.items.length > 0);
  return {
    groups: [
      {
        label: "Ask LifeOS",
        items: [{ id: "ask", label: `Ask LifeOS: "${q}"`, icon: "auto_awesome", hint: "assistant", run: { type: "ai", prompt: q } }],
      },
      ...filtered,
    ],
    noMatch: filtered.length === 0,
  };
}
