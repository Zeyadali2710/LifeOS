---
phase: 04-organization
plan: 09
subsystem: calendar/read-model
tags: [queries, dto, agent-read]
requirements-completed: [ORG-01, ORG-03]
key-files:
  created:
    - src/server/calendar/queries.ts
    - tests/db/calendar-queries.test.ts
completed: 2026-10-10
---

# Phase 4 Plan 09: Organization read model Summary

queries.ts exports viewRange, loadInstances, storedEvent, listEvents, freeSlotsOn, conflictsIn, writableCalendars, pickDefaultCalendar, loadTasks and organizationData. One implementation serves the page and the agent READ tools. All numbers come from the 04-04 pure modules on each load, and there is no `Date.now()`.

## Verification
- `npm run typecheck` is clean and eslint is clean on both files.
- DB tests are UNVERIFIED: there is no Postgres in this worktree. Run on the VM: `bash scripts/vm-db-test.sh tests/db/calendar-queries.test.ts`.

## Notes
- Tasks 1 and 2 were committed together because both live in the same file.
- `pickDefaultCalendar` reads the `calendar.last_used` setting as a bare string id, which matches 04-08's `setLastUsedCalendar(h, id)`.
- `freeSlotsOn` returns raw `FreeSlot[]` (epoch ms). Agent tools should format them.
- The header and plan use three bounded loads (displayed range, week, today and tomorrow). If the page feels slow, merge them.
- Worktree base corrected with `git reset --hard 29aeb9d`.

## Deviations
None.

## Known Stubs
None.

## Self-Check: PASSED
