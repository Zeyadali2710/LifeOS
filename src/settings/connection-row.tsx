"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { removeEventKeyAction } from "@/server/outreach-actions";
import { removeTokenAction } from "@/server/settings-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { StatusDot } from "@/ui/status-dot";
import { TokenForm } from "./token-form";

export type RowStatus = "connected" | "none" | "error" | "syncing";

const LABEL = { connected: "CONNECTED", none: "NOT CONNECTED", error: "RECONNECT", syncing: "SYNCING" } as const;
const DOT = { connected: "online", none: "none", error: "attention", syncing: "running" } as const;
const COLOR = { connected: "text-green", none: "text-text-3", error: "text-red", syncing: "text-cyan-soft" } as const;

export function ConnectionRow({
  id,
  title,
  tile,
  name,
  detail,
  status,
  noun,
  removeBody,
  readOnly = false,
  statusLabel,
  action,
  onChanged,
  children,
}: {
  id?: "github_read" | "github_write" | "openrouter" | "eventbrite" | "luma";
  title?: string;
  tile: string;
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
    const r = ev ? await removeEventKeyAction(id) : await removeTokenAction(id!);
    if (r.ok) {
      setOpen(false);
      toast(title ? `${title} removed` : id === "eventbrite" ? "Eventbrite key removed" : id === "luma" ? "Luma key removed" : `${noun === "read" ? "GitHub read" : "Issues-write"} token removed`);
      onChanged?.("removed");
    } else toast("Couldn't save that. Try again.", "error");
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`flex flex-wrap items-center gap-3.5 glass-card rounded-24 p-4 ${status === "error" ? "!border-[rgba(255,105,97,.3)]" : ""}`}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-14 bg-white/[.10] font-mono text-[11px] font-semibold">{tile}</span>
        <div className="min-w-[200px] flex-1">
          <div className="text-[14px] font-medium">{name}</div>
          <div className="text-[12.5px] text-text-3">{detail}</div>
        </div>
        <span className={`inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold tracking-[0.14em] ${COLOR[status]}`}>
          <StatusDot state={DOT[status]} pulse={status === "syncing"} />
          {statusLabel ?? LABEL[status]}
        </span>
        {action}
        {!readOnly && !action && (
          <Button
            size="md"
            className="h-8 min-w-[110px]"
            variant={status === "error" ? "inverse" : status === "connected" ? "secondary" : "primary"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {keyed ? (status === "connected" ? "Replace key" : "Add key") : status === "error" ? "Reconnect" : status === "connected" ? "Replace" : "Connect"}
          </Button>
        )}
      </div>
      {children}
      {open && id && (
        <>
          <TokenForm
            id={id}
            onCancel={() => setOpen(false)}
            onDone={(r) => {
              setOpen(false);
              toast(id === "eventbrite" ? "Eventbrite connected" : id === "luma" ? "Luma connected" : id === "openrouter" ? "OpenRouter connected · free models on" : id === "github_read" ? `GitHub connected · ${r.repos} repositories` : `Issue creation enabled · ${r.repos} repositories`);
              onChanged?.("saved");
            }}
          />
          {status !== "none" && (
            <div>
              <Button variant="ghost" className="text-red" onClick={() => setConfirm(true)}>
                {keyed ? "Remove key" : "Remove token"}
              </Button>
            </div>
          )}
        </>
      )}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={title ? `Remove the ${title}?` : `Remove the ${noun === "read" ? "GitHub read" : "issues-write"} token?`}
        initialFocus={() => document.getElementById("remove-token-cancel")}
        actions={
          <>
            <Button id="remove-token-cancel" variant="secondary" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              {keyed ? "Remove key" : "Remove token"}
            </Button>
          </>
        }
      >
        The encrypted {keyed ? "key" : "token"} is deleted from LifeOS. {removeBody} You can add a {keyed ? "key" : "token"} again at any time.
      </Dialog>
    </div>
  );
}
