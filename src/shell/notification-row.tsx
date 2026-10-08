"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isSafeGithubUrl, isSafePath } from "@/lib/safe-url";
import type { NotificationDTO } from "@/lib/live-types";
import { dismiss, markRead, snooze } from "@/server/notification-actions";
import { relativeTime, snoozeToast } from "@/server/time";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";
import { CATEGORY_META, iconFor } from "./notification-meta";
import { restoreItem } from "./live";
import { useLive } from "./live-provider";
import { useShell } from "./shell-provider";
import { SnoozeMenu } from "./snooze-menu";

const secondary = "h-[26px] rounded-6 border border-[rgba(255,255,255,.08)] px-2 text-[12px] text-text-2 hover:text-text";

export function NotificationRow({ n, fresh }: { n: NotificationDTO; fresh: boolean }) {
  const router = useRouter();
  const { setNotifications, refetchNotifications } = useLive();
  const { closeNotifications, toast } = useShell();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const meta = CATEGORY_META[n.category];
  const unread = n.readAt === null;
  const important = unread && meta.important;
  const now = new Date();

  // Optimistic: apply `next`, run the action, restore just this item + error toast on failure.
  const mutate = async (next: (l: NotificationDTO[]) => NotificationDTO[], act: () => Promise<{ ok: boolean }>, okMsg?: string, refetch = false) => {
    setNotifications(next);
    let ok = false;
    try {
      ok = (await act()).ok;
    } catch {
      ok = false;
    }
    if (!ok) {
      setNotifications((cur) => restoreItem(cur, n));
      toast("Couldn't update that notification. Try again.", "error");
      return;
    }
    if (okMsg) toast(okMsg);
    if (refetch) void refetchNotifications();
  };

  const setReadState = (read: boolean) =>
    mutate((l) => l.map((i) => (i.id === n.id ? { ...i, readAt: read ? new Date().toISOString() : null } : i)), () => markRead(n.id, read));

  const open = () => {
    if (isSafeGithubUrl(n.actionUrl)) {
      if (unread) void setReadState(true);
      window.open(n.actionUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (!isSafePath(n.actionUrl)) return;
    if (unread) void setReadState(true);
    closeNotifications();
    router.push(n.actionUrl);
  };

  return (
    <li
      className={`grid grid-cols-[28px_1fr] gap-2.5 rounded-10 border p-3 ${
        important ? "border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.035)]" : "border-transparent"
      } ${unread ? "" : "opacity-60"} ${fresh ? "animate-[lo-in_450ms_ease-out]" : ""}`}
    >
      <span
        aria-hidden="true"
        className="grid size-7 place-items-center rounded-8"
        style={{ background: important ? `${meta.colour}22` : "rgba(255,255,255,.04)", color: meta.colour }}
      >
        <Icon name={iconFor(n)} size={17} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className={`text-[13.5px] leading-snug break-words ${important ? "font-semibold" : "font-normal"}`}>
            <span className="sr-only">{unread ? "Unread: " : "Read: "}</span>
            {n.title}
          </h3>
          <div className="flex shrink-0 items-center gap-2">
            <Badge kind="tag" tone={meta.tone}>
              {meta.tag}
            </Badge>
            <time dateTime={n.createdAt} className="font-mono text-[10.5px] text-text-3">
              {relativeTime(new Date(n.createdAt), now)}
            </time>
          </div>
        </div>
        {n.body && <p className="text-[12.5px] leading-[1.45] break-words text-text-2">{n.body}</p>}
        <div className="mt-1 flex flex-wrap gap-1">
          {(isSafePath(n.actionUrl) || isSafeGithubUrl(n.actionUrl)) && (
            <Button size="xs" onClick={open}>
              Open
            </Button>
          )}
          <button type="button" className={secondary} onClick={() => void setReadState(unread)}>
            {unread ? "Mark read" : "Mark unread"}
          </button>
          <button type="button" className={secondary} aria-haspopup="menu" aria-expanded={menu !== null} onClick={(e) => setMenu((v) => (v ? null : e.currentTarget))}>
            Snooze
          </button>
          <button type="button" className={secondary} onClick={() => void mutate((l) => l.filter((i) => i.id !== n.id), () => dismiss(n.id), "Notification dismissed", true)}>
            Dismiss
          </button>
        </div>
      </div>
      {menu && (
        <SnoozeMenu
          anchor={menu}
          onClose={() => setMenu(null)}
          onSelect={(until) => {
            setMenu(null);
            void mutate((l) => l.filter((i) => i.id !== n.id), () => snooze(n.id, until.toISOString()), snoozeToast(until, new Date()), true);
          }}
        />
      )}
    </li>
  );
}
