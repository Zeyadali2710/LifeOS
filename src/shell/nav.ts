import type { IconName } from "@/ui/icon-names";

export type NavItem = { key: string; label: string; href: string; icon: IconName; shortcut?: string };

export const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", href: "/", icon: "space_dashboard", shortcut: "Alt+1" },
  { key: "career", label: "Career", href: "/career", icon: "terminal", shortcut: "Alt+2" },
  { key: "socials", label: "Socials", href: "/socials", icon: "public", shortcut: "Alt+3" },
  { key: "outreach", label: "Outreach", href: "/outreach", icon: "hub", shortcut: "Alt+4" },
  { key: "organization", label: "Organization", href: "/organization", icon: "calendar_month", shortcut: "Alt+5" },
  { key: "projects", label: "Projects", href: "/projects", icon: "deployed_code", shortcut: "Alt+6" },
  { key: "knowledge", label: "Knowledge", href: "/knowledge", icon: "library_books", shortcut: "Alt+7" },
  { key: "goals", label: "Goals", href: "/goals", icon: "flag", shortcut: "Alt+8" },
  { key: "agents", label: "Agents", href: "/agents", icon: "memory", shortcut: "Alt+9" },
  { key: "finances", label: "Finances", href: "/finances", icon: "account_balance" },
];

export const SECONDARY_ITEMS: NavItem[] = [
  { key: "approvals", label: "Approvals", href: "/approvals", icon: "verified_user" },
  { key: "settings", label: "Settings", href: "/settings", icon: "tune", shortcut: "Ctrl+," },
];

const byKey = (...keys: string[]) =>
  keys.map((k) => [...NAV_ITEMS, ...SECONDARY_ITEMS].find((n) => n.key === k)!);

export const PRIMARY_ITEMS: NavItem[] = byKey("home", "career", "socials", "outreach", "organization", "finances", "projects", "agents", "approvals");
export const MORE_ITEMS: NavItem[] = byKey("knowledge", "goals", "settings");

export function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
