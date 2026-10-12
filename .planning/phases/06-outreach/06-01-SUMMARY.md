---
phase: 06-outreach
plan: 01
subsystem: database
tags: [drizzle, postgres, outreach, mail]
requires: []
provides: [migration 0008, QUEUES eventsSync/mailSync/mailTriage, src/lib/outreach-types.ts]
affects: [06-02..06-18]
key-files:
  created: [drizzle/0008_outreach.sql, drizzle/meta/0008_snapshot.json, src/lib/outreach-types.ts, tests/unit/outreach-types.test.ts]
  modified: [src/server/db/schema.ts, drizzle/meta/_journal.json, src/server/queue.ts, tests/db/migrations.test.ts]
decisions:
  - Stage data lives in src/lib/outreach-types.ts (not src/outreach/stage.ts); UI plans import from there.
  - GIN index named outreach_events_sources_gin (drizzle-kit requires a name for expression indexes).
metrics:
  completed: 2026-10-13
---

# Phase 6 Plan 01: Outreach data contract Summary

Migration 0008 (event_sources, outreach_events, mail_messages; tasks.outreach_event_id / mail_message_id ON DELETE SET NULL; connections.scopes), three queue names, and one client-safe types module with tested stage helpers.

## Commits
- feat(06-01): outreach + mail tables, tasks FKs, connections.scopes (migration 0008)
- feat(06-01): outreach queue names and client-safe outreach types

## Tests
- tests/unit: 40 files, 362 tests passed
- tests/db: 45 files, 310 tests passed (includes new 0008 test: tables, columns, BOGUS stage rejected, migrations applied twice)
- tsc and eslint clean

## Deviations from Plan
- [Rule 3] Added an explicit index name for the jsonb_path_ops GIN index; drizzle-kit refused to generate otherwise.
- Check-constraint value lists are built from the shared constants via a small `inList` helper in schema.ts.
- No mail body column (grep for "body" in 0008 is 0).

## Owner actions
- VM migrate happens in plan 19 (no action now).

## Self-Check: PASSED
