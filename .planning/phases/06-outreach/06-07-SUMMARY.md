---
phase: 06-outreach
plan: 07
subsystem: outreach-sync
tags: [providers, sync, dedup, worker]
requires: [06-02, 06-03, 06-04, 06-06]
provides: [EventSourceProvider seam, providerForSource, mockEvents, eventSourceKey, markEventKeyError, createOutreachSync, upsertEvents, rescoreAll, handleOutreachSync, outreach.events.sync schedule]
key-files:
  created: [src/server/outreach/providers.ts, src/server/outreach/mock-events.ts, src/server/outreach/connections.ts, src/server/outreach/sync.ts, src/worker/jobs/outreach-sync.ts, tests/db/outreach-sync.test.ts]
  modified: [src/server/calendar/queries.ts, src/worker/index.ts]
decisions:
  - Providers report Eventbrite's organizer-listing refusal through an optional `discoverDenied` flag set during list(); the sync persists config.discover and the D-06 message (only when organizer ids are configured).
  - A source's successful real run flips its connection back from error to connected.
metrics:
  completed: 2026-10-13
---

# Phase 6 Plan 07: Event providers and sync Summary

OUT-01 server path: ics (via safeGet), Eventbrite and Luma (real with a key, MOCK without) and Meetup/Humanitix (always MOCK) sit behind one provider seam; the sync upserts Sydney-filtered 60-day events under an advisory lock with D-11 merge, rescored every run, pruned, with one activity per run and a 6-hourly singleton worker job.

## Commits
- 5eb6602 feat(06-07): event source providers, mock events, key read side
- 7894997 feat(06-07): outreach sync service, worker schedule and DB tests

## Tests
- `npx vitest run tests/unit`: 48 files, 435 passed
- `npx vitest run tests/db`: 47 files, 339 passed (outreach-sync: 13 tests)
- `npx tsc --noEmit` clean; eslint 0 errors/warnings on touched files.

## Deviations from Plan
- Luma list endpoint: WebFetch was not available in this run, so docs.luma.com could not be checked. The path `/v1/calendar/list-events` and response shape (`entries[].event`) are from memory and tagged `[ASSUMED A2]` in one constant in providers.ts; a wrong path ends as a "Couldn't reach Luma." source error (the key row stays real; remove the key to return to MOCK).
- Mock events count towards the "scored 70+" activity like any new event (literal plan reading).
- Test for a Melbourne event uses an inline VEVENT (no Melbourne fixture exists).

No stubs.

## Owner actions
- Verify the Luma list-events path against https://docs.luma.com/reference before relying on a Luma key (constant `LUMA_LIST` in src/server/outreach/providers.ts).
- Eventbrite organizer probe (A1) is only observable live: after entering a key and organizer ids, check the source row for the "doesn't allow listing" message.
- Worker needs a restart after deploy to register `outreach.events.sync` (plan 19 deploy covers this).

## Self-Check: PASSED
