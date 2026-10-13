---
phase: 06-outreach
plan: 16
subsystem: outreach-ui
tags: [outreach, pipeline, palette, glass]
requires: [06-15]
provides: [pipeline-board, follow-up-dialog, import-url-dialog, event-detail-route, palette-outreach-scope]
affects: [06-17]
key-files:
  created:
    - src/outreach/pipeline-board.tsx
    - src/outreach/follow-up-dialog.tsx
    - src/outreach/import-url-dialog.tsx
    - src/outreach/event-detail.tsx
    - src/app/(os)/outreach/events/[id]/page.tsx
    - tests/e2e/outreach.spec.ts
  modified:
    - src/outreach/outreach-view.tsx
    - src/app/(os)/outreach/page.tsx
    - src/shell/palette-items.ts
    - src/shell/palette.tsx
    - src/server/palette-actions.ts
    - tests/unit/palette.test.ts
decisions:
  - "Palette scope is named 'outreach' (group 'Outreach events'); the existing 'events' scope stays calendar events. Tab cycle: all, events, outreach, tasks, projects"
  - "Follow up is only reachable from ATTENDED (server rule); the dialog, not the click, moves the event to FOLLOW UP"
metrics:
  tasks: 3
  completed: 2026-10-13
---

# Phase 6 Plan 16: Pipeline, event detail, import and palette Summary

The full OUT-02 pipeline is usable from the UI: a static 5-column board, follow-up and URL-import dialogs, a shareable event detail route with explainable signals, and palette search plus an Import command.

## Commits
- adb23ff feat(06-16): pipeline board, follow-up and import dialogs, toolbar wiring
- 95a1c87 feat(06-16): event detail route with signals, stage stepper and actions
- feat(06-16): palette Outreach events scope and Import event URL command
- test(06-16): outreach e2e smoke (tab, import dialog, not-found, pipeline)

## What was built
- `PipelineBoard`: labelled sections with `<ol>` cards, optimistic Back / next-step moves with revert + toast, Follow up opens the dialog (disabled on mocks), per-column and global empty states.
- `FollowUpDialog`: prefilled `Follow up: {title}` due end+2 days (Sydney), up to 10 lines, per-line server error mapping, P2 tag.
- `ImportUrlDialog`: UI-SPEC error copy per code, `Event saved` / `Already in your events`, navigates to the event; `?import=1` opens it once and is dropped.
- `/outreach/events/[id]`: uuid guard, inline `Event not found` state, chips, WHY with `n/100`, SIGNALS bars (INTERESTS/PROJECTS/SCHEDULE), plain-text description with collapse, facts card, PIPELINE stepper with `aria-current="step"`, next/back/unsave/dismiss/restore, Add to calendar, safe external link, mock note.
- Palette: `Import event URL` command; `Outreach events` scope with parameterised `ilike` (escapeLike), limit 8, saved events first then score.

## Deviations from Plan
- [Rule 2] Added `tests/e2e/outreach.spec.ts` (4 smoke tests x 2 projects) since the plan's e2e only covered shell-nav and palette.
- [Rule 1] Existing palette unit test updated for the new command (list and hint index).
- escapeLike duplicated locally in palette-actions (the one in tools/projects.ts is not exported).
- "All events" back link uses `router.back()` when the referrer is the list, to preserve the previous query.

## Verification
- tsc, eslint (touched files), glass gate: clean.
- `npx vitest run tests/unit`: 50 files, 453 tests passed.
- `npx vitest run tests/db`: 54 files, 424 tests passed.
- Playwright: palette + shell-nav 6 passed / 4 skipped (viewport-specific); outreach.spec 8 passed.

## Owner actions
- Visual pass on the VM with real events: pipeline board horizontal scroll, event detail layout at 760-1099px, follow-up dialog flow (needs an event at ATTENDED), and URL import against a real Eventbrite/Luma page (network fetch not exercised in e2e).

## Known Stubs
None. EMAIL and FOLLOW-UPS tabs arrive in plan 17.

## Self-Check: PASSED
