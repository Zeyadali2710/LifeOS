---
phase: 02-shell
plan: 07
subsystem: client-live-store
tags: [sse, react, eventsource]
requires: [02-01]
provides: [LiveProvider, useLive, live helpers]
key-files:
  created: [src/shell/live.ts, src/shell/live-provider.tsx, tests/unit/live.test.ts]
requirements-completed: [SHL-04, SHL-05]
completed: 2026-10-08
---

# Phase 2 Plan 07: Live client store Summary

Single-EventSource LiveProvider/useLive with 1s-30s backoff reconnect, snapshot resync (activity/notifications/health), fresh-id tracking, snooze wake timer and polite connection announcements; pure helpers unit-tested.

## Commits
- 51d4684 pure helpers + tests (6 passing)
- 39d5cc8 LiveProvider

## Deviations
None. Lint: 2 warnings (`@next/next/no-location-assign-relative-destination`) on the required `window.location.assign("/login")` (plan acceptance mandates it; full reload on 401 is intentional). 0 errors.

## Notes
Provider behaviour is not unit-tested (per plan; covered by plans 11/12 e2e). Notifications SSE merge is unbounded by limit (snapshot is authoritative on resync).

## Self-Check: PASSED
