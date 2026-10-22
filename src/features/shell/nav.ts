import type { IconName } from "@/ui/icon-names";

export type NavItem = { key: string; label: string; href: string; icon: IconName; shortcut?: string };

/** Masthead routes in order; Alt+1…8 follow this order. */
export const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", href: "/", icon: "home", shortcut: "Alt+1" },
  { key: "agents", label: "Agents", href: "/agents", icon: "smart_toy", shortcut: "Alt+2" },
  { key: "projects", label: "Projects", href: "/projects", icon: "deployed_code", shortcut: "Alt+3" },
  { key: "organization", label: "Organization", href: "/organization", icon: "calendar_month", shortcut: "Alt+4" },
  { key: "outreach", label: "Outreach", href: "/outreach", icon: "mail", shortcut: "Alt+5" },
  { key: "socials", label: "Socials", href: "/socials", icon: "public", shortcut: "Alt+6" },
  { key: "finances", label: "Finances", href: "/finances", icon: "savings", shortcut: "Alt+7" },
  { key: "career", label: "Career", href: "/career", icon: "code", shortcut: "Alt+8" },
];

export const MORE_ITEMS: NavItem[] = [
  { key: "knowledge", label: "Knowledge", href: "/knowledge", icon: "description" },
  { key: "goals", label: "Goals", href: "/goals", icon: "flag" },
  { key: "briefings", label: "Briefings", href: "/briefings", icon: "event_note" },
  { key: "automations", label: "Automations", href: "/automations", icon: "bolt" },
  { key: "settings", label: "Settings", href: "/settings", icon: "settings", shortcut: "⌘," },
];

/** Tablet masthead keeps these five; the rest move into More. */
export const TABLET_KEYS = ["home", "agents", "projects", "outreach", "socials"];

/** Mobile tab bar (plus a More sheet). */
export const TAB_KEYS = ["home", "agents", "outreach", "socials"];

export const ALL_ITEMS = [...NAV_ITEMS, ...MORE_ITEMS];

export function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function currentItem(pathname: string): NavItem | undefined {
  return ALL_ITEMS.find((n) => isCurrent(pathname, n.href));
}

/** Every "open in Approvals" link: the Approvals inbox lives inside Agents. */
export function approvalsHref(id?: string | null) {
  return `/agents?view=approvals${id ? `&id=${encodeURIComponent(id)}` : ""}`;
}
