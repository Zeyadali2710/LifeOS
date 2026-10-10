---
phase: 04-organization
plan: 15
subsystem: settings-ui
tags: [calendar, settings, icloud, google]
requires: [04-05, 04-11, 04-12, 04-14]
provides: [calendar-settings-actions, calendar-connection-rows, calendar-list]
requirements: [ORG-01]
key-files:
  created:
    - src/server/calendar-settings-actions.ts
    - tests/db/calendar-settings-actions.test.ts
    - src/settings/calendar-connection-row.tsx
    - src/settings/icloud-form.tsx
    - src/settings/calendar-list.tsx
  modified:
    - src/settings/connection-row.tsx
    - src/settings/connections-section.tsx
    - src/app/(os)/settings/page.tsx
metrics:
  tasks: 3
  completed: 2026-10-10
---

# Phase 4 Plan 15: Settings calendar connections Summary

Settings -> Connections now has Google Calendar and iCloud Calendar rows (connect, reconnect, sync now, disconnect) and a per-calendar list with Sync, Category and Default-for-new-events controls, backed by owner-guarded server actions.

## Commits
- 55923f7 settings actions + DB test
- b2fd154 connection rows, iCloud form, section/page wiring
- 25d958f calendar list

## Notes
- Google connect is a plain `<a href="/api/connections/google/start">` (no form). OAuth return params are validated in the page, handled once in `ConnectionsSection` (toast / inline note), then `router.replace` clears them.
- `ConnectionRow` gained `"syncing"` status (pulsing indigo dot) and an `action` slot that replaces the built-in button.
- iCloud password state is cleared on submit; never logged or returned.
- No manual-paste Google fallback (04-11 built redirect flow only).

## Deviations
- Google cancelled/scope notices are a plain red `role="alert"` line in the row rather than the large `InlineError` card (that component requires what/why/fix blocks; too heavy for a row note).
- Category swatch and mobile (h44 select) layout are approximated with existing Tailwind utilities; visual check is plan 04-21.
- Disconnect / Sync-now Dialog and list live in the same `CalendarConnectionRow` file (one component).

## Verification
- `npm run typecheck` clean; `npm run lint` 0 errors (6 pre-existing warnings).
- UNVERIFIED (no local Postgres): `tests/db/calendar-settings-actions.test.ts`. Run on the VM: `bash scripts/vm-db-test.sh tests/db/calendar-settings-actions.test.ts`.
- Worktree base was reset to ac824ca at start (as instructed).

## Self-Check: PASSED
