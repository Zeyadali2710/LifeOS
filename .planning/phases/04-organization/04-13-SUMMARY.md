---
phase: 04-organization
plan: 13
subsystem: calendar
tags: [calendar, sync, notifications, ORG-01]
requires: [04-08, 04-09, 04-10]
provides: [createCalendarSync, SYNC_WINDOW_DAYS, fakeCalendarProvider]
affects: [04-14]
key-files:
  created:
    - src/server/calendar/sync.ts
    - tests/helpers/fake-calendar.ts
    - tests/db/calendar-sync.test.ts
    - tests/db/calendar-sync-auth.test.ts
requirements-completed: [ORG-01]
duration: ~20min
completed: 2026-10-10
---

# Phase 4 Plan 13: Calendar sync service Summary

Provider-agnostic `createCalendarSync({ handle, providerFor, emit, now })` that syncs enabled, categorised calendars over a 30d-back/365d-ahead window, with silent first sync, 7-day-relevant activity, deduped 48h conflict notifications and auth-pause.

## Tasks
1. Fake provider + sync core: 2abec5d
2. Auth failure pause/RECONNECT test: dc8e2fb (auth branch is implemented in sync.ts in commit 1)

## Behaviour notes
- Rows and cursor/ctag are written in one transaction, rows before cursor; a failure keeps the old cursor.
- Conflict notifications are skipped when only first-sync connections changed (keeps first sync silent). Dedup keys live in settings `calendar.notified_conflicts` as `{key: detectedAtISO}`, pruned after 3 days.
- Summary "Calendar synced" is emitted whenever any meaningful change exists, with the full count; individual items capped at 5.
- Rate-limit and unavailable messages use `providerLabel`; other errors are logged and recorded as "Sync failed. Retrying in 5 minutes."

## Deviations from Plan
- Worktree base was behind 2c69a54; reset to it per the startup check (expected).
- The synthetic auth test uses a ProviderError with a fixed message; the secret-scan asserts the sentinel never reaches emitted payloads or connection error columns.

## Verification
- `npx tsc --noEmit`: clean. `npm run lint`: 0 errors (5 pre-existing warnings in unrelated files).
- **DB tests NOT run here (no local Postgres); unverified.** Run on the VM:
  `bash scripts/vm-db-test.sh tests/db/calendar-sync.test.ts tests/db/calendar-sync-auth.test.ts`
  Expected-time strings in calendar-sync.test.ts were hand-computed (Sydney AEDT +11); if they fail, check those first.

## Known Stubs
None. `tests/helpers/fake-calendar.ts` is a labelled mock (ADR-010), not referenced from `src/`.

## Self-Check: PASSED
Files exist; commits 2abec5d and dc8e2fb present.
