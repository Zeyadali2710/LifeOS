"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { socialConnectionStatus } from "@/server/socials/connections";
import { confirmInstagramSmoke, disconnect, saveTikTokCredentials } from "@/server/socials-actions";
import { useLiveEvents } from "@/features/shell/live-provider";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/legacy-ui/button";
import { Dialog } from "@/legacy-ui/dialog";
import { Checkbox, Field, Input } from "@/legacy-ui/field";
import { ConnectionRow, type RowStatus } from "./connection-row";

export type SocialConnectionsData = Awaited<ReturnType<typeof socialConnectionStatus>>;
const status = (c: SocialConnectionsData["linkedin"]): RowStatus => !c ? "none" : c.status === "error" || (c.expiresAt && new Date(c.expiresAt) <= new Date()) ? "error" : "connected";
export function SocialConnections({ connections: c, redirectUri, result }: { connections: SocialConnectionsData; redirectUri: string; result: string | null }) {
  const router = useRouter();
  const { toast } = useShell();
  const [checked, setChecked] = useState([false, false, false]);
  const [busy, setBusy] = useState(false);
  useLiveEvents("socials", () => router.refresh());
  async function confirm() {
    if (!checked.every(Boolean) || !c.instagram?.credentialGeneration) return;
    setBusy(true);
    const r = await confirmInstagramSmoke(c.instagram.credentialGeneration).catch(() => ({ ok: false }));
    setBusy(false);
    toast(r.ok ? "Instagram smoke test confirmed" : "Could not confirm verification. Try again.", r.ok ? "success" : "error");
    if (r.ok) router.refresh();
  }
  return <section aria-label="Social connections" className="flex flex-col gap-3">
    <h2 className="mt-5 text-[11px] tracking-[.14em] text-text-3">SOCIALS</h2>
    {(["linkedin", "instagram"] as const).map((id) => <div key={id} id={`social-${id}`} className="scroll-mt-6">
      <ConnectionRow id={id} tile={id === "linkedin" ? "LI" : "IG"} title={`${id} token`} name={id === "linkedin" ? "LinkedIn" : "Instagram"} status={status(c[id])}
        statusLabel={c[id]?.status === "verification_pending" ? "VERIFICATION PENDING" : !c[id] ? "MOCK" : undefined}
        detail={c[id] ? `${c[id].login} · ••••${c[id].last4}${c[id].expiresAt ? ` · expires ${new Date(c[id].expiresAt).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney" })}` : " · expiry not provided"}${c[id].lastSyncError ? ` · ${c[id].lastSyncError}` : ""}` : "MOCK until connected. Nothing leaves LifeOS."}
        removeBody="Queued approvals keep their original account binding and cannot fall back to mock publishing." onChanged={() => router.refresh()}>
        {id === "instagram" && c.instagram?.status === "verification_pending" && <div className="flex flex-col gap-3 rounded-14 border border-white/[.08] p-4 text-[13px]">
          <p>Real publishing and analytics are disabled. Complete the owner smoke test outside LifeOS, then confirm each check.</p>
          {["I verified the token expiry and granted Instagram Login scopes in the Meta dashboard.", "I published one owner-controlled image using a public HTTPS image URL and confirmed the post.", "I checked a real image insights response and its returned metric names."].map((label, i) => <label key={label} className="flex items-start gap-2"><Checkbox checked={checked[i]} onChange={(e) => setChecked(checked.map((v, n) => n === i ? e.target.checked : v))} />{label}</label>)}
          <Button disabled={!checked.every(Boolean) || busy} onClick={confirm}>Confirm Instagram smoke test</Button>
        </div>}
      </ConnectionRow>
    </div>)}
    <div id="social-tiktok" className="scroll-mt-6"><TikTokConnection connection={c.tiktok} app={c.tiktok_app} redirectUri={redirectUri} result={result} /></div>
    <div id="social-portfolio" className="scroll-mt-6"><ConnectionRow tile="PF" name="Portfolio" readOnly status="none" statusLabel="MANUAL" detail="No connection needed: Markdown export" /></div>
  </section>;
}

function TikTokConnection({ connection, app, redirectUri, result }: { connection: SocialConnectionsData["tiktok"]; app: SocialConnectionsData["tiktok_app"]; redirectUri: string; result: string | null }) {
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
    const values = [key, secret]; setKey(""); setSecret(""); setBusy(true); setError(undefined);
    const r = await saveTikTokCredentials(values[0]!, values[1]!).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok) return setError("Could not save TikTok app credentials. Check both values and retry.");
    setOpen(false); toast("TikTok app credentials saved"); router.refresh();
  }
  async function remove(target: "tiktok" | "tiktok_app") {
    setBusy(true);
    const r = await disconnect(target).catch(() => ({ ok: false })); setBusy(false);
    toast(r.ok ? "TikTok disconnected" : "Could not disconnect TikTok.", r.ok ? "success" : "error");
    if (r.ok) { setRemoving(null); router.refresh(); }
  }
  return <ConnectionRow tile="TT" name="TikTok" status={status(connection)} statusLabel={!connection ? "MOCK" : undefined}
    detail={connection ? `${connection.login} · ••••${connection.last4} · expires ${connection.expiresAt ? new Date(connection.expiresAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" }) : "not provided"}${connection.lastSyncError ? ` · ${connection.lastSyncError}` : ""}` : "MOCK analytics until connected. Posting always uses manual copy."}
    action={<><Button variant="secondary" disabled={busy} onClick={() => { setKey(""); setSecret(""); setOpen(!open); }}>{app ? "Replace app credentials" : "Add app credentials"}</Button>{app && <a className="text-[13px] text-cyan" href="/api/connections/tiktok/start">Connect TikTok</a>}{connection && <Button variant="ghost" disabled={busy} onClick={() => setRemoving("tiktok")}>Disconnect</Button>}</>}>
    {result && <p role="status" className="text-[13px] text-text-2">{result === "connected" ? "TikTok connected. Actual granted scopes are listed below." : "TikTok connection was not completed. Review the app configuration and reconnect."}</p>}
    {connection && <div className="text-[13px] text-text-2"><p>Granted scopes: {connection.scopes.join(", ") || "none"}</p>{["user.info.stats", "video.list"].filter((s) => !connection.scopes.includes(s)).map((s) => <p key={s} className="text-amber">Missing {s}: {s === "video.list" ? "video metrics" : "account statistics"} unavailable.</p>)}</div>}
    <p className="break-all text-[12px] text-text-3">Exact redirect URI: {redirectUri}{app ? ` · App key ••••${app.last4}` : ""}</p>
    <Button variant="ghost" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(redirectUri); toast("Redirect URI copied"); } catch { toast("Couldn't copy. Select the redirect URI and copy it yourself.", "error"); } }}>Copy redirect URI</Button>
    {open && <form onSubmit={save} className="flex flex-col gap-3 rounded-14 border border-white/[.1] p-4">
      <Field label="TikTok client key"><Input type="password" autoComplete="off" data-1p-ignore required maxLength={255} value={key} onChange={(e) => setKey(e.target.value)} /></Field>
      <Field label="TikTok client secret"><Input type="password" autoComplete="off" data-1p-ignore required maxLength={255} value={secret} onChange={(e) => setSecret(e.target.value)} /></Field>
      {error && <p role="alert" className="text-[13px] text-red">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>Save app credentials</Button><Button variant="ghost" disabled={busy} onClick={() => { setKey(""); setSecret(""); setOpen(false); }}>Cancel</Button>{app && <Button variant="destructive" disabled={busy} onClick={() => setRemoving("tiktok_app")}>Remove app credentials</Button>}</div>
    </form>}
    <Dialog open={removing !== null} title={removing === "tiktok_app" ? "Remove TikTok app credentials" : "Disconnect TikTok"} onClose={() => { if (!busy) setRemoving(null); }} actions={<><Button variant="secondary" disabled={busy} onClick={() => setRemoving(null)}>Stay connected</Button><Button variant="destructive" disabled={busy} onClick={() => { if (removing) void remove(removing); }}>Disconnect TikTok</Button></>}>
      LifeOS stops syncing TikTok stats and goes back to MOCK. Your TikTok account is unchanged.
    </Dialog>
  </ConnectionRow>;
}
