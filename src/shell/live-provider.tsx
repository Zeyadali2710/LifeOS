"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { Health } from "@/server/health";
import type { ActivityDTO, NotificationDTO } from "@/lib/live-types";
import { applySnapshot, healthFromActivity, mergeById, nextBackoff, parseSnapshot, unreadOf, wakeDelay } from "./live";

type Live = {
  activity: ActivityDTO[];
  notifications: NotificationDTO[];
  setNotifications: Dispatch<SetStateAction<NotificationDTO[]>>;
  refetchNotifications: () => Promise<boolean>;
  unread: number;
  health: Health | null;
  connected: boolean;
  loaded: boolean;
  loadError: boolean;
  freshIds: Set<string>;
};

const Ctx = createContext<Live | null>(null);

export function useLive(): Live {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLive must be used inside <LiveProvider>");
  return v;
}

const FRESH_MS = 4500;
const ACTIVITY_LIMIT = 50;

export function LiveProvider({
  initialHealth,
  initialUnread,
  children,
}: {
  initialHealth: Health | null;
  initialUnread: number;
  children: ReactNode;
}) {
  const [activity, setActivity] = useState<ActivityDTO[]>([]);
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [health, setHealth] = useState<Health | null>(initialHealth);
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [nextWake, setNextWake] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const loadedRef = useRef(false);
  const idsRef = useRef<Set<string>>(new Set());
  const everConnected = useRef(false);

  const markFresh = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setFreshIds((s) => new Set([...s, ...ids]));
    setTimeout(
      () =>
        setFreshIds((s) => {
          const n = new Set(s);
          ids.forEach((i) => n.delete(i));
          return n;
        }),
      FRESH_MS,
    );
  }, []);

  const refetchNotifications = useCallback(async (): Promise<boolean> => {
    const known = new Set(idsRef.current);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.status === 401) {
        window.location.assign("/login");
        return false;
      }
      const snap = res.ok ? parseSnapshot(await res.json()) : null;
      if (!snap) return false;
      // diff against known ids so snooze reappearances animate in (not on first load)
      if (loadedRef.current) markFresh(snap.items.filter((i) => !idsRef.current.has(i.id)).map((i) => i.id));
      const arrived = [...idsRef.current].filter((id) => !known.has(id));
      idsRef.current = new Set([...snap.items.map((i) => i.id), ...arrived]);
      setNotifications((cur) => applySnapshot(cur, snap.items, known));
      setNextWake(snap.nextWake);
      return true;
    } catch {
      return false;
    }
  }, [markFresh]);

  const resync = useCallback(async () => {
    try {
      const [act, h] = await Promise.all([
        fetch("/api/activity", { cache: "no-store" }),
        fetch("/api/health", { cache: "no-store" }).catch(() => null),
      ]);
      if (act.status === 401) {
        window.location.assign("/login");
        return;
      }
      const ok = act.ok ? ((await act.json()) as { items?: ActivityDTO[] }) : null;
      const notifOk = await refetchNotifications();
      if (ok?.items) setActivity((cur) => mergeById(cur, ok.items!, "at", ACTIVITY_LIMIT));
      if (h) {
        try {
          setHealth((await h.json()) as Health); // 200 and 503 both carry Health JSON
        } catch {
          /* keep previous */
        }
      }
      const good = Boolean(ok?.items) && notifOk;
      setLoadError(!good);
      if (good) {
        loadedRef.current = true;
        setLoaded(true);
      }
    } catch {
      setLoadError(true);
    }
  }, [refetchNotifications]);

  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let backoff = 0;
    let closed = false;

    const parse = <T,>(e: Event): T | null => {
      try {
        return JSON.parse((e as MessageEvent<string>).data) as T;
      } catch {
        return null; // malformed frame ignored (T-02-24)
      }
    };

    const connect = () => {
      es = new EventSource("/api/events");
      es.addEventListener("open", () => {
        backoff = 0;
        setConnected(true);
        if (everConnected.current) setAnnounce("Live updates restored.");
        everConnected.current = true;
        void resync();
      });
      es.addEventListener("activity", (e) => {
        const a = parse<ActivityDTO>(e);
        if (!a?.id) return;
        setActivity((cur) => mergeById(cur, [a], "at", ACTIVITY_LIMIT));
        if (loadedRef.current) markFresh([a.id]);
        const h = healthFromActivity(a);
        if (h) setHealth(h);
      });
      es.addEventListener("notification", (e) => {
        const n = parse<NotificationDTO>(e);
        if (!n?.id) return;
        idsRef.current.add(n.id);
        setNotifications((cur) => mergeById(cur, [n], "createdAt", Number.MAX_SAFE_INTEGER));
        if (loadedRef.current) markFresh([n.id]);
      });
      es.addEventListener("resync", () => void resync());
      es.addEventListener("error", async () => {
        es?.close();
        setConnected(false);
        if (everConnected.current) setAnnounce("Live updates reconnecting.");
        if (closed) return;
        // EventSource hides the 401 of an expired session; this probe sends the tab to /login instead of retrying forever.
        await refetchNotifications();
        if (closed) return;
        backoff = nextBackoff(backoff);
        timer = setTimeout(connect, backoff);
      });
    };
    connect();
    return () => {
      closed = true;
      es?.close();
      clearTimeout(timer);
    };
  }, [resync, markFresh, refetchNotifications]);

  // snooze wake timer + tab refocus
  useEffect(() => {
    const d = wakeDelay(nextWake, Date.now());
    const t = d === null ? undefined : setTimeout(() => void refetchNotifications(), d);
    const onVis = () => {
      if (document.visibilityState === "visible") void refetchNotifications();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [nextWake, refetchNotifications]);

  const value = useMemo<Live>(
    () => ({
      activity,
      notifications,
      setNotifications,
      refetchNotifications,
      unread: loaded ? unreadOf(notifications) : initialUnread,
      health,
      connected,
      loaded,
      loadError,
      freshIds,
    }),
    [activity, notifications, refetchNotifications, initialUnread, health, connected, loaded, loadError, freshIds],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>
    </Ctx.Provider>
  );
}
