"use client";

import { useState } from "react";
import type { ApprovalDTO } from "@/lib/agent-types";
import { useAgentStatus } from "@/features/shell/agent-status";
import { useShell } from "@/features/shell/shell-provider";

type Result = { ok: boolean; approval?: ApprovalDTO; errors?: Record<string, string> };
export type Busy = "approve" | "reject" | "save" | "retry" | "draft" | null;

/** Runs one decision at a time, applies the returned approval, refreshes the shared count and toasts the outcome. */
export function useDecide(onChange: (a: ApprovalDTO) => void, onErrors?: (e: Record<string, string>) => void) {
  const { toast } = useShell();
  const { refresh } = useAgentStatus();
  const [busy, setBusy] = useState<Busy>(null);
  const guard = async (k: NonNullable<Busy>, fn: () => Promise<Result>, done?: string): Promise<boolean> => {
    setBusy(k);
    const r = await fn().catch((): Result => ({ ok: false }));
    setBusy(null);
    if (r.approval) onChange(r.approval);
    if (r.errors) {
      onErrors?.(r.errors);
      return false;
    }
    if (!r.ok) {
      toast("Couldn't record that decision. Try again.", "error");
      return false;
    }
    if (done) toast(done);
    void refresh();
    return true;
  };
  return { busy, guard };
}
