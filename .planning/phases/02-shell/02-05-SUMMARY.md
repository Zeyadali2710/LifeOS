---
phase: 02-shell
plan: 05
subsystem: notifications
tags: [notifications, sse, server-actions, api]
requires: [02-01, 02-02]
provides:
  - notifications.ts (inbox/unread/nextWake/snapshot + mutations)
  - owner-guarded server actions markRead/markAllRead/snooze/dismiss
  - GET /api/events (SSE), /api/activity, /api/notifications
key-files:
  created: [src/server/notifications.ts, src/server/notification-actions.ts, src/app/api/events/route.ts, src/app/api/activity/route.ts, src/app/api/notifications/route.ts, tests/db/notifications.test.ts, tests/db/notification-actions.test.ts]
decisions:
  - "Actions tests inject the DB by mocking @/server/db/client; owner denial via a mutable flag in the session mock (vi.fn rejections were reported as test failures by vitest 5)"
metrics:
  tasks: 3
  completed: 2026-10-08
---

# Phase 2 Plan 05: Notification server side Summary

Notification inbox/read/snooze/dismiss queries and zod-validated owner-only server actions, plus the authenticated SSE stream and two resync snapshot routes.

## Tasks
1. Queries/mutations: `edd1a2a`
2. Server actions: `58ff181`
3. SSE + snapshot routes: `31d54c3`

## Verification
- `vitest run tests/db`: 7 files / 20 tests pass (notifications 1, notification-actions 2)
- typecheck clean; `npx eslint src tests` clean
- `next build` and SSE/401 behavior not run here (build deferred to wave end; behavior covered by plan 11 e2e)

## Deviations from Plan
- Used `setupTestDb` (not useTestDb) and `npx eslint src tests` per orchestrator notes.
- Test mocks session with a plain function and flag instead of `vi.fn` (vitest 5 flags rejected mock calls as failures).

## Self-Check: PASSED
