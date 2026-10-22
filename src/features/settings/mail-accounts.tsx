"use client";
import s from "./settings.module.css";
import { Status } from "@/ui/display";
import { Section } from "@/ui/layout";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { mailAccounts } from "@/server/mail/accounts";
import { disconnectMailAccountAction, syncMailNowAction } from "@/server/mail-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button, buttonClass } from "@/ui/button";
import { Dialog } from "@/ui/overlay";
export function MailAccounts({ accounts, configured }: {
  accounts: Awaited<ReturnType<typeof mailAccounts>>;
  configured: boolean;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function disconnect() {
    if (!removing)
      return;
    setBusy(true);
    try {
      const r = await disconnectMailAccountAction(removing);
      if (r.ok) {
        setRemoving(null);
        router.refresh();
      }
      else
        toast("Couldn't disconnect that account.", "error");
    }
    catch {
      toast("Couldn't disconnect that account.", "error");
    }
    finally {
      setBusy(false);
    }
  }
  return <Section id="mail-accounts-h" label={`Mail · ${accounts.length} accounts`}>
    <p className={s.note}>All connected Gmail inboxes appear in Outreach. Replies use the account that received the message.</p>
    {accounts.length === 0 && <p className={s.note}>No email accounts connected. Add a Gmail account to get started.</p>}
    {accounts.map(a => <div key={a.id} className={s.connectionRow}>
      <div className={s.connectionInfo}>
        <h3>
          {a.email}
        </h3>
        <Status tone={a.status === "error" ? "failed" : !a.read || !a.compose ? "approval" : "working"} glyph={a.status === "error" ? "×" : !a.read || !a.compose ? "▲" : "✓"}>
          {a.status === "error" ? "Needs reconnect" : !a.read ? "Gmail access missing" : a.compose ? "Read and reply" : "Read only"}
        </Status>
        <p className={s.note}>
          {a.lastSyncAt ? `Synced ${new Date(a.lastSyncAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}` : "Not synced yet"}
        </p>
        {a.lastSyncError && <p role="alert" className={s.error}>
          {a.lastSyncError}
        </p>}
      </div>
      <div className={s.actions}>
        {configured && <a className={buttonClass({ variant: a.status === "error" ? "primary" : "secondary" })} href={a.id === "google_calendar" ? "/api/connections/google/start" : "/api/connections/google/start?mail=1"}>Reconnect</a>}{a.id !== "google_calendar" && <Button variant="text" destructive size="sm" onClick={() => setRemoving(a.id)}>Disconnect</Button>}
      </div>
    </div>)}
    <div className={s.actions}>
      {configured && <a className={buttonClass({})} href="/api/connections/google/start?mail=1">Add email account</a>}{accounts.length > 0 && <Button size="sm" onClick={async () => { const r = await syncMailNowAction(); toast(r.ok ? "Email sync started" : "Couldn't start sync.", r.ok ? "success" : "error"); }}>Sync all inboxes</Button>}
    </div>
    <Dialog open={removing !== null} onClose={() => setRemoving(null)} title="Disconnect email account?" footer={<>
      <Button autoFocus onClick={() => setRemoving(null)}>Cancel</Button>
      <Button variant="danger" disabled={busy} onClick={disconnect}>Disconnect</Button>
    </>}>
      <p className={s.note}>LifeOS removes this account&apos;s saved access and synced mail. Mail in Gmail and your other connected accounts stay unchanged.</p>
    </Dialog>
  </Section>;
}
