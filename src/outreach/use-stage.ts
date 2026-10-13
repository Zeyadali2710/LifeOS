"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Stage } from "@/lib/outreach-types";
import { moveStageAction } from "@/server/outreach-pipeline-actions";
import { useShell } from "@/shell/shell-provider";

/** Optimistic stage for one event: flips at once, reverts with a toast when the server refuses. */
export function useStage(id: string, initial: Stage | null) {
  const router = useRouter();
  const { toast } = useShell();
  const [seen, setSeen] = useState(initial);
  const [stage, setStage] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setStage(initial);
  }
  const move = async (to: Stage | null) => {
    const from = stage;
    setStage(to);
    const r = await moveStageAction(id, from, to).catch(() => ({ ok: false }) as const);
    if (!r.ok) {
      setStage(from);
      toast("Couldn't update the event. Try again.", "error");
    }
    router.refresh();
  };
  return { stage, move };
}
