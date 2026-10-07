"use client";

import type { Health } from "@/server/health";
import { StatusTile } from "@/ui/status-tile";
import { useLive } from "./live-provider";

const MAP = {
  ok: ["Healthy", "green"],
  degraded: ["Degraded", "amber"],
  down: ["Down", "red"],
} as const;

export function SystemTile({ initial }: { initial: Health | null }) {
  const h = useLive().health ?? initial;
  const [value, dot] = (h && MAP[h.status as keyof typeof MAP]) || (["Unknown", "muted"] as const);
  return <StatusTile label="SYSTEM" value={value} dot={dot} />;
}
