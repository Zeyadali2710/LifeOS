import type { Health } from "./health";
import type { Weather } from "./weather";
import { dateLabel } from "./time";

export function dateLine(now: Date, w: Weather | null): string {
  const base = dateLabel(now);
  if (!w) return base;
  return `${base} · SYDNEY · ${w.temp}°C${w.word ? ` ${w.word}` : ""}`;
}

export type LeadPart = { text: string; strong?: boolean };

export function lead({ unreadImportant, health }: { unreadImportant: number; health: Health | null }): LeadPart[] {
  if (unreadImportant > 0) {
    const strong = unreadImportant === 1 ? "1 item needs your attention." : `${unreadImportant} items need your attention.`;
    const tail = health === null ? "" : ` Systems are ${health.status === "ok" ? "healthy" : health.status}.`;
    return tail ? [{ text: strong, strong: true }, { text: tail }] : [{ text: strong, strong: true }];
  }
  if (health === null) return [{ text: "System status is unknown.", strong: true }];
  if (health.status !== "ok") {
    const why = health.db === "down" ? " Database is not responding." : health.worker === "stale" ? " Worker is not responding." : "";
    return [{ text: `Systems are ${health.status}.`, strong: true }, ...(why ? [{ text: why }] : [])];
  }
  return [{ text: "Everything is quiet. " }, { text: "Nothing needs your attention.", strong: true }];
}
