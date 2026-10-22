"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setFreePrivateAction } from "@/server/settings-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Checkbox } from "@/ui/controls";
import s from "./settings.module.css";
export function FreePrivacy({ value }: {
  value: boolean;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const [priv, setPriv] = useState(value);
  async function togglePrivate(next: boolean) {
    setPriv(next);
    const r = await setFreePrivateAction(next).catch(() => ({ ok: false }));
    if (!r.ok) {
      setPriv(!next);
      return toast("Couldn't save that. Try again.", "error");
    }
    toast(next ? "Private data allowed on free models" : "Private data kept off free models");
    router.refresh();
  }
  return <div className={s.stack}>
    <Checkbox label="Allow private data (private repos, calendar and tasks) to be sent to free models (may be logged by provider)" checked={priv} onChange={e => togglePrivate(e.target.checked)} />
    <p className={s.note}>Off: any run that touches a private repository, your calendar or your tasks switches to Claude Sonnet before private data is sent. Free providers may log or train on prompts.</p>
  </div>;
}
