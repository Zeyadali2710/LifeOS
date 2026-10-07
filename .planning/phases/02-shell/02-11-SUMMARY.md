---
phase: 02-shell
plan: 11
subsystem: shell
tags: [home, activity, sse, e2e]
requires: [02-02, 02-04, 02-05, 02-08]
provides: [Home page, ActivityList, SystemTile]
key-files:
  created: [src/shell/activity-list.tsx, src/shell/system-tile.tsx, tests/e2e/home.spec.ts, tests/e2e/live-activity.spec.ts]
  modified: ["src/app/(os)/page.tsx", tests/e2e/auth.spec.ts]
decisions:
  - Agents/Approvals tiles are literal 0 until Phase 3
requirements: [SHL-03, SHL-04]
metrics:
  completed: 2026-10-08
---

# Phase 2 Plan 11: Home and live activity Summary

Real Home (date line + weather, greeting, derived lead, status tiles, five honest EmptyState sections) and an SSE-fed role=log activity list with pause/resume, fresh-item animation and reconnect state.

## Commits
- f4d5ddf feat: Home page, ActivityList, SystemTile
- test commit: home + live-activity e2e, auth spec update

## Verification
- typecheck clean; `eslint src tests` 0 errors (2 accepted warnings); vitest unit 51 passed.
- `npx playwright test home live-activity auth`: 19 passed, 1 skipped (live-activity is desktop-only). Ran on prod build with lifeos_e2e DB. Proves a failed sign-in from a second browser appears in the log with no reload, SSE opens < 2s, /api/events 401 unauthenticated, no "@"/IP in log.

## Deviations
- [Rule 1] auth.spec: Sign out no longer lives on Home (it is on /settings), so the test navigates to /settings before signing out. Bell lookup scoped to the banner (sidebar also has a Notifications button).
- Pause freezes a snapshot of the list; fresh tint ends at the provider's 4.5s with a 1s fade rather than a separate 4s transition.

## Known Stubs
Agents/Approvals "0" tiles and the Priorities/Today/Projects/Agent/Upcoming empty sections are intentional (D-01/D-07); later phases wire them.

## Self-Check: PASSED
