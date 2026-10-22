"use client";
import s from "./settings.module.css";
import { useState } from "react";
import { disconnect } from "@/server/socials-actions";
import type { ReactNode } from "react";
import { removeEventKeyAction } from "@/server/outreach-actions";
import { removeTokenAction } from "@/server/settings-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/overlay";
import { Status } from "@/ui/display";
import { TokenForm } from "./token-form";
export type RowStatus = "connected" | "none" | "error" | "syncing";
const LABEL = { connected: "CONNECTED", none: "NOT CONNECTED", error: "RECONNECT", syncing: "SYNCING" } as const;
export function ConnectionRow({ id, title, name, detail, status, noun, removeBody, readOnly = false, statusLabel, action, onChanged, children, }: {
  id?: "github_read" | "github_write" | "openrouter" | "eventbrite" | "luma" | "linkedin" | "instagram";
  title?: string;
  name: string;
  detail: ReactNode;
  status: RowStatus;
  noun?: string;
  removeBody?: string;
  readOnly?: boolean;
  statusLabel?: string;
  action?: ReactNode;
  onChanged?: (message: string) => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { toast } = useShell();
  const keyed = id === "eventbrite" || id === "luma";
  async function remove() {
    setConfirm(false);
    const ev = id === "eventbrite" || id === "luma";
    const r = id === "linkedin" || id === "instagram" ? await disconnect(id) : ev ? await removeEventKeyAction(id) : await removeTokenAction(id!);
    if (r.ok) {
      setOpen(false);
      toast(title ? `${title} removed` : id === "eventbrite" ? "Eventbrite key removed" : id === "luma" ? "Luma key removed" : `${noun === "read" ? "GitHub read" : "Issues-write"} token removed`);
      onChanged?.("removed");
    }
    else
      toast("Couldn't save that. Try again.", "error");
  }
  return (<div className={s.connection}>
    <div className={s.connectionRow}>
      <div className={s.connectionInfo}>
        <h3>
          {name}
        </h3>
        <div className={s.detail}>
          <Status tone={statusLabel === "VERIFICATION PENDING" ? "approval" : status === "connected" || status === "syncing" ? "working" : status === "error" ? "failed" : "idle"} glyph={statusLabel === "MANUAL" ? "–" : statusLabel === "VERIFICATION PENDING" ? "▲" : status === "connected" ? "✓" : status === "error" ? "×" : status === "syncing" ? "…" : "○"}>
            {statusLabel ?? LABEL[status]}
          </Status>
          <span>
            {detail}
          </span>
        </div>
      </div>
      <div className={s.actions}>
        {action}{!readOnly && !action && <Button variant={status === "error" ? "primary" : "secondary"} aria-expanded={open} onClick={() => setOpen(!open)}>
          {status === "error" ? "Reconnect" : status === "none" ? "Connect" : "Manage"}
        </Button>}
      </div>
    </div>
    {children}{open && id && <div className={s.stack}>
      <TokenForm id={id} onCancel={() => setOpen(false)} onDone={r => { setOpen(false); toast(id === "linkedin" ? "LinkedIn connected" : id === "instagram" ? "Instagram saved · verification pending" : id === "eventbrite" ? "Eventbrite connected" : id === "luma" ? "Luma connected" : id === "openrouter" ? "OpenRouter connected · free models on" : id === "github_read" ? `GitHub connected · ${r.repos} repositories` : `Issue creation enabled · ${r.repos} repositories`); onChanged?.("saved"); }} />
      {status !== "none" && <Button variant="text" destructive onClick={() => setConfirm(true)}>
        {keyed ? "Remove key" : "Remove token"}
      </Button>}
    </div>}
    <Dialog open={confirm} onClose={() => setConfirm(false)} title={title ? `Remove the ${title}?` : `Remove the ${noun === "read" ? "GitHub read" : "issues-write"} token?`} footer={<>
      <Button id="remove-token-cancel" autoFocus onClick={() => setConfirm(false)}>Cancel</Button>
      <Button variant="danger" onClick={remove}>
        {keyed ? "Remove key" : "Remove token"}
      </Button>
    </>}>
      <p className={s.note}>The encrypted {keyed ? "key" : "token"} is deleted from LifeOS. {removeBody} You can add a {keyed ? "key" : "token"} again at any time.</p>
    </Dialog>
  </div>);
}
