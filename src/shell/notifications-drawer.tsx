"use client";

import { useId, useState } from "react";
import { NOTIFICATION_CATEGORIES } from "@/lib/live-types";
import type { NotificationCategory } from "@/lib/live-types";
import { markAllRead } from "@/server/notification-actions";
import { groupNotifications } from "@/server/time";
import { Button } from "@/ui/button";
import { EmptyState } from "@/ui/empty-state";
import { Icon } from "@/ui/icon";
import { InlineError } from "@/ui/inline-error";
import { Skeleton } from "@/ui/skeleton";
import { useLive } from "./live-provider";
import { NotificationRow } from "./notification-row";
import { useShell } from "./shell-provider";
import { useDialog } from "./use-dialog";

export function NotificationsDrawer() {
  const { notifOpen, closeNotifications, toast } = useShell();
  const { notifications, setNotifications, refetchNotifications, unread, loaded, loadError, freshIds } = useLive();
  const [filter, setFilter] = useState<NotificationCategory | null>(null);
  const titleId = useId();
  const ref = useDialog<HTMLDivElement>(notifOpen, closeNotifications, { modal: true });

  if (!notifOpen) return null;

  const present = NOTIFICATION_CATEGORIES.filter((c) => notifications.some((n) => n.category === c));
  const active = filter && present.includes(filter) ? filter : null;
  const shown = active ? notifications.filter((n) => n.category === active) : notifications;
  const now = new Date();

  const readAll = async () => {
    const previous = notifications;
    const at = new Date().toISOString();
    setNotifications((l) => l.map((n) => (n.readAt ? n : { ...n, readAt: at })));
    let ok = false;
    try {
      ok = (await markAllRead()).ok;
    } catch {
      ok = false;
    }
    if (ok) toast("All notifications marked read");
    else {
      setNotifications(previous);
      toast("Couldn't update that notification. Try again.", "error");
    }
  };

  const chip = (label: string, value: NotificationCategory | null) => (
    <button
      key={label}
      type="button"
      aria-pressed={active === value}
      onClick={() => setFilter(value)}
      className={`h-7 shrink-0 rounded-full border px-3 text-[12.5px] ${
        active === value ? "border-[rgba(139,140,255,.5)] bg-[rgba(139,140,255,.12)] text-text" : "border-[rgba(255,255,255,.1)] text-text-2"
      }`}
    >
      {label}
    </button>
  );

  let body;
  if (!loaded && !loadError) {
    body = (
      <div className="flex flex-col gap-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[68px] rounded-10" />
        ))}
      </div>
    );
  } else if (loadError && !loaded) {
    body = (
      <InlineError
        label="ERROR · NOTIFICATIONS"
        title="Notifications couldn't load."
        what="The list didn't come back from the server."
        why="The connection dropped or the server is busy."
        fix="Try again. Nothing was changed."
        action={{ label: "TRY AGAIN", onClick: () => void refetchNotifications() }}
      />
    );
  } else if (notifications.length === 0) {
    body = (
      <EmptyState
        icon="notifications_off"
        title="You're all caught up."
        body="Alerts about sign-ins, system health and agents land here. Snoozed items return at the time you chose."
      />
    );
  } else if (shown.length === 0) {
    body = (
      <EmptyState
        icon="notifications_off"
        title={`No ${active?.toLowerCase()} notifications.`}
        body="Show all to see everything else."
        action={
          <Button variant="ghost" size="sm" onClick={() => setFilter(null)}>
            Show all
          </Button>
        }
      />
    );
  } else {
    body = groupNotifications(shown, now).map((g) => (
      <section key={g.group} aria-label={g.group}>
        <div className="mt-3 px-2 py-1.5 font-mono text-[10.5px] font-medium tracking-[0.08em] text-text-3">{g.group}</div>
        <ul className="flex flex-col gap-1">
          {g.items.map((n) => (
            <NotificationRow key={n.id} n={n} fresh={freshIds.has(n.id)} />
          ))}
        </ul>
      </section>
    ));
  }

  return (
    <div className="fixed inset-0 z-[70]">
      <div aria-hidden="true" className="absolute inset-0 animate-[lo-fade_150ms_ease-out] bg-[rgba(5,6,9,.45)]" onClick={closeNotifications} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 flex w-screen animate-[lo-slide_200ms_ease-out] flex-col border-l border-[rgba(255,255,255,.08)] bg-[#101217] shadow-drawer tab:w-[min(420px,94vw)]"
      >
        <header className="flex h-14 shrink-0 items-center gap-2 pr-3 pl-5">
          <h2 id={titleId} className="flex-1 text-[15px] font-medium">
            Notifications
          </h2>
          <Button variant="ghost" size="sm" disabled={unread === 0} onClick={() => void readAll()}>
            Mark all read
          </Button>
          <button
            type="button"
            aria-label="Close notifications"
            onClick={closeNotifications}
            className="grid size-11 place-items-center rounded-8 text-text-3 hover:bg-fill-2 hover:text-text tab:size-[30px]"
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        {present.length >= 2 && (
          <div role="group" aria-label="Filter by category" className="flex shrink-0 gap-1.5 overflow-x-auto px-3 py-2">
            {chip("All", null)}
            {present.map((c) => chip(c, c))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-6">{body}</div>
      </div>
    </div>
  );
}
