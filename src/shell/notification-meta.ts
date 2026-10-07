import type { NotificationCategory, NotificationDTO } from "@/lib/live-types";
import type { IconName } from "@/ui/icon-names";

export type Tone = "red" | "amber" | "indigo" | "blue" | "green";

export const CATEGORY_META: Record<NotificationCategory, { icon: IconName; tone: Tone; colour: string; tag: string; important: boolean }> = {
  URGENT: { icon: "error", tone: "red", colour: "#f07a6e", tag: "URGENT", important: true },
  IMPORTANT: { icon: "priority_high", tone: "amber", colour: "#e8b86a", tag: "IMPORTANT", important: true },
  APPROVAL: { icon: "verified_user", tone: "amber", colour: "#e8b86a", tag: "APPROVAL", important: false },
  AGENT: { icon: "memory", tone: "indigo", colour: "#a5a6ff", tag: "AGENT", important: false },
  FYI: { icon: "info", tone: "blue", colour: "#6cb6ff", tag: "FYI", important: false },
  REMINDER: { icon: "alarm", tone: "green", colour: "#4fd1a1", tag: "REMINDER", important: false },
};

// Icon override never changes tone; there is no schema icon column.
export function iconFor(n: NotificationDTO): IconName {
  return n.source === "auth" ? "lock" : CATEGORY_META[n.category].icon;
}
