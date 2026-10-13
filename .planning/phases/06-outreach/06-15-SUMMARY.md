---
phase: 06-outreach
plan: 15
subsystem: outreach-ui
tags: [outreach, events, nextjs, glass]
requires: [06-06, 06-07, 06-09, 06-13]
provides: [outreach-read-queries, outreach-page, event-card, add-to-calendar-dialog]
affects: [06-16, 06-17]
key-files:
  created:
    - src/server/outreach/queries.ts
    - tests/db/outreach-queries.test.ts
    - src/app/(os)/outreach/loading.tsx
    - src/outreach/outreach-view.tsx
    - src/outreach/event-list.tsx
    - src/outreach/event-card.tsx
    - src/outreach/why-block.tsx
    - src/outreach/add-to-calendar-dialog.tsx
    - src/outreach/fmt.ts
    - src/outreach/use-stage.ts
  modified:
    - src/app/(os)/outreach/page.tsx
    - src/projects/progress-ring.tsx
decisions:
  - "mock URL param is tri-state: mock=1 shows mocks, mock=0 hides them, absent = hidden once a real source exists"
  - "Hide mock chip only renders when mockCount > 0"
metrics:
  tasks: 2
  completed: 2026-10-13
---

# Phase 6 Plan 15: Outreach page and EVENTS tab Summary

/outreach now shows real scored Sydney events with honest source states, URL-backed filters and one-step Save/Interested/Attend actions plus an Add to calendar dialog.

## Commits
- 27c65e4 feat(06-15): outreach read queries
- 8c838ca feat(06-15): Outreach page with EVENTS tab, event cards and Add to calendar

## What was built
- `queries.ts`: `toEventDTO`, `loadOutreachEvents`, `eventCount`, `loadEvent`, `pipelineEvents`, `sourceStatus`, `loadInterests` (explicit columns, never `urlCiphertext`). 6 db tests.
- Route (`force-dynamic`, `searchParams` Promise, requireOwner, load-failure fallback), `loading.tsx` with 6 skeleton cards.
- `OutreachView`: tablist (EVENTS only; plan 17 appends EMAIL/FOLLOW-UPS to `TABS`), interest chips (OR on INTERESTS signal terms), Hide mock, Sync now, meta line, aria-live count, `useLiveEvents("outreach")` refresh.
- `EventCard`/`EventBadges`/`EventMeta`, `WhyBlock`, `EventList` + `SourceStrip` (no-real-sources note, up to 3 failing sources, empty and filtered-empty states), `AddToCalendarDialog`.
- `useStage` hook: optimistic stage move with revert + toast (reused by plan 16).
- `fmt.ts`: Sydney-time formatting, score colour rule, follow-up due date.

## Deviations from Plan
- [Rule 2] `ProgressRing` also got an optional `text` prop (centre number without the `%`), needed for the UI-SPEC score ring; `color` as planned.
- [Rule 3] Added helper files `fmt.ts` and `use-stage.ts` (shared by plans 15 and 16) rather than duplicating logic.
- Per-source sync errors use a compact role="alert" row (UI-SPEC one-line copy plus Open Settings) instead of the 4-part `InlineError`, which cannot express that copy.
- `Import event` ghost button in the no-real-sources note is wired through an optional `onImport` prop; plan 16 supplies the dialog.

## Verification
- `npx tsc --noEmit`, eslint (src/outreach, outreach route, src/projects), glass gate: clean.
- `npx vitest run tests/unit`: 50 files, 452 tests passed.
- `npx vitest run tests/db`: 54 files, 424 tests passed (includes outreach-queries 6).
- Playwright shell-nav + projects: 10 passed, 2 skipped (viewport-specific by design).

## Owner actions
None. (Visual check of /outreach on the VM with real feeds recommended; needs a real iCal feed added in Settings.)

## Known Stubs
None. Pipeline view/Import event toolbar button arrive in plan 16 by design.

## Self-Check: PASSED
