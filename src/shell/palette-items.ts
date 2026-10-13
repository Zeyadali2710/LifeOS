import type { IconName } from "@/ui/icon-names";
import { NAV_ITEMS, SECONDARY_ITEMS } from "./nav";

export type PaletteRun =
  | { type: "nav"; href: string }
  | { type: "notifications" }
  | { type: "ai"; prompt?: string }
  | { type: "signout" };

export type PaletteItem = { id: string; label: string; icon: IconName; hint?: string; run: PaletteRun };
export type PaletteGroup = { label: "Ask LifeOS" | "Commands" | "Jump to" | "Events" | "Outreach events" | "Tasks" | "Projects"; items: PaletteItem[] };
export type PaletteHit = { id: string; title: string; subtitle: string; href: string };
export type PaletteData = { events: PaletteHit[]; outreach: PaletteHit[]; tasks: PaletteHit[]; projects: PaletteHit[] };
export type PaletteScope = "all" | "events" | "outreach" | "tasks" | "projects";

const spaced = (s?: string) => s?.replace("+", " ");

export function buildPalette(query: string, opts: { approvalsWaiting?: number; data?: PaletteData; scope?: PaletteScope }): { groups: PaletteGroup[]; noMatch: boolean } {
  const commands: PaletteItem[] = [
    { id: "cmd-notifications", label: "Open notifications", icon: "notifications", run: { type: "notifications" } },
    { id: "cmd-approvals", label: "Open approvals", icon: "verified_user", hint: `${opts.approvalsWaiting ?? 0} waiting`, run: { type: "nav", href: "/approvals" } },
    { id: "cmd-agents", label: "View agent activity", icon: "memory", run: { type: "nav", href: "/agents" } },
    { id: "cmd-new-event", label: "New event", icon: "add", run: { type: "nav", href: "/organization?new=event" } },
    { id: "cmd-new-task", label: "New task", icon: "task_alt", run: { type: "nav", href: "/organization?new=task" } },
    { id: "cmd-new-project", label: "New project", icon: "add", run: { type: "nav", href: "/projects?new=project" } },
    { id: "cmd-import-event", label: "Import event URL", icon: "travel_explore", run: { type: "nav", href: "/outreach?import=1" } },
    { id: "cmd-ai", label: "Ask LifeOS", icon: "auto_awesome", hint: "Ctrl J", run: { type: "ai" } },
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
  const hits = (label: "Events" | "Outreach events" | "Tasks" | "Projects", icon: IconName, list: PaletteHit[] = []): PaletteGroup => ({
    label,
    items: list.slice(0, 4).map((h) => ({ id: `${label}-${h.id}`, label: h.title, icon, hint: h.subtitle, run: { type: "nav", href: h.href } })),
  });
  const scope = opts.scope ?? "all";
  const filtered: PaletteGroup[] = [
    ...(scope === "all" ? [{ label: "Commands" as const, items: pick(commands) }, { label: "Jump to" as const, items: pick(jump) }] : []),
    ...(scope === "all" || scope === "events" ? [hits("Events", "event", opts.data?.events)] : []),
    ...(scope === "all" || scope === "outreach" ? [hits("Outreach events", "travel_explore", opts.data?.outreach)] : []),
    ...(scope === "all" || scope === "tasks" ? [hits("Tasks", "task_alt", opts.data?.tasks)] : []),
    ...(scope === "all" || scope === "projects" ? [hits("Projects", "deployed_code", opts.data?.projects)] : []),
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
