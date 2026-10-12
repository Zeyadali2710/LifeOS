import { type CategoryKey, isCategory } from "./calendar-categories";

export type CalendarConnectionId = "google_calendar" | "icloud_calendar";

export interface CalendarDTO {
  id: string;
  connectionId: CalendarConnectionId;
  provider: "google" | "icloud";
  account: string | null;
  name: string;
  access: "owner" | "writer" | "reader";
  kind: string;
  enabled: boolean;
  category: CategoryKey | null;
  isDefault: boolean;
}

export interface CalendarConnectionDTO {
  id: CalendarConnectionId;
  status: "connected" | "error" | "none";
  configured: boolean;
  account: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  calendars: CalendarDTO[];
}

export interface InstanceDTO {
  key: string;
  eventId: string;
  calendarId: string;
  calendarName: string;
  category: CategoryKey | null;
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  startDate: string | null;
  endDate: string | null;
  tz: string | null;
  recurring: boolean;
  /** Raw RRULE value (no "RRULE:" prefix); humanise only for display. */
  rrule: string | null;
  instanceStart: string | null;
  status: "confirmed" | "tentative" | "cancelled";
  free: boolean;
  declined: boolean;
  readOnly: boolean;
  etag: string | null;
  conflictWith: string[];
}

export interface ConflictDTO {
  a: string;
  b: string;
  aTitle: string;
  bTitle: string;
  start: string;
  end: string;
}

export interface TaskDTO {
  id: string;
  title: string;
  notes: string;
  dueDate: string | null;
  dueTime: string | null;
  dueAt: string | null;
  priority: 1 | 2 | 3 | null;
  remindAt: string | null;
  completedAt: string | null;
  createdAt: string;
  projectId: string | null;
  milestoneId: string | null;
}

export interface PlanItemDTO {
  id: string;
  kind: "task" | "conflict";
  taskId: string;
  title: string;
  start: string | null;
  end: string | null;
  why: string;
  dueAt: string | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toTaskDTO(r: {
  id: string;
  title: string;
  notes: string;
  dueDate: string | null;
  dueTime: string | null;
  dueAt: Date | null;
  priority: number | null;
  remindAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  projectId: string | null;
  milestoneId: string | null;
}): TaskDTO {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    dueDate: r.dueDate,
    dueTime: r.dueTime,
    dueAt: iso(r.dueAt),
    priority: r.priority === 1 || r.priority === 2 || r.priority === 3 ? r.priority : null,
    remindAt: iso(r.remindAt),
    completedAt: iso(r.completedAt),
    createdAt: r.createdAt.toISOString(),
    projectId: r.projectId,
    milestoneId: r.milestoneId,
  };
}

export function toCalendarDTO(r: {
  id: string;
  connectionId: string;
  remoteId: string;
  name: string;
  account: string | null;
  access: string;
  kind: string;
  enabled: boolean;
  category: string | null;
  isDefault: boolean;
}): CalendarDTO {
  return {
    id: r.id,
    connectionId: r.connectionId as CalendarConnectionId,
    provider: r.connectionId === "icloud_calendar" ? "icloud" : "google",
    account: r.account,
    name: r.name,
    access: r.access === "owner" || r.access === "writer" ? r.access : "reader",
    kind: r.kind,
    enabled: r.enabled,
    category: isCategory(r.category) ? r.category : null,
    isDefault: r.isDefault,
  };
}
