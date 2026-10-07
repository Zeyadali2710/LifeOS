---
phase: 02-shell
plan: 04
subsystem: events
tags: [activity, notifications, auth, monitor, instrumentation, e2e]
requires: [02-01, 02-02]
provides:
  - emitAuthEvent (auth hooks feed activity stream)
  - createMonitor/start (web-process health + version transitions)
  - worker_started and migrations_applied events
  - e2e helpers (signIn, seedHeartbeat, insertNotification, E2E_DB_URL)
key-files:
  created: [src/server/auth-events.ts, src/server/monitor.ts, src/instrumentation.ts, tests/db/auth-events.test.ts, tests/db/monitor.test.ts]
  modified: [src/server/auth.ts, src/worker/index.ts, src/scripts/migrate.ts, tests/e2e/owner.ts]
decisions:
  - "Health 'db down' copy takes precedence over worker state (worker is 'unknown' when db is down)"
  - "start() schedules a 1s kick plus 30s interval, both unref'd; register() never awaits DB work"
metrics:
  tasks: 3
  completed: 2026-10-08
---

# Phase 2 Plan 04: Event sources Summary

All Phase 2 real event sources now feed emitActivity: auth hooks (sign in/out/failed with a 10-minute throttled URGENT notification), a debounced compare-and-set health/version monitor started from instrumentation.ts, worker start, and migrations; plus shared e2e helpers.

## Tasks
1. Auth events: `5d94884`
2. Monitor + instrumentation: `dd1a3a1`
3. Worker/migrate events + e2e helpers: `8a09cd2`

## Verification
- vitest full suite: 13 files / 52 tests pass (auth-events 2, monitor 5 including two-monitor CAS)
- typecheck clean; eslint on `src tests` clean; `build:worker` ok; `playwright test --list` parses 16 tests
- `npm run db:migrate` twice: exit 0, no hang (no new migrations, so the delta emit path was not exercised live)

## Deviations from Plan
- [Rule 1] db-down degraded copy: worker is "unknown" when db is down, so the worker branch is only chosen when `db === "ok"`.
- Plan interface said `useTestDb`; used `setupTestDb` per orchestrator note.
- `npm run lint -- src tests` still lints design/support.js (known pre-existing errors); ran `npx eslint src tests` instead.

## Known Stubs
None.

## Self-Check: PASSED
