"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";
import { useAgentStatus } from "./use-agent-status";
import { useLive } from "./live-provider";
import { isCurrent, NAV_ITEMS, SECONDARY_ITEMS } from "./nav";
import type { NavItem } from "./nav";
import { useShell } from "./shell-provider";

function cap(n: number) {
  return n > 99 ? "99+" : String(n);
}

function Item({
  item,
  current,
  compact,
  badge,
  badgeTone,
  label,
  hint,
  onClick,
  popup,
}: {
  item: Pick<NavItem, "key" | "label" | "href" | "icon">;
  current: boolean;
  compact: boolean;
  badge: number;
  badgeTone: "neutral" | "amber";
  label: string;
  hint?: string;
  onClick?: () => void;
  popup?: boolean;
}) {
  const lab = compact ? "hidden" : "hidden desk:inline";
  const cls = `group relative flex items-center rounded-8 border text-[13.5px] transition-colors duration-[120ms] w-11 h-11 mx-auto justify-center ${
    compact ? "" : "desk:mx-0 desk:h-9 desk:w-full desk:justify-start desk:gap-[11px] desk:px-[10px]"
  } ${current ? "border-[rgba(139,140,255,.18)] bg-[rgba(139,140,255,.10)] text-text" : "border-transparent text-text-2 hover:text-text"}`;
  const tone = badgeTone === "amber" ? "bg-amber text-[#0b0c10]" : "bg-[rgba(255,255,255,.12)] text-text";
  const tipId = `tip-${item.key}`;
  const inner: ReactNode = (
    <>
      <Icon name={item.icon as IconName} size={19} fill={current} className={`w-5 text-center ${current ? "text-[#a5a6ff]" : "text-text-3"}`} />
      <span className={`${lab} flex-1 text-left whitespace-nowrap`}>{item.label}</span>
      {badge > 0 && (
        <>
          <span className={`${compact ? "hidden" : "hidden desk:inline"} rounded-full px-1.5 py-0.5 font-mono text-[10.5px] font-medium ${tone}`}>{cap(badge)}</span>
          <span aria-hidden="true" className={`absolute top-[7px] left-[26px] size-1.5 rounded-full ${tone.split(" ")[0]} ${compact ? "" : "desk:hidden"}`} />
        </>
      )}
      <span
        id={tipId}
        role="tooltip"
        className={`pointer-events-none absolute top-1/2 left-[calc(100%+12px)] z-50 hidden -translate-y-1/2 items-center gap-2.5 rounded-8 border border-[rgba(255,255,255,.10)] bg-raised px-2.5 py-[7px] text-[12.5px] whitespace-nowrap text-text shadow-tooltip group-hover:flex group-focus-visible:flex ${
          compact ? "" : "desk:group-hover:hidden! desk:group-focus-visible:hidden!"
        }`}
      >
        {item.label}
        {hint && <span className="font-mono text-[10.5px] text-text-3">{hint}</span>}
      </span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-haspopup={popup ? "dialog" : undefined} aria-label={label} aria-describedby={tipId} className={cls}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={item.href} aria-current={current ? "page" : undefined} aria-label={badge > 0 || label !== item.label ? label : undefined} aria-describedby={tipId} className={cls}>
      {inner}
    </Link>
  );
}

export function Sidebar({ version }: { version: string }) {
  const pathname = usePathname();
  const { compact, toggleCompact, notifOpen, openNotifications, isApple } = useShell();
  const { unread, health, connected, loaded } = useLive();
  const { status } = useAgentStatus();
  const waiting = status?.approvalsWaiting ?? 0;
  const ai = {
    ready: { text: "AI READY", dot: "bg-green" },
    working: { text: "AI WORKING", dot: "bg-[#8b8cff] animate-[lo-pulse_2s_ease-out_infinite]" },
    paused: { text: "AI PAUSED", dot: "bg-amber" },
    cap: { text: "AI PAUSED", dot: "bg-amber" },
    no_key: { text: "AI NOT CONNECTED", dot: "border border-[#80849a]" },
  }[status?.assistant ?? "no_key"];
  const lab = compact ? "hidden" : "hidden desk:block";
  const mod = isApple ? "⌘\\" : "Ctrl+\\";

  let healthRow: { text: string; dot: string; pulse: boolean };
  if (loaded && !connected) healthRow = { text: "RECONNECTING", dot: "bg-amber", pulse: false };
  else if (health?.status === "down") healthRow = { text: "LIFEOS OFFLINE", dot: "bg-red", pulse: false };
  else if (health?.status === "degraded") healthRow = { text: "LIFEOS DEGRADED", dot: "bg-amber", pulse: false };
  else healthRow = { text: "LIFEOS ONLINE", dot: "bg-green", pulse: true };

  return (
    <aside
      aria-label="Primary"
      className={`hidden shrink-0 flex-col border-r border-[rgba(255,255,255,.06)] bg-[rgba(11,12,16,.6)] transition-[width] duration-[180ms] ease-out tab:flex tab:w-[68px] ${compact ? "desk:w-16" : "desk:w-[232px]"}`}
    >
      <div className={`flex h-14 shrink-0 items-center gap-2.5 px-3 ${compact ? "justify-center" : "justify-center desk:justify-start desk:px-4"}`}>
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-7 bg-[linear-gradient(140deg,#8b8cff,#5b5cd6)] shadow-[0_0_18px_rgba(139,140,255,.35)]"
        >
          <span className="size-2 rounded-full bg-[#0b0c10]" />
        </span>
        <div className={`${lab} min-w-0 flex-1`}>
          <div className="text-[15px] leading-none font-semibold tracking-[-0.01em]">LifeOS</div>
          <div className="mt-1 font-mono text-[10px] leading-none text-text-3">{version}</div>
        </div>
        {!compact && (
          <button
            type="button"
            onClick={toggleCompact}
            aria-label="Collapse sidebar"
            aria-keyshortcuts="Control+\"
            title={`Collapse sidebar (${mod})`}
            className="hidden size-7 place-items-center rounded-7 text-text-3 hover:bg-fill-2 hover:text-text desk:grid"
          >
            <Icon name="left_panel_close" size={18} />
          </button>
        )}
      </div>
      {compact && (
        <button
          type="button"
          onClick={toggleCompact}
          aria-label="Expand sidebar"
          aria-keyshortcuts="Control+\"
          title={`Expand sidebar (${mod})`}
          className="mx-auto mb-1 hidden h-7 w-9 place-items-center rounded-7 text-text-3 hover:bg-fill-2 hover:text-text desk:grid"
        >
          <Icon name="left_panel_open" size={18} />
        </button>
      )}

      <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map((n) => (
          <Item key={n.key} item={n} current={isCurrent(pathname, n.href)} compact={compact} badge={0} badgeTone="neutral" label={n.label} hint={n.shortcut} />
        ))}
        <div className="mx-1.5 my-3 h-px shrink-0 bg-[rgba(255,255,255,.06)]" />
        <Item
          item={{ key: "notifications", label: "Notifications", href: "#", icon: "notifications" }}
          current={notifOpen}
          compact={compact}
          badge={unread}
          badgeTone="neutral"
          label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          onClick={openNotifications}
          popup
        />
        {SECONDARY_ITEMS.map((n) =>
          n.key === "approvals" ? (
            <Item
              key={n.key}
              item={n}
              current={isCurrent(pathname, n.href)}
              compact={compact}
              badge={waiting}
              badgeTone="amber"
              label={`Approvals, ${waiting} waiting`}
            />
          ) : (
            <Item key={n.key} item={n} current={isCurrent(pathname, n.href)} compact={compact} badge={0} badgeTone="neutral" label={n.label} hint={n.shortcut} />
          ),
        )}
      </nav>

      <div className="flex flex-col gap-2 border-t border-[rgba(255,255,255,.05)] px-4 pt-3.5 pb-4">
        <div className={`flex items-center gap-[9px] font-mono text-[10.5px] font-medium tracking-[0.08em] text-text-2 ${compact ? "justify-center" : "justify-center desk:justify-start"}`}>
          <span
            aria-hidden="true"
            className={`size-[7px] shrink-0 rounded-full ${healthRow.dot} ${healthRow.pulse ? "animate-[lo-pulse-g_2.4s_ease-out_infinite]" : ""}`}
          />
          <span className={lab} role="status">
            {healthRow.text}
          </span>
        </div>
        <div className={`flex items-center gap-[9px] font-mono text-[10.5px] font-medium tracking-[0.08em] text-text-2 ${compact ? "justify-center" : "justify-center desk:justify-start"}`}>
          <span aria-hidden="true" className={`size-[7px] shrink-0 rotate-45 rounded-[2px] ${ai.dot}`} />
          <span className={lab}>{ai.text}</span>
        </div>
      </div>
    </aside>
  );
}
