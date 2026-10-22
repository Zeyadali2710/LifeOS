"use client";
import s from "./settings.module.css";
import { useRouter } from "next/navigation";
import { Alert } from "@/ui/feedback";
import { useState } from "react";
import type { CalendarConnectionDTO } from "@/lib/calendar-types";
import { disconnectCalendarAction } from "@/server/calendar-settings-actions";
import { syncCalendarsNowAction } from "@/server/calendar-actions";
import { formatHM } from "@/server/time";
import { useShell } from "@/features/shell/shell-provider";
import { Button, buttonClass } from "@/ui/button";
import { Dialog } from "@/ui/overlay";
import { Status } from "@/ui/display";
import { CalendarList } from "./calendar-list";
import { ConnectionRow, type RowStatus } from "./connection-row";
import { IcloudForm } from "./icloud-form";
const SYNC_MS = 5 * 60000;
const META = {
  google_calendar: {
    name: "Google Calendar",
    short: "Google",
    empty: "Sign in with Google to sync your calendars. LifeOS asks for calendar read and event write access only.",
  },
  icloud_calendar: {
    name: "iCloud Calendar",
    short: "iCloud",
    empty: "Use an app-specific password. Your Apple ID password is never used.",
  },
} as const;
export function CalendarConnectionRow({ conn, notice, open = false }: {
  conn: CalendarConnectionDTO;
  notice?: string;
  open?: boolean;
}) {
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
  const detail = conn.status === "error"
    ? "Access was rejected. Syncing is paused."
    : conn.status === "none"
      ? google && !conn.configured
        ? "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env on the server, then restart."
        : m.empty
      : `${conn.account ?? ""} · ${syncingCount} of ${conn.calendars.length} calendars syncing${last ? ` · last synced ${formatHM(last)}` : ""}`;
  const label = !connected ? `Connect ${m.name}` : google ? "Reconnect Google" : "Reconnect";
  const gmailMissing = google && connected && conn.status !== "error" && conn.gmail !== "granted";
  const action = google ? (conn.configured ? <a className={buttonClass({ variant: conn.status === "error" ? "primary" : "secondary" })} href="/api/connections/google/start">
    {label}
  </a> : null) : <Button variant={conn.status === "error" ? "primary" : "secondary"} aria-expanded={form} onClick={() => setForm(!form)}>
    {label}
  </Button>;
  async function sync() {
    setSyncing(true);
    const r = await syncCalendarsNowAction().catch(() => ({ ok: false }));
    setSyncing(false);
    if (r.ok) {
      setDone("Sync started");
      router.refresh();
    }
    else
      toast("Couldn't save that. Try again.", "error");
  }
  async function disconnect() {
    setConfirm(false);
    const r = await disconnectCalendarAction(conn.id).catch(() => ({ ok: false }));
    if (r.ok) {
      toast(`${m.name} disconnected`);
      router.refresh();
    }
    else
      toast("Couldn't save that. Try again.", "error");
  }
  return (<div className={s.stack}>
    <ConnectionRow name={m.name} detail={detail} status={status} action={action} readOnly={google && !conn.configured}>
      {notice && <Alert>
        {notice}
      </Alert>}{form && !google && <IcloudForm onCancel={() => setForm(false)} onDone={n => { setForm(false); toast(`iCloud Calendar connected · ${n} calendars`); router.refresh(); }} />}
      {google && connected && <div className={s.inset}>
        <Status tone={conn.status === "error" ? "failed" : gmailMissing ? "approval" : "working"} glyph={conn.status === "error" ? "×" : gmailMissing ? "▲" : "✓"}>Gmail · {conn.status === "error" ? "Needs reconnect" : !gmailMissing ? "Allowed" : conn.gmail === "read_only" ? "Read only" : "Not allowed"}
        </Status>
        {gmailMissing && <p className={s.note}>
          {conn.gmail === "read_only" ? "Reconnect Google to allow replies." : "Reconnect Google to allow Gmail."}
        </p>}<p className={s.note}>Google will show an &quot;unverified app&quot; screen once. This is your own LifeOS, so continue past it.</p>
      </div>}
      {connected && <div className={s.inset}>
        <CalendarList calendars={conn.calendars} defaultOpen={open} />
        <div className={s.row}>
          {conn.lastSyncError ? <p role="alert" className={s.error}>Last sync failed {last ? formatHM(last) : ""}: {conn.lastSyncError}
          </p> : <span className={s.note}>
            {last ? `Last synced ${formatHM(last)} · next about ${formatHM(new Date(last.getTime() + SYNC_MS))}` : "Not synced yet"}
          </span>}<span className={s.actions}>
            <span role="status" className={s.note}>
              {done}
            </span>
            <Button disabled={syncing} size="sm" icon="refresh" onClick={sync}>
              {syncing ? "Starting…" : "Sync now"}
            </Button>
            <Button variant="text" destructive size="sm" onClick={() => setConfirm(true)}>Disconnect</Button>
          </span>
        </div>
      </div>}
    </ConnectionRow>
    <Dialog open={confirm} onClose={() => setConfirm(false)} title={`Disconnect ${m.name}?`} footer={<>
      <Button autoFocus id={`disconnect-${conn.id}-cancel`} onClick={() => setConfirm(false)}>Cancel</Button>
      <Button variant="danger" onClick={disconnect}>Disconnect</Button>
    </>}>
      <p className={s.note}>LifeOS stops syncing and deletes the saved access and its synced events. Your events in {m.short} are not changed. You can connect again at any time.{google && " This also removes Gmail access. Synced mail is removed from LifeOS."}
      </p>
    </Dialog>
  </div>);
}
