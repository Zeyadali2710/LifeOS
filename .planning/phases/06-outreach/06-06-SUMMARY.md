---
phase: 06-outreach
plan: 06
subsystem: outreach-pipeline
tags: [pipeline, server-actions, live]
requires: [06-01]
provides: [moveStage, dismissEvent, restoreEvent, addToCalendar, createFollowUps, outreach live kind, five owner actions]
key-files:
  created: [src/server/outreach/pipeline.ts, src/server/outreach-pipeline-actions.ts, tests/db/outreach-pipeline.test.ts]
  modified: [src/server/events.ts, src/lib/live-types.ts, src/server/hub.ts, src/shell/live-provider.tsx, src/shell/activity-list.tsx]
decisions:
  - Provider call happens outside the FOR UPDATE transaction; the link is a conditional update and the race loser deletes its own remote event using a Target built from the new calendar_events row etag.
  - Follow-up task lines are validated by createTask inside the transaction; a thrown Rollback carries field errors keyed lines.N.field.
metrics:
  completed: 2026-10-13
---

# Phase 6 Plan 06: Outreach pipeline server side Summary

Stage transitions, Add to calendar, follow-up tasks and dismiss/restore are enforced server-side with audit (ids and stages only), Outreach activity events and an "outreach" live signal, exposed through five owner-guarded server actions.

## Commits
- 563876f feat(06-06): outreach pipeline service and outreach live signal
- 14be9dd feat(06-06): owner server actions and DB tests for the pipeline

## Tests
- `npx vitest run tests/unit`: 48 files, 435 passed
- `npx vitest run tests/db`: 46 files, 326 passed (outreach-pipeline: 15 tests, incl. race, rollback, mock refusal, FK set null, action guards)
- `npx tsc --noEmit` clean; eslint: 0 errors (2 pre-existing `window.location.assign` warnings in live-provider.tsx).
- No e2e added (server-only plan).

## Deviations from Plan
- Add-to-calendar all-day events use the date in the event's zone (end exclusive, at least one day); not specified in the plan.
- Dismiss/restore on an event already in the requested state returns ok (idempotent) rather than an error.
- Action return union includes `{ ok:false, error:"failed" }` as specified; `moveStageAction` returns `invalid` for a malformed stage and `not_found` for a malformed id.

No stubs.

## Owner actions
None for this plan. (Live Add to calendar against real Google/iCloud is covered later by phase UAT.)

## Self-Check: PASSED
