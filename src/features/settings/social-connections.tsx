"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { socialConnectionStatus } from "@/server/socials/connections";
import { confirmInstagramSmoke, disconnect, saveTikTokCredentials } from "@/server/socials-actions";
import { useLiveEvents } from "@/features/shell/live-provider";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/overlay";
import { Checkbox, TextField } from "@/ui/controls";
import s from "./settings.module.css";
import { Section } from "@/ui/layout";
import { Status } from "@/ui/display";
import { buttonClass } from "@/ui/button";
import { ConnectionRow, type RowStatus } from "./connection-row";
export type SocialConnectionsData = Awaited<ReturnType<typeof socialConnectionStatus>>;
const status = (c: SocialConnectionsData["linkedin"]): RowStatus => !c ? "none" : c.status === "error" || (c.expiresAt && new Date(c.expiresAt) <= new Date()) ? "error" : "connected";
export function SocialConnections({ connections: c, redirectUri, result }: {
  connections: SocialConnectionsData;
  redirectUri: string;
  result: string | null;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const [checked, setChecked] = useState([false, false, false]);
  const [busy, setBusy] = useState(false);
  useLiveEvents("socials", () => router.refresh());
  async function confirm() {
    if (!checked.every(Boolean) || !c.instagram?.credentialGeneration)
      return;
    setBusy(true);
    const r = await confirmInstagramSmoke(c.instagram.credentialGeneration).catch(() => ({ ok: false }));
    setBusy(false);
    toast(r.ok ? "Instagram smoke test confirmed" : "Could not confirm verification. Try again.", r.ok ? "success" : "error");
    if (r.ok)
      router.refresh();
  }
  return <Section id="social-connections" label="Socials">
    {(["linkedin", "instagram"] as const).map(id => <div key={id} id={`social-${id}`} className={s.anchor}>
      <ConnectionRow id={id} title={`${id} token`} name={id === "linkedin" ? "LinkedIn" : "Instagram"} status={status(c[id])} statusLabel={c[id]?.status === "verification_pending" ? "VERIFICATION PENDING" : !c[id] ? "MOCK" : undefined} detail={c[id] ? `${c[id].login} · ••••${c[id].last4}${c[id].expiresAt ? ` · expires ${new Date(c[id].expiresAt).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney" })}` : " · expiry not provided"}${c[id].lastSyncError ? ` · ${c[id].lastSyncError}` : ""}` : "MOCK until connected. Nothing leaves LifeOS."} removeBody="Queued approvals keep their original account binding and cannot fall back to mock publishing." onChanged={() => router.refresh()}>
        {id === "instagram" && c.instagram?.status === "verification_pending" && <div className={s.form}>
          <p className={s.body}>Real publishing and analytics are disabled. Complete the owner smoke test outside LifeOS, then confirm each check.</p>
          {["I verified the token expiry and granted Instagram Login scopes in the Meta dashboard.", "I published one owner-controlled image using a public HTTPS image URL and confirmed the post.", "I checked a real image insights response and its returned metric names."].map((label, i) => <Checkbox key={label} label={label} checked={checked[i]} onChange={e => setChecked(checked.map((v, n) => n === i ? e.target.checked : v))} />)}<div>
            <Button variant="primary" disabled={!checked.every(Boolean) || busy} onClick={confirm}>Confirm Instagram smoke test</Button>
          </div>
        </div>}
      </ConnectionRow>
    </div>)}
    <div id="social-tiktok" className={s.anchor}>
      <TikTokConnection connection={c.tiktok} app={c.tiktok_app} redirectUri={redirectUri} result={result} />
    </div>
    <div id="social-portfolio" className={s.anchor}>
      <ConnectionRow name="Portfolio" readOnly status="none" statusLabel="MANUAL" detail="No connection needed: Markdown export" />
    </div>
  </Section>;
}
function TikTokConnection({ connection, app, redirectUri, result }: {
  connection: SocialConnectionsData["tiktok"];
  app: SocialConnectionsData["tiktok_app"];
  redirectUri: string;
  result: string | null;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [removing, setRemoving] = useState<"tiktok" | "tiktok_app" | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const values = [key, secret];
    setKey("");
    setSecret("");
    setBusy(true);
    setError(undefined);
    const r = await saveTikTokCredentials(values[0]!, values[1]!).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok)
      return setError("Could not save TikTok app credentials. Check both values and retry.");
    setOpen(false);
    toast("TikTok app credentials saved");
    router.refresh();
  }
  async function remove(target: "tiktok" | "tiktok_app") {
    setBusy(true);
    const r = await disconnect(target).catch(() => ({ ok: false }));
    setBusy(false);
    toast(r.ok ? "TikTok disconnected" : "Could not disconnect TikTok.", r.ok ? "success" : "error");
    if (r.ok) {
      setRemoving(null);
      router.refresh();
    }
  }
  return <ConnectionRow name="TikTok" status={status(connection)} statusLabel={!connection ? "MOCK" : undefined} detail={connection ? `${connection.login} · ••••${connection.last4} · expires ${connection.expiresAt ? new Date(connection.expiresAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" }) : "not provided"}${connection.lastSyncError ? ` · ${connection.lastSyncError}` : ""}` : "MOCK analytics until connected. Posting always uses manual copy."} action={<>
    <Button disabled={busy} onClick={() => { setKey(""); setSecret(""); setOpen(!open); }}>
      {app ? "Replace app credentials" : "Add app credentials"}
    </Button>
    {app && <a className={buttonClass({ variant: status(connection) === "error" ? "primary" : "secondary" })} href="/api/connections/tiktok/start">
      {status(connection) === "error" ? "Reconnect TikTok" : "Connect TikTok"}
    </a>}{connection && <Button variant="text" destructive disabled={busy} onClick={() => setRemoving("tiktok")}>Disconnect</Button>}
  </>}>
    {result && <p role="status" className={s.note}>
      {result === "connected" ? "TikTok connected. Actual granted scopes are listed below." : "TikTok connection was not completed. Review the app configuration and reconnect."}
    </p>}
    {connection && <div className={s.inset}>
      <p className={s.note}>Granted scopes: {connection.scopes.join(", ") || "none"}
      </p>
      {["user.info.stats", "video.list"].filter(scope => !connection.scopes.includes(scope)).map(scope => <div key={scope}>
        <Status tone="approval" glyph="▲">Missing {scope}</Status>
        <p className={s.note}>{scope === "video.list" ? "Video metrics" : "Account statistics"} unavailable.</p>
      </div>)}
    </div>}
    <p className={s.uri}>Exact redirect URI: {redirectUri}{app ? ` · App key ••••${app.last4}` : ""}
    </p>
    <div>
      <Button variant="text" size="sm" onClick={async () => {
        try {
          await navigator.clipboard.writeText(redirectUri);
          toast("Redirect URI copied");
        }
        catch {
          toast("Couldn't copy. Select the redirect URI and copy it yourself.", "error");
        }
      }}>Copy redirect URI</Button>
    </div>
    {open && <form onSubmit={save} className={s.form}>
      <TextField label="TikTok client key" type="password" autoComplete="off" data-1p-ignore required maxLength={255} value={key} onChange={e => setKey(e.target.value)} />
      <TextField label="TikTok client secret" type="password" autoComplete="off" data-1p-ignore required maxLength={255} value={secret} onChange={e => setSecret(e.target.value)} />
      {error && <p role="alert" className={s.error}>
        {error}
      </p>}<div className={s.actions}>
        <Button type="submit" variant="primary" disabled={busy}>Save app credentials</Button>
        <Button disabled={busy} onClick={() => { setKey(""); setSecret(""); setOpen(false); }}>Cancel</Button>
        {app && <Button variant="danger" disabled={busy} onClick={() => setRemoving("tiktok_app")}>Remove app credentials</Button>}
      </div>
    </form>}
    <Dialog open={removing !== null} title={removing === "tiktok_app" ? "Remove TikTok app credentials" : "Disconnect TikTok"} onClose={() => {
      if (!busy)
        setRemoving(null);
    }} footer={<>
      <Button autoFocus disabled={busy} onClick={() => setRemoving(null)}>Stay connected</Button>
      <Button variant="danger" disabled={busy} onClick={() => {
        if (removing)
          void remove(removing);
      }}>Disconnect TikTok</Button>
    </>}>
      <p className={s.note}>LifeOS stops syncing TikTok stats and goes back to MOCK. Your TikTok account is unchanged.</p>
    </Dialog>
  </ConnectionRow>;
}
