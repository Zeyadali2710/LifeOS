import type { Health } from "@/server/health";

export const NOTIFICATION_CATEGORIES = ["URGENT", "IMPORTANT", "FYI", "AGENT", "APPROVAL", "REMINDER"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type ActivityTone = "red" | "amber" | "green";

export type ActivityDTO = {
  id: string;
  at: string;
  type: string;
  source: string;
  title: string;
  detail: string | null;
  tone: ActivityTone | null;
  health: Health | null;
};

export type NotificationDTO = {
  id: string;
  category: NotificationCategory;
  source: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  createdAt: string;
  readAt: string | null;
  snoozedUntil: string | null;
};

export type NotificationsSnapshot = { items: NotificationDTO[]; unread: number; nextWake: string | null };
export type LiveKind = "activity" | "notification" | "resync";
