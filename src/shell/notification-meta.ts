import type { NotificationCategory, NotificationDTO } from "@/lib/live-types";
import type { IconName } from "@/ui/icon-names";

export type Tone = "red" | "amber" | "indigo" | "blue" | "green";

export const CATEGORY_META: Record<NotificationCategory, { icon: IconName; tone: Tone; colour: string; tag: string; important: boolean }> = {
  URGENT: { icon: "error", tone: "red", colour: "#ff6961", tag: "URGENT", important: true },
  IMPORTANT: { icon: "priority_high", tone: "amber", colour: "#ff9f0a", tag: "IMPORTANT", important: true },
  APPROVAL: { icon: "verified_user", tone: "amber", colour: "#ff9f0a", tag: "APPROVAL", important: false },
  AGENT: { icon: "memory", tone: "indigo", colour: "#64d2ff", tag: "AGENT", important: false },
  FYI: { icon: "info", tone: "blue", colour: "#64d2ff", tag: "FYI", important: false },
  REMINDER: { icon: "alarm", tone: "green", colour: "#30d158", tag: "REMINDER", important: false },
};

// Icon override never changes tone; there is no schema icon column.
export function iconFor(n: NotificationDTO): IconName {
  return n.source === "auth" ? "lock" : CATEGORY_META[n.category].icon;
}
