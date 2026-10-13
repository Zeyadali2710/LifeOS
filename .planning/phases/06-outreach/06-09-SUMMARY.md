---
phase: 06-outreach
plan: 09
subsystem: outreach-sources
tags: [ical, eventbrite, luma, import, interests, server-actions]
requires: [06-06, 06-07]
provides: [addFeed, removeFeed, setFeedEnabled, importEventUrl, saveInterests, listEventSources, saveEventbriteOrganizers, saveEventKey, removeEventKey, eventKeyStatus, rescoreAfterProjectChange, outreach-actions]
key-files:
  created: [src/server/outreach/sources.ts, src/server/outreach-actions.ts, tests/db/outreach-actions.test.ts]
  modified: [src/server/outreach/connections.ts, src/server/outreach/sync.ts, src/server/project-actions.ts, src/server/agents/tools/projects.ts, tests/db/project-agent-writes.test.ts]
decisions:
  - Audit rows for outreach use an `aud(h, ...)` helper on the passed handle (same as pipeline.ts) so tests see them; metadata is ids, last4, host and counts only.
  - Project-change rescore is a small `rescored()` wrapper in project-actions.ts (fires only when the result is ok) instead of three inline calls.
  - Agent applyDraft is split into applyDraft (wrapper, fire-and-forget rescore after the transaction commits) and applyDraftTx.
metrics:
  completed: 2026-10-13
---

# Phase 6 Plan 09: Event source management Summary

Owner-facing server side for event sources: encrypted iCal feeds, Eventbrite/Luma key validation against constant URLs, organizer ids, JSON-LD URL import straight to SAVED, validated interests, nine owner-guarded actions with singleton Sync now, and fire-and-forget rescoring on owner and approved-agent project writes.

## Commits
- ddafd67 feat(06-09): feed, key, import and interests services
- 5045248 feat(06-09): owner server actions for outreach sources
- 6fd7aea feat(06-09): rescore events on project changes, with tests

## Tests
- `npx vitest run tests/unit`: 48 files, 435 passed
- `npx vitest run tests/db`: 49 files, 368 passed (outreach-actions: 16 tests; project-agent-writes gained the agent-rescore case)
- `npx tsc --noEmit` clean; eslint: 0 errors (only pre-existing unused-var warnings).

## Deviations from Plan
- **Acceptance count:** plan expects `grep -c "rescoreAfterProjectChange(" src/server/project-actions.ts` = 3; the three actions share one `rescored()` helper so the count is 1 (behavior identical, no `await`). Chosen to avoid triplication.
- **Orchestrator addition applied:** `applyDraft` in src/server/agents/tools/projects.ts also calls `rescoreAfterProjectChange` fire-and-forget after the transaction commits; covered by a DB test in project-agent-writes.test.ts.
- `outreach-actions.test.ts` has 16 `it(` cases (>= 12 required); the "actions" tests mock requireOwner/enqueue as planned.

## Owner actions
None for this plan (live Eventbrite/Luma keys and feeds are entered in Settings once plan UI lands; Luma endpoint paths remain unverified against the official reference, see 06-07).

No stubs.
