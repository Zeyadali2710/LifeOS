"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { mailAccounts } from "@/server/mail/accounts";
import { disconnectMailAccountAction, syncMailNowAction } from "@/server/mail-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";

export function MailAccounts({ accounts, configured }: { accounts: Awaited<ReturnType<typeof mailAccounts>>; configured: boolean }) {
  const router = useRouter();
  const { toast } = useShell();
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function disconnect() {
    if (!removing) return;
    setBusy(true);
    try {
      const r = await disconnectMailAccountAction(removing);
      if (r.ok) { setRemoving(null); router.refresh(); }
      else toast("Couldn't disconnect that account.", "error");
    } catch { toast("Couldn't disconnect that account.", "error"); }
    finally { setBusy(false); }
  }
  return <section className="glass-card rounded-24 p-4 flex flex-col gap-3" aria-label="Email accounts">
    <h2 className="text-[14px] font-medium">Email accounts</h2>
    <p className="text-[13px] text-text-3">All connected Gmail inboxes appear in Outreach. Replies use the account that received the message.</p>
    {accounts.map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
      <div className="min-w-0"><p className="text-[13px] break-all">{a.email}</p><p className="text-[12px] text-text-3">{a.status === "error" ? "Needs reconnect" : !a.read ? "Gmail access missing" : a.compose ? "Read and reply" : "Read only"}{a.lastSyncAt ? ` · Synced ${new Date(a.lastSyncAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}` : " · Not synced yet"}</p>{a.lastSyncError && <p className="text-[12px] text-red">{a.lastSyncError}</p>}</div>
      <div className="flex gap-2">{configured && <a href={a.id === "google_calendar" ? "/api/connections/google/start" : "/api/connections/google/start?mail=1"} className="text-[13px] text-accent">Reconnect</a>}{a.id !== "google_calendar" && <Button variant="ghost" size="xs" onClick={() => setRemoving(a.id)}>Disconnect</Button>}</div>
    </div>)}
    <div className="flex gap-3 items-center">{configured && <a href="/api/connections/google/start?mail=1" className="text-[13px] text-accent">Add email account</a>}{accounts.length > 0 && <Button variant="secondary" size="xs" onClick={async () => { const r = await syncMailNowAction(); toast(r.ok ? "Email sync started" : "Couldn't start sync.", r.ok ? "success" : "error"); }}>Sync all inboxes</Button>}</div>
    <Dialog open={removing !== null} onClose={() => setRemoving(null)} title="Disconnect email account?" actions={<><Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button><Button variant="destructive" loading={busy} onClick={disconnect}>Disconnect</Button></>}>
      LifeOS removes this account&apos;s saved access and synced mail. Mail in Gmail and your other connected accounts stay unchanged.
    </Dialog>
  </section>;
}
