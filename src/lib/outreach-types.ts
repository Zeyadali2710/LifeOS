// Client-safe: no server imports.

export const STAGES = ["SAVED", "INTERESTED", "ATTENDING", "ATTENDED", "FOLLOW_UP"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_ORDER: (Stage | null)[] = [null, ...STAGES];
export const STAGE: Record<Stage, { label: string; tone: "neutral" | "blue" | "green" | "amber" }> = {
  SAVED: { label: "Saved", tone: "neutral" },
  INTERESTED: { label: "Interested", tone: "neutral" },
  ATTENDING: { label: "Attending", tone: "blue" },
  ATTENDED: { label: "Attended", tone: "green" },
  FOLLOW_UP: { label: "Follow up", tone: "amber" },
};

export function nextStage(s: Stage | null): Stage | null {
  return STAGE_ORDER[STAGE_ORDER.indexOf(s) + 1] ?? null;
}
export function prevStage(s: Stage | null): Stage | null {
  const i = STAGE_ORDER.indexOf(s);
  return i > 0 ? STAGE_ORDER[i - 1]! : null;
}
export function canMove(from: Stage | null, to: Stage | null): boolean {
  return Math.abs(STAGE_ORDER.indexOf(from) - STAGE_ORDER.indexOf(to)) === 1;
}

export const EVENT_SOURCE_KINDS = ["ics", "eventbrite", "luma", "meetup_mock", "humanitix_mock"] as const;
export type EventSourceKind = (typeof EVENT_SOURCE_KINDS)[number];
export const SOURCE_LABEL: Record<EventSourceKind | "url", string> = {
  ics: "iCal",
  eventbrite: "Eventbrite",
  luma: "Luma",
  meetup_mock: "Meetup",
  humanitix_mock: "Humanitix",
  url: "URL",
};

export const MAIL_CATEGORIES = ["IMPORTANT", "EVENTS", "NETWORKING", "OPPORTUNITIES", "FOLLOW-UP", "OTHER"] as const;
export type MailCategory = (typeof MAIL_CATEGORIES)[number];
export const IMPORTANCE = ["HIGH", "MEDIUM", "LOW"] as const;
export type Importance = (typeof IMPORTANCE)[number];

export const DEFAULT_INTERESTS = [
  "Entrepreneurship", "Startups", "Computer Science", "Cybersecurity", "Engineering", "AI", "Fintech", "Networking",
];
export const INTERESTS_KEY = "outreach.interests";

export type Signal = { label: "INTERESTS" | "PROJECTS" | "SCHEDULE"; value: number; max: number; terms: string[]; note?: string };

export type RawEvent = {
  remoteId: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  timeZone: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  online: boolean;
  organizer: string | null;
  priceText: string | null;
  url: string | null;
  description: string;
  categories: string[];
};

export type Addr = { name: string; address: string };
export type ActionItem = { text: string; due?: string | null };

export type OutreachEventDTO = {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  timeZone: string | null;
  location: string | null;
  online: boolean;
  organizer: string | null;
  priceText: string | null;
  url: string | null;
  description: string;
  categories: string[];
  isMock: boolean;
  sourceKinds: string[];
  score: number;
  signals: Signal[];
  why: string;
  stage: Stage | null;
  calendarEventId: string | null;
  dismissedAt: string | null;
};

export type EventSourceDTO = {
  id: string;
  kind: EventSourceKind;
  label: string;
  host: string | null;
  enabled: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  discover: boolean | null;
  organizerIds: string[];
};

export type MailMessageDTO = {
  id: string;
  threadId: string;
  from: Addr;
  to: Addr[];
  cc: Addr[];
  subject: string;
  receivedAt: string;
  snippet: string;
  bulk: boolean;
  category: MailCategory | null;
  importance: Importance | null;
  summary: string | null;
  action: string | null;
  actionItems: ActionItem[];
  flagged: boolean;
  flaggedAt: string | null;
  archivedAt: string | null;
  triagedAt: string | null;
};

// ---- Mail view + follow-ups (plan 17). Never carries a body. ----
export type MailCat = Lowercase<MailCategory> | "untriaged" | "archived";
export type MailCounts = Record<MailCategory | "UNTRIAGED" | "ARCHIVED", number>;
export type MailState = "not_connected" | "scope_missing" | "reconnect" | "first_sync" | "ok";
export type MailStatus = { state: MailState; lastSyncAt: string | null; lastSyncError: string | null; triagePaused: boolean };

export type FollowUpDTO = {
  id: string;
  title: string;
  dueDate: string | null;
  context: { kind: "event"; id: string; title: string } | { kind: "email"; id: string; subject: string; sender: string };
};
