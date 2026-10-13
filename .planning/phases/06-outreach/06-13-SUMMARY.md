---
phase: 06-outreach
plan: 13
subsystem: settings-ui
tags: [settings, gmail, eventbrite, luma, feeds, interests, icons]
requires: [06-05, 06-09]
provides: [outreach-connections, outreach-section, gmail-status-row]
affects: [src/settings, src/app/(os)/settings/page.tsx, src/ui/icon-names.ts]
key-files:
  created: [src/settings/outreach-connections.tsx, src/settings/outreach-section.tsx]
  modified: [src/settings/calendar-connection-row.tsx, src/settings/connections-section.tsx, src/settings/connection-row.tsx, src/settings/token-form.tsx, src/settings/settings-nav.tsx, "src/app/(os)/settings/page.tsx", src/ui/icon-names.ts, src/app/fonts/material-symbols-outlined.woff2, src/lib/outreach-types.ts, src/server/outreach/sources.ts, tests/unit/icons.test.ts, tests/e2e/settings.spec.ts]
requirements-completed: [OUT-01, OUT-03]
completed: 2026-10-13
---

# Phase 6 Plan 13: Settings UI Summary

Settings now covers Gmail reconnect and status, Eventbrite/Luma keys with Mock rows, Event feeds, and an Outreach interests chip editor.

## Commits
- d1eadd3 feat(06-13): settings UI (both tasks in one commit because page.tsx imports both new components)

## What was built
- Google row: Gmail line (Allowed / Not allowed / Needs reconnect), Reconnect Google (accent only when Gmail missing), unverified-app helper, disconnect confirm mentions Gmail removal; OAuth toast reads `gmail=1|0`.
- TokenForm/ConnectionRow widened to `eventbrite | luma` (saveEventKeyAction / removeEventKeyAction, Add/Replace/Remove key wording, MOCK status label via new `statusLabel` prop).
- outreach-connections.tsx: Eventbrite (with Organizer IDs), Luma, Meetup/Humanitix mock rows, Event feeds card (host only, optimistic enable toggle, remove confirm, add form, Luma Sydney how-to).
- outreach-section.tsx + nav `outreach` section + page wiring; interests save immediately with revert on failure.
- Icons bookmark/star/groups/reply added; woff2 subset regenerated successfully (download worked, 81 icons).

## Verification
- tsc, eslint, glass gate: clean
- `npx vitest run tests/unit`: 49 files, 445 tests passed
- `npx vitest run tests/db`: 52 files, 405 tests passed
- `npx playwright test tests/e2e/settings.spec.ts`: 6 passed

## Deviations
1. [Rule 3] `EventSourceDTO` gained `organizerIds: string[]` (src/lib/outreach-types.ts, sources.ts listEventSources) so the Organizer IDs input is prefilled and saving cannot silently wipe them.
2. [Rule 1] tests/unit/icons.test.ts count 77 -> 81 for the four new icons.
3. [Rule 1] settings.spec.ts first test scoped locators to `#main`: the page streams via Suspense and React's hidden `div#S:0` briefly duplicates the text, which tripped Playwright strict mode (timing race, not a product bug).
4. Both tasks committed together (page.tsx dependency), not two commits.
5. ConnectionRow got an optional `statusLabel` prop to render the neutral MOCK label.

## Owner actions
None. (Real Eventbrite/Luma keys and a Google reconnect are needed to see live data; mocks work meanwhile.)

## Self-Check: PASSED
