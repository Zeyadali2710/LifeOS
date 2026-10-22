import type { PaletteData, PaletteScope } from "@/lib/palette-types";
import type { IconName } from "@/ui/icon-names";
import { ALL_ITEMS, approvalsHref } from "./nav";

export type PaletteRun = { type: "nav"; href: string } | { type: "notifications" } | { type: "ai"; prompt?: string } | { type: "signout" };
export type PaletteItem = { id: string; label: string; icon: IconName; hint?: string; run: PaletteRun };
export type PaletteGroup = { label: string; items: PaletteItem[] };

export const SCOPE_LABEL: Record<PaletteScope, string> = {
  all: "All", projects: "Projects", tasks: "Tasks", events: "Events", emails: "Emails", people: "People", notes: "Notes", github: "GitHub", agents: "Agents",
};

const HITS: { scope: PaletteScope; key: keyof PaletteData; label: string; icon: IconName }[] = [
  { scope: "projects", key: "projects", label: "Projects", icon: "deployed_code" },
  { scope: "tasks", key: "tasks", label: "Tasks", icon: "task_alt" },
  { scope: "events", key: "events", label: "Events", icon: "event" },
  { scope: "events", key: "outreach", label: "Outreach events", icon: "travel_explore" },
  { scope: "emails", key: "emails", label: "Emails", icon: "mail" },
  { scope: "people", key: "people", label: "People", icon: "person" },
  { scope: "notes", key: "notes", label: "Notes", icon: "description" },
  { scope: "github", key: "repos", label: "GitHub", icon: "code" },
  { scope: "agents", key: "agents", label: "Agents", icon: "smart_toy" },
  { scope: "all", key: "posts", label: "Posts", icon: "public" }, // only in All
];

/** Pure: the palette's groups for a query + scope. The "Ask LifeOS: …" row leads whenever there is a query. */
export function buildPalette(query: string, opts: { approvalsWaiting?: number; data?: PaletteData; scope?: PaletteScope; mod?: string }): PaletteGroup[] {
  const mod = opts.mod ?? "Ctrl ";
  const commands: PaletteItem[] = [
    { id: "cmd-new-task", label: "New task", icon: "add_task", hint: "T", run: { type: "nav", href: "/organization?new=task" } },
    { id: "cmd-new-post", label: "New post", icon: "edit_square", hint: "N", run: { type: "nav", href: "/socials?new=1" } },
    { id: "cmd-import", label: "Import CSV", icon: "upload", run: { type: "nav", href: "/finances?import=1" } },
    { id: "cmd-briefing", label: "Build a briefing now", icon: "event_note", run: { type: "nav", href: "/briefings" } },
    { id: "cmd-approvals", label: "Open approvals", icon: "pending_actions", hint: `${opts.approvalsWaiting ?? 0} waiting`, run: { type: "nav", href: approvalsHref() } },
    { id: "cmd-new-project", label: "New project", icon: "add", run: { type: "nav", href: "/projects?new=project" } },
    { id: "cmd-new-event", label: "New event", icon: "add", run: { type: "nav", href: "/organization?new=event" } },
    { id: "cmd-import-event", label: "Import event URL", icon: "travel_explore", run: { type: "nav", href: "/outreach?tab=discover&import=1" } },
    { id: "cmd-notifications", label: "Open notifications", icon: "notifications", run: { type: "notifications" } },
    { id: "cmd-pause", label: "Pause all agents", icon: "pause_circle", run: { type: "nav", href: "/agents?view=table&pause=1" } },
    { id: "cmd-signout", label: "Sign out", icon: "logout", run: { type: "signout" } },
  ];
  const jump: PaletteItem[] = ALL_ITEMS.map((n) => ({
    id: `nav-${n.key}`,
    label: n.label,
    icon: "arrow_forward",
    hint: n.shortcut?.replace("⌘", mod.trim() === "⌘" ? "⌘" : "Ctrl+"),
    run: { type: "nav", href: n.href },
  }));

  const q = query.trim();
  const needle = q.toLowerCase();
  const scope = opts.scope ?? "all";
  const groups: PaletteGroup[] = [];
  if (q && scope === "all") groups.push({ label: "Ask", items: [{ id: "ask", label: `Ask LifeOS: “${q}”`, icon: "auto_awesome", hint: `${mod}J`, run: { type: "ai", prompt: q } }] });
  if (scope === "all") {
    const pick = (items: PaletteItem[]) => (q ? items.filter((i) => i.label.toLowerCase().includes(needle)).slice(0, 4) : items.slice(0, 5));
    groups.push({ label: "Commands", items: pick(commands) });
    groups.push({ label: "Jump to", items: q ? pick(jump) : jump });
  }
  for (const h of HITS) {
    if (scope !== "all" && scope !== h.scope) continue;
    const list = opts.data?.[h.key] ?? [];
    groups.push({
      label: h.label,
      items: list.slice(0, scope === "all" ? 4 : 12).map((x) => ({ id: `${h.key}-${x.id}`, label: x.title, icon: h.icon, hint: x.subtitle, run: { type: "nav", href: x.href } })),
    });
  }
  return groups.filter((g) => g.items.length > 0);
}
