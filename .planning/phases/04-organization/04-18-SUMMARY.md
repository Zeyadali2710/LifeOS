---
phase: 04-organization
plan: 18
subsystem: organization-ui
tags: [plan-card, tasks, dialog, ORG-03]
requires: [04-05, 04-09, 04-10, 04-14]
provides: [TodaysPlanCard, TasksCard, TaskDialog, plan-skips]
key-files:
  created: [src/organization/plan-skips.ts, src/organization/plan-card.tsx, src/organization/tasks-card.tsx, src/organization/task-dialog.tsx, tests/unit/plan-skips.test.ts]
requirements-completed: [ORG-03]
completed: 2026-10-10
---

# Phase 4 Plan 18: Plan card, tasks card, task dialog Summary

Self-contained client components for 04-19 to mount: `TodaysPlanCard` (add-to-calendar via `addPlanItemAction`, per-day localStorage skip with Undo, conflicts block), `TasksCard` (optimistic toggle, quick add, today/all-open/completed views) and `TaskDialog` (create/edit/delete, reminder presets).

## Commits
- 3fb9e2d plan-skips + test + TodaysPlanCard
- e2509e7 tasks card + task dialog

## Props for 04-19
- `TodaysPlanCard({ plan, conflicts, calendars, defaultCalendarId, today, freeHours? })` - `freeHours` is optional (the plan DTO has none); pass the week/day free-hours figure if available, otherwise the empty state omits the number.
- `TasksCard({ tasks, allOpen, completed, today })`, `TaskDialog({ open, task?, initialTitle?, onClose })`.
- `today` is the Sydney `yyyy-mm-dd`.

## Deviations / notes
- Worktree base was behind 1edda16 (04-14 not present); reset to it per the startup check.
- Conflict rows open `/organization?event=<ConflictDTO.a>`; this assumes `a` is the value `?event=` accepts (verify when mounting in 04-19).
- Plan-card "Open day" and conflict links use `router.push`; no live-event subscription was added in these components (04-19 can call `router.refresh()` from `useLiveEvents`).
- Custom/existing reminders are entered and shown in Sydney time.

## Verification
- `npx vitest run tests/unit/plan-skips.test.ts` 2/2 pass; `npm run typecheck` clean; eslint on `src/organization` clean (one scoped disable for reading localStorage after mount).
- UI not exercised in a browser (owner tests on the VM).

## Known Stubs
None.

## Self-Check: PASSED
