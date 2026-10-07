import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Column names are snake_case via `casing: "snake_case"` (see client.ts, drizzle.config.ts).
const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};

// ── Better Auth (field names must match its model) ─────────────────────────
export const users = pgTable("users", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    userId: text().notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text().notNull().references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const verifications = pgTable("verifications", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  ...timestamps,
});

export const rateLimits = pgTable("rate_limits", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

// ── LifeOS core ─────────────────────────────────────────────────────────────
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    actor: text().notNull(), // "owner" | "agent:<id>" | "system"
    action: text().notNull(), // e.g. "auth.sign_in"
    target: text(),
    ip: text(),
    metadata: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [index().on(t.occurredAt.desc()), index().on(t.action)],
);

export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    type: text().notNull(), // dotted: "github.pr.opened", "agent.run.completed"
    source: text().notNull(), // integration or agent id
    entityType: text(),
    entityId: text(),
    title: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [index().on(t.occurredAt.desc()), index().on(t.type), index().on(t.entityType, t.entityId)],
);

export const notificationCategory = pgEnum("notification_category", [
  "URGENT",
  "IMPORTANT",
  "FYI",
  "AGENT",
  "APPROVAL",
  "REMINDER",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    category: notificationCategory().notNull(),
    priority: integer().notNull().default(0),
    source: text().notNull(),
    title: text().notNull(),
    body: text(),
    entityType: text(),
    entityId: text(),
    actionUrl: text(),
    activityEventId: uuid().references(() => activityEvents.id, { onDelete: "set null" }),
    readAt: timestamp({ withTimezone: true }),
    snoozedUntil: timestamp({ withTimezone: true }),
    dismissedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("notifications_inbox_idx").on(t.createdAt.desc()).where(sql`${t.dismissedAt} is null`)],
);
