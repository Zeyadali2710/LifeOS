"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, IconButton } from "@/ui/button";
import { Avatar, CountBadge } from "@/ui/display";
import { Icon } from "@/ui/icon";
import { Menu } from "@/ui/overlay";
import type { MenuItem } from "@/ui/overlay";
import { useApprovalCount } from "./agent-status";
import { useLive } from "./live-provider";
import { MORE_ITEMS, NAV_ITEMS, TAB_KEYS, TABLET_KEYS, currentItem, isCurrent } from "./nav";
import { useShell } from "./shell-provider";
import s from "./shell.module.css";

export function Masthead({ owner, version }: { owner: { name: string; email: string }; version: string }) {
  const pathname = usePathname();
  const { openPalette, openAI, openNotifications, signOut, isApple } = useShell();
  const { unread } = useLive();
  const approvals = useApprovalCount();
  const mod = isApple ? "⌘" : "Ctrl ";
  const title = currentItem(pathname)?.label ?? "LifeOS";

  const tabletMore = NAV_ITEMS.filter((n) => !TABLET_KEYS.includes(n.key));
  const moreCurrent = [...MORE_ITEMS, ...tabletMore].some((n) => isCurrent(pathname, n.href));
  const moreItems = (tablet: boolean): MenuItem[] =>
    (tablet ? [...tabletMore, ...MORE_ITEMS] : MORE_ITEMS).map((n) => ({
      label: n.label,
      hint: n.shortcut?.replace("⌘", isApple ? "⌘" : "Ctrl+"),
      href: n.href,
      current: isCurrent(pathname, n.href),
    }));

  return (
    <header className={s.mast}>
      <div className={s.left}>
        <Link href="/" aria-label="LifeOS home" className={s.wordmark}>
          LifeOS
        </Link>
        <span className={s.mobileTitle} aria-hidden="true">
          {title}
        </span>
        <nav aria-label="Primary" className={s.nav}>
          {NAV_ITEMS.map((n) => (
            <Link
              key={n.key}
              href={n.href}
              aria-current={isCurrent(pathname, n.href) ? "page" : undefined}
              title={n.shortcut}
              className={[s.navItem, !TABLET_KEYS.includes(n.key) && s.desktopOnly].filter(Boolean).join(" ")}
            >
              {n.label}
              {n.key === "agents" && <CountBadge n={approvals} label={`${approvals} awaiting approval`} />}
            </Link>
          ))}
          {[false, true].map((tablet) => (
            <Menu
              key={String(tablet)}
              label="More"
              className={tablet ? s.tabletMore : s.desktopMore}
              items={moreItems(tablet)}
              trigger={(p) => (
                <button type="button" {...p} className={[s.navItem, s.navMoreGap, moreCurrent && s.current].filter(Boolean).join(" ")}>
                  More
                  <Icon name="expand_more" size={18} />
                </button>
              )}
            />
          ))}
        </nav>
      </div>
      <div className={s.right}>
        <button type="button" onClick={openPalette} className={s.searchBtn} aria-keyshortcuts={isApple ? "Meta+K" : "Control+K"}>
          Search or jump
          <span className={`${s.mono} kbd-hint`} data-hint={`${mod}K`} aria-hidden="true" />
        </button>
        <span className={s.searchIcon}>
          <IconButton icon="search" label="Search" onClick={openPalette} aria-keyshortcuts={isApple ? "Meta+K" : "Control+K"} />
        </span>
        <Button variant="primary" className={s.ask} onClick={() => openAI()} hint={`${mod}J`} aria-keyshortcuts={isApple ? "Meta+J" : "Control+J"}>
          Ask LifeOS
        </Button>
        <span className={s.bell}>
          <IconButton icon="notifications" label={`Notifications, ${unread} unread`} onClick={openNotifications} />
          {unread > 0 && (
            <span className={s.bellCount} aria-hidden="true">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </span>
        <Menu
          label="Account"
          align="right"
          className={s.avatarBtn}
          items={[
            { label: owner.email, hint: `v${version}`, href: "/settings" },
            "separator",
            { label: "Settings", hint: isApple ? "⌘," : "Ctrl+,", href: "/settings" },
            { label: "Sign out", onSelect: () => void signOut() },
          ]}
          trigger={(p) => (
            <button type="button" {...p} aria-label={`Account: ${owner.name}`} className={s.avatarBtn}>
              <Avatar name={owner.name} size={30} />
            </button>
          )}
        />
      </div>
    </header>
  );
}

export function TabBar() {
  const pathname = usePathname();
  const { moreOpen, setMoreOpen } = useShell();
  const approvals = useApprovalCount();
  const tabs = NAV_ITEMS.filter((n) => TAB_KEYS.includes(n.key));
  const inMore = !tabs.some((t) => isCurrent(pathname, t.href));
  return (
    <nav aria-label="Primary" className={s.tabbar}>
      {tabs.map((t) => {
        const cur = isCurrent(pathname, t.href);
        return (
          <Link key={t.key} href={t.href} aria-current={cur ? "page" : undefined} className={s.tab}>
            <Icon name={t.icon} size={22} fill={cur} />
            {t.label}
            {t.key === "agents" && approvals > 0 && (
              <span className={s.tabCount} aria-label={`${approvals} awaiting approval`}>
                {approvals}
              </span>
            )}
          </Link>
        );
      })}
      <button type="button" aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen(!moreOpen)} className={[s.tab, inMore && s.current].filter(Boolean).join(" ")}>
        <Icon name="menu" size={22} />
        More
      </button>
    </nav>
  );
}

export function MoreSheet({ version }: { version: string }) {
  const pathname = usePathname();
  const { moreOpen, setMoreOpen, signOut } = useShell();
  if (!moreOpen) return null;
  const items = [...NAV_ITEMS, ...MORE_ITEMS];
  return (
    <>
      <button type="button" aria-label="Close menu" className={s.scrim} onClick={() => setMoreOpen(false)} />
      <div role="menu" aria-label="More" className={s.sheet}>
        <span className={s.grip} aria-hidden="true" />
        {items.map((m) => (
          <Link key={m.key} role="menuitem" href={m.href} aria-current={isCurrent(pathname, m.href) ? "page" : undefined} className={s.sheetItem} onClick={() => setMoreOpen(false)}>
            {m.label}
          </Link>
        ))}
        <div className={s.sheetFoot}>
          <span>LifeOS v{version}</span>
          <Button variant="text" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </>
  );
}
