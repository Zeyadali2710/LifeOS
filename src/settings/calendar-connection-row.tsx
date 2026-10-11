"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CalendarConnectionDTO } from "@/lib/calendar-types";
import { disconnectCalendarAction } from "@/server/calendar-settings-actions";
import { syncCalendarsNowAction } from "@/server/calendar-actions";
import { formatHM } from "@/server/time";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Icon } from "@/ui/icon";
import { CalendarList } from "./calendar-list";
import { ConnectionRow, type RowStatus } from "./connection-row";
import { IcloudForm } from "./icloud-form";

const SYNC_MS = 5 * 60_000;
const META = {
  google_calendar: {
    tile: "GC",
    name: "Google Calendar",
    short: "Google",
    empty: "Sign in with Google to sync your calendars. LifeOS asks for calendar read and event write access only.",
  },
  icloud_calendar: {
    tile: "IC",
    name: "iCloud Calendar",
    short: "iCloud",
    empty: "Use an app-specific password. Your Apple ID password is never used.",
  },
} as const;

export function CalendarConnectionRow({ conn, notice, open = false }: { conn: CalendarConnectionDTO; notice?: string; open?: boolean }) {
  const m = META[conn.id];
  const google = conn.id === "google_calendar";
  const router = useRouter();
  const { toast } = useShell();
  const [form, setForm] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [done, setDone] = useState("");
  const connected = conn.status !== "none";
  const status: RowStatus = syncing ? "syncing" : conn.status === "error" ? "error" : conn.status === "connected" ? "connected" : "none";
  const last = conn.lastSyncAt ? new Date(conn.lastSyncAt) : null;
  const syncingCount = conn.calendars.filter((c) => c.enabled).length;

  const detail =
    conn.status === "error"
      ? "Access was rejected. Syncing is paused."
      : conn.status === "none"
        ? google && !conn.configured
          ? "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env on the server, then restart."
          : m.empty
        : `${conn.account ?? ""} · ${syncingCount} of ${conn.calendars.length} calendars syncing${last ? ` · last synced ${formatHM(last)}` : ""}`;

  const label = conn.status === "error" ? "Reconnect" : connected ? "Reconnect" : `Connect ${m.name}`;
  const btn = `inline-flex h-8 min-w-[110px] items-center justify-center rounded-9 px-3.5 text-[13px] font-medium transition ${
    conn.status === "error" ? "bg-[#e9eaf0] font-semibold tracking-[0.05em] text-[#0b0c10] uppercase hover:bg-white" : connected ? "border border-[rgba(255,255,255,.10)] bg-fill-1 text-text hover:bg-[rgba(255,255,255,.06)]" : "bg-indigo text-on-accent hover:bg-indigo-soft"
  }`;
  const action =
    google ? (
      conn.configured ? (
        <a href="/api/connections/google/start" className={btn}>
          {label}
        </a>
      ) : null
    ) : (
      <Button size="md" className="h-8 min-w-[110px]" variant={conn.status === "error" ? "inverse" : connected ? "secondary" : "primary"} aria-expanded={form} onClick={() => setForm(!form)}>
        {label}
      </Button>
    );

  async function sync() {
    setSyncing(true);
    const r = await syncCalendarsNowAction().catch(() => ({ ok: false }));
    setSyncing(false);
    if (r.ok) {
      setDone("Sync started");
      router.refresh();
    } else toast("Couldn't save that. Try again.", "error");
  }

  async function disconnect() {
    setConfirm(false);
    const r = await disconnectCalendarAction(conn.id);
    if (r.ok) {
      toast(`${m.name} disconnected`);
      router.refresh();
    } else toast("Couldn't save that. Try again.", "error");
  }

  return (
    <div className="flex flex-col gap-2">
      <ConnectionRow tile={m.tile} name={m.name} detail={detail} status={status} action={action}>
        {notice && (
          <p role="alert" className="text-[13px] text-red">
            {notice}
          </p>
        )}
        {form && !google && (
          <IcloudForm
            onCancel={() => setForm(false)}
            onDone={(n) => {
              setForm(false);
              toast(`iCloud Calendar connected · ${n} calendars`);
              router.refresh();
            }}
          />
        )}
        {connected && (
          <div className="flex flex-col gap-3 rounded-12 border border-[rgba(255,255,255,.07)] bg-surface px-4 py-3">
            <CalendarList calendars={conn.calendars} defaultOpen={open} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(255,255,255,.07)] pt-3">
              {conn.lastSyncError ? (
                <span className="font-mono text-[11px] text-red">
                  Last sync failed {last ? formatHM(last) : ""}: {conn.lastSyncError}
                </span>
              ) : (
                <span className="font-mono text-[11px] text-text-3">
                  {last ? `Last synced ${formatHM(last)} · next about ${formatHM(new Date(last.getTime() + SYNC_MS))}` : "Not synced yet"}
                </span>
              )}
              <span className="flex items-center gap-2">
                <span aria-live="polite" className="sr-only">
                  {done}
                </span>
                <Button variant="secondary" size="xs" loading={syncing} onClick={sync}>
                  <Icon name="refresh" size={14} />
                  Sync now
                </Button>
                <Button variant="ghost" size="xs" className="text-red" onClick={() => setConfirm(true)}>
                  Disconnect
                </Button>
              </span>
            </div>
          </div>
        )}
      </ConnectionRow>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Disconnect ${m.name}?`}
        initialFocus={() => document.getElementById(`disconnect-${conn.id}-cancel`)}
        actions={
          <>
            <Button id={`disconnect-${conn.id}-cancel`} variant="secondary" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={disconnect}>
              Disconnect
            </Button>
          </>
        }
      >
        LifeOS stops syncing and deletes the saved access and its synced events. Your events in {m.short} are not changed. You can connect again at any time.
      </Dialog>
    </div>
  );
}
