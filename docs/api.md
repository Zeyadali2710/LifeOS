# API

All routes require an authenticated owner session unless marked public.

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/*` | * | public | Better Auth (sign-in, sign-out, session) |
| `/api/health` | GET | public | `{ status, db, worker, version }` — no secrets, no internals |
| `/api/events` | GET | owner | SSE stream. Events: `activity`, `notification`, `resync`. NOTIFY payloads carry ids only; rows are fetched server-side. Stream lives 15 minutes, then closes so the client reconnects and re-authenticates. 401 without a session |
| `/api/activity` | GET | owner | `{ items }` recent activity events |
| `/api/notifications` | GET | owner | `{ items, unread, nextWake }` inbox (excludes dismissed and future-snoozed) |

## Notification server actions
Owner-only (`requireOwner()`), in `src/server/notification-actions.ts`. All return `{ ok: boolean }`; invalid input returns `{ ok: false }`.

- `markRead(id, read)`: `id` is a UUID, `read` a boolean.
- `markAllRead()`
- `snooze(id, untilIso)`: UUID plus ISO datetime that is in the future and at most 30 days ahead.
- `dismiss(id)`: UUID.

Later phases append here (chat, approvals, ...).
