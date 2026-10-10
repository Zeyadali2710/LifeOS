---
phase: 04-organization
plan: 10
subsystem: tasks-reminders-live
tags: [tasks, reminders, sse, pg-boss]
requires: [04-06]
provides: [live signal kinds calendar/task, tasks service + owner actions, task-reminders worker job, QUEUES.calendarSync name]
affects: [04-11, 04-14, 04-15]
key-files:
  created: [src/lib/task-payload.ts, src/server/tasks.ts, src/server/task-actions.ts, src/worker/jobs/task-reminders.ts, tests/db/tasks.test.ts, tests/db/task-reminders.test.ts]
  modified: [src/server/events.ts, src/server/hub.ts, src/lib/live-types.ts, src/shell/live-provider.tsx, src/server/queue.ts, src/worker/index.ts, tests/db/hub.test.ts]
decisions:
  - "remindAt future check applies only when remindAt changed, so editing other fields of an already-reminded task is not blocked"
  - "Re-arm (remindedAt = null) whenever remindAt differs from the stored value"
metrics:
  tasks: 3
  completed: 2026-10-10
---

# Phase 4 Plan 10: Tasks, reminders and live signals Summary

Tasks CRUD (zod taskInput, Sydney dueAt derivation, audit with {id} only, SSE `task` signal), a once-per-arming reminder claim (`UPDATE ... RETURNING`) run every minute by the worker, and id-only `calendar`/`task` SSE frames with `useLiveEvents("calendar"|"task")`.

## Commits
- Task 1: `feat(04-10): live signal kinds calendar and task`
- Task 2: `feat(04-10): task payload, service and owner actions`
- Task 3: `feat(04-10): task reminder job and worker registration`

## Verification
- Passed locally: `npm run typecheck`, `npm run lint` (0 errors; 5 pre-existing warnings), `npm run build:worker`, `npx vitest run tests/unit/live.test.ts`.
- NOT verified (no local Postgres): DB tests. Run on the VM via `scripts/vm-db-test.sh`:
  `bash scripts/vm-db-test.sh tests/db/hub.test.ts tests/db/tasks.test.ts tests/db/task-reminders.test.ts`
  These were written but never executed, so expect possible first-run fixes (e.g. weekday formatting "Thu 8 Oct" from `sydneyParts`, audit row counts).

## Deviations from Plan
None of substance. `calendarSync` queue name added to QUEUES as the plan specified (not registered in worker; plan 04-14 owns that). `quickAddTaskAction` passes only title + today's Sydney date through `createTask`.

## Known Stubs
None.

## Self-Check: PASSED
