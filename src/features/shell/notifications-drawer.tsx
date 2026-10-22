"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { NotificationCategory, NotificationDTO } from "@/lib/live-types";
import { isSafeGithubUrl, isSafePath } from "@/lib/safe-url";
import { dismiss, markAllRead, markRead, snooze } from "@/server/notification-actions";
import { groupNotifications, snoozePresets, snoozeToast, type SnoozePreset } from "@/server/time";
import { Button } from "@/ui/button";
import { Alert, Skeleton } from "@/ui/feedback";
import { Drawer, Menu } from "@/ui/overlay";
import { restoreItem } from "./live";
import { useLive } from "./live-provider";
import { useShell } from "./shell-provider";
import s from "./shell.module.css";

const CAT_COLOR: Record<NotificationCategory, string> = {
  URGENT: "var(--status-failed)",
  IMPORTANT: "var(--accent)",
  APPROVAL: "var(--status-approval)",
  AGENT: "var(--status-working)",
  REMINDER: "var(--ink)",
  FYI: "var(--ink-3)",
};
const IMPORTANT = new Set<NotificationCategory>(["URGENT", "IMPORTANT"]);
const ACTION: Partial<Record<NotificationCategory, string>> = { APPROVAL: "Review", REMINDER: "Open", AGENT: "Open" };

function Row({ n, fresh }: { n: NotificationDTO; fresh: boolean }) {
  const router = useRouter();
  const [presets, setPresets] = useState<SnoozePreset[]>([]);
  const { setNotifications, refetchNotifications } = useLive();
  const { closeNotifications, toast } = useShell();
  const unread = n.readAt === null;
  const important = unread && IMPORTANT.has(n.category);

  // Optimistic: apply `next`, run the action, restore just this item + error toast on failure.
  const mutate = async (next: (l: NotificationDTO[]) => NotificationDTO[], act: () => Promise<{ ok: boolean }>, okMsg?: string, refetch = false) => {
    setNotifications(next);
    const ok = await act().then((r) => r.ok, () => false);
    if (!ok) {
      setNotifications((cur) => restoreItem(cur, n));
      toast("Couldn't update that notification. Try again.", "error");
      return;
    }
    if (okMsg) toast(okMsg);
    if (refetch) void refetchNotifications();
  };
  const setRead = (read: boolean) => mutate((l) => l.map((i) => (i.id === n.id ? { ...i, readAt: read ? new Date().toISOString() : null } : i)), () => markRead(n.id, read));

  const safe = isSafePath(n.actionUrl) || isSafeGithubUrl(n.actionUrl);
  const open = () => {
    if (unread) void setRead(true);
    if (isSafeGithubUrl(n.actionUrl)) {
      window.open(n.actionUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (!isSafePath(n.actionUrl)) return;
    closeNotifications();
    router.push(n.actionUrl);
  };

  return (
    <li className={[s.notif, important && s.important, fresh && s.fresh].filter(Boolean).join(" ")}>
      <div className={s.notifTop}>
        <span style={{ color: CAT_COLOR[n.category] }}>{n.category}</span>
        <span className={s.notifRead}>{unread ? "UNREAD" : ""}</span>
      </div>
      <p className={s.notifTitle} style={{ fontWeight: important ? 600 : unread ? 500 : 400 }}>
        {n.title}
      </p>
      {n.body && <p className={s.notifDetail}>{n.body}</p>}
      <div className={s.notifActions}>
        {safe && (
          <Button size="sm" onClick={open} style={{ minHeight: 0, padding: "4px 10px", fontSize: 12.5, borderRadius: 5 }}>
            {ACTION[n.category] ?? "Open"}
          </Button>
        )}
        <button type="button" className={s.notifLink} onClick={() => void setRead(unread)}>
          {unread ? "Mark read" : "Mark unread"}
        </button>
        <Menu
          label="Snooze until"
          items={presets.map((pr) => ({ label: pr.label, hint: pr.hint, onSelect: () => void mutate((l) => l.filter((i) => i.id !== n.id), () => snooze(n.id, pr.until.toISOString()), snoozeToast(pr.until, new Date()), true) }))}
          trigger={(p) => (
            <button type="button" {...p} className={s.notifLink} onClick={() => { setPresets(snoozePresets(new Date())); p.onClick(); }}>
              Snooze
            </button>
          )}
        />
        <button type="button" className={`${s.notifLink} ${s.notifDismiss}`} onClick={() => void mutate((l) => l.filter((i) => i.id !== n.id), () => dismiss(n.id), "Notification dismissed", true)}>
          Dismiss
        </button>
      </div>
    </li>
  );
}

export function NotificationsDrawer() {
  const { notifOpen, closeNotifications, toast } = useShell();
  const { notifications, setNotifications, refetchNotifications, unread, loaded, loadError, freshIds } = useLive();

  const readAll = async () => {
    const at = new Date().toISOString();
    setNotifications((l) => l.map((n) => (n.readAt ? n : { ...n, readAt: at })));
    const ok = await markAllRead().then((r) => r.ok, () => false);
    if (ok) {
      toast("All notifications marked read");
      void refetchNotifications(); // clears unread counted beyond the list cap
    } else {
      // Undo only what this action marked (its unique timestamp), keeping anything that arrived meanwhile.
      setNotifications((l) => l.map((n) => (n.readAt === at ? { ...n, readAt: null } : n)));
      toast("Couldn't update notifications. Try again.", "error");
    }
  };

  let body;
  if (!loaded && !loadError) {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 16 }} aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} h={68} />
        ))}
      </div>
    );
  } else if (loadError && !loaded) {
    body = (
      <div style={{ paddingTop: 16 }}>
        <Alert action={<Button variant="text" size="sm" onClick={() => void refetchNotifications()}>Try again</Button>}>Notifications couldn&apos;t load. Nothing was changed.</Alert>
      </div>
    );
  } else if (notifications.length === 0) {
    body = <p className={s.caughtUp}>You&apos;re all caught up.</p>;
  } else {
    body = groupNotifications(notifications, new Date()).map((g) => (
      <section key={g.group} aria-label={g.group}>
        <h3 className={s.notifGroup}>{g.group}</h3>
        <ul role="list" style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {g.items.map((n) => (
            <Row key={n.id} n={n} fresh={freshIds.has(n.id)} />
          ))}
        </ul>
      </section>
    ));
  }

  return (
    <Drawer
      open={notifOpen}
      onClose={closeNotifications}
      label="Notifications"
      head={
        <span>
          Notifications <span className={s.unreadMeta}>{unread} unread</span>
        </span>
      }
      actions={
        <button type="button" className={s.markAll} disabled={unread === 0} onClick={() => void readAll()}>
          Mark all read
        </button>
      }
    >
      <div className={s.notifBody}>{body}</div>
    </Drawer>
  );
}
