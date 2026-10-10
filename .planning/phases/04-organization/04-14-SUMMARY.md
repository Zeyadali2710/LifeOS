---
phase: 04-organization
plan: 14
subsystem: calendar
tags: [calendar, worker, server-actions, google, icloud]
requires: [04-11, 04-12, 04-13]
provides:
  - providerFor (real Google/iCloud)
  - calendar.sync worker job on a 5 minute schedule
  - createEvent/updateEvent/deleteEvent write service (owner and agent)
  - owner server actions (create/update/delete/reload/addPlanItem/syncNow)
affects: [04-15, 04-16, 04-18, 04-19]
key-files:
  created:
    - src/server/calendar/providers.ts
    - src/server/calendar/events.ts
    - src/server/calendar-actions.ts
    - src/worker/jobs/calendar-sync.ts
    - tests/db/calendar-sync-google.test.ts
    - tests/db/calendar-sync-caldav.test.ts
    - tests/db/calendar-actions.test.ts
  modified:
    - src/worker/index.ts
    - src/server/calendar/google/provider.ts
    - tests/unit/google-provider.test.ts
    - tests/helpers/fake-calendar.ts
metrics:
  tasks: 3
  completed: 2026-10-10
---

# Phase 4 Plan 14: Providers wired, event write service, owner actions

Real Google/iCloud providers now sync every 5 minutes (and 10 s after worker start); one write service (direct write + etag guard + audit) backs the owner server actions and approved agent writes.

## Commits
- 0fed5b1 Task 1: providerFor, calendar-sync job, schedule/send, provider-backed sync tests
- 5c7b57f Task 2: events.ts write service, Google adapter fixes, scriptable fake provider
- (this commit chain) Task 3: calendar-actions.ts and action tests

## Notes
- `providerFor` throws `ProviderError(auth)` when iCloud has no secret, so the sync marks the connection errored through the existing path.
- Results of actions: `{ok:true,eventId,calendarName,start,overlaps}` | `{ok:false,errors}` | `{ok:false,error:"changed|reconnect|provider|not_found|read_only",provider}`. `updateEventAction` takes the flat shape `{eventId, etag, scope, instanceStart, ...fields}` (calendarId optional, ignored).
- Agent creates: remote id `lifeos<approval hex>` (Google) / `<approvalId>@lifeos` (iCloud), repeat forced to none, approvalId in audit and as the provider marker.
- Audit metadata holds ids, scope, actor, approvalId only; no title/description.

## Deviations from Plan

**1. [Rule 2 - carry-over from 04-11] occurrencesBefore for COUNT series.** Computed inside the Google provider (`before()` using `expand()` on the stored master) rather than the write service, since the provider already has the stored event and `instanceStart`. `first` was already passed. Unit test added (COUNT=6, edit from 3rd occurrence -> COUNT=4).

**2. [Rule 1 - carry-over from 04-11] all-day <-> timed switch.** PATCH bodies now send `dateTime: null` / `date: null` for the other field (creates unchanged). Covered by a unit test against the fake only; Google's null-clears-field behaviour is documented API behaviour but not verified against live Google.

**3. [Rule 3] `tests/helpers/fake-calendar.ts` extended** to script and record create/update/remove (previously threw).

**4.** `updateEventAction` fills a dummy calendarId so forms need not send it (existing events never change calendar).

## Open items
- iCloud "following" edits on COUNT series use the existing icsApply logic (04-12); untouched.
- Overlap detection in the write service is evaluated on the written event's own window only.

## Verification status
- `npm run typecheck` clean; `npm run lint` 0 errors (5 pre-existing warnings); `npm run build:worker` OK; `tests/unit` pass (including the new google-provider case).
- DB tests were NOT run (no local Postgres; honest status: UNVERIFIED). Run on the VM:
  `bash scripts/vm-db-test.sh tests/db/calendar-sync-google.test.ts tests/db/calendar-sync-caldav.test.ts tests/db/calendar-actions.test.ts`

## Known Stubs
None.

## Threat Flags
None beyond the plan's threat model (T-04-38..41 mitigations implemented: requireOwner first in all six actions, uuid ids, writable-calendar check, etag compare before any provider call, content-free audit, fixed error codes).

## Self-Check: PASSED
