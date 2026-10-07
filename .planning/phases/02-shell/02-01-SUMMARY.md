---
phase: 02-shell
plan: 01
subsystem: events
tags: [postgres, listen-notify, drizzle, vitest]
requires: []
provides: [emitActivity, createHub, getHub, live DTO types, setupTestDb]
affects: [02-04, 02-05, 02-07]
key-files:
  created: [src/lib/live-types.ts, src/server/events.ts, src/server/hub.ts, tests/db/helpers.ts, tests/db/events.test.ts, tests/db/hub.test.ts]
decisions:
  - "Test helper named setupTestDb (not useTestDb): react-hooks lint rule flags the use* prefix at top level"
metrics:
  tasks: 2
  files: 6
  completed: 2026-10-08
---

# Phase 2 Plan 01: Event backbone Summary

Id-only pg_notify emit helper (never throws) plus a single-connection LISTEN hub with 1s-30s backoff reconnect and resync events, tested against throwaway Postgres DBs.

## Tasks
1. DTO contract, emitActivity, DB helper: 506d29d
2. LISTEN hub: 1362dd0

## Verification
- `npx vitest run tests/db`: 10/10 pass (incl. pg_terminate_backend reconnect)
- `npm run typecheck`: pass; `npx eslint src tests`: clean

## Deviations from Plan
- [Rule 3] Helper renamed `useTestDb` -> `setupTestDb` (lint rules-of-hooks). Plans that reference useTestDb must use the new name. Helper also exposes `pool()` for raw SQL in tests.
- [Rule 1] hub stop test compares connection count before/after (other hubs share the DB), not absolute zero.
- hub.ts imports `./env` (plan said env.ts in src/server; confirmed).

## Deferred Issues
`npm run lint` (whole repo) fails on 2 pre-existing errors in design/support.js; see deferred-items.md. Not caused by this plan.

## Self-Check: PASSED
