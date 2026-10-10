---
phase: 04-organization
plan: 19
subsystem: organization-ui
tags: [month-grid, event-dialog, scope-dialog, plan-card, tasks-card]
requires: [04-14, 04-16, 04-18]
provides: [MonthGrid, EventDialog, DeleteFlow, ScopeDialog]
key-files:
  created: [src/organization/month-grid.tsx, src/organization/event-dialog.tsx, src/organization/scope-dialog.tsx]
  modified: [src/organization/organization-view.tsx, src/organization/time-grid.tsx, src/organization/event-block.tsx]
requirements-completed: [ORG-01, ORG-02, ORG-03]
completed: 2026-10-10
---

# Phase 4 Plan 19: Month view, event dialogs, aside Summary

Organization page is feature-complete: Month grid (role=grid, roving tabindex, arrows/Home/End/PageUp/PageDown), create/edit/delete event dialog with repeat-scope step and etag-based "changed" handling, and the plan and tasks cards mounted in the aside.

## Commits
- 9673306 month grid
- 8a960a9 event dialog, scope dialog, delete flow
- (task 3) dialogs + aside wiring, SAVING visual

## Deviations from Plan
- [Rule 3] No client wrapper needed: `OrganizationView` is already a client component receiving plain data, so I removed the unused `month/aside/dialogs/onNewEvent/...` props and own the dialog state inside it.
- [Rule 3] `time-grid.tsx` and `event-block.tsx` got a small `saving` prop (outside files_modified) to render the SAVING visual (opacity .7).
- `EventDialog` takes an extra optional `onDelete(instance)` prop for the footer Delete button; `DeleteFlow` is exported from `event-dialog.tsx`.
- Reconnect and provider errors render as inline text in the dialog (with a Reconnect link) rather than a toast-with-link, because the shell toast takes only a message; provider failure uses a plain red alert, not `InlineError`.
- `firstInstance` for ScopeDialog is always `false` (the DTO does not expose the series' first occurrence), so "This and following events" is always offered.
- All-day End is shown inclusive and sent exclusive (+1 day).
- Events in a non-Sydney zone are shown in Sydney time with the zone noted; the event's `tz` is sent as timeZone.
- Not done: focusing a block newly created from a grid slot after refresh (focus returns to the opener via the dialog hook; after delete the Calendar region is focused).

## Notes for later
- Conflict rows link `?event=<ConflictDTO.a>`; `a` is the instance key, which the page's `?event=` lookup matches (key or eventId) - consistent.
- "No calendars are syncing" is still an inferred state (04-16) and may misfire for read-only-only setups; not changed.
- Cards rely on the view's existing `useLiveEvents("calendar"|"task")` -> `router.refresh()`; no extra subscriptions added.

## Verification
`npm run typecheck`, `npx eslint src/organization`, `npm run build` all pass. UI not exercised (owner tests on the VM, 04-21).

## Known Stubs
None.

## Self-Check: PASSED
