---
phase: 04-organization
plan: 07
subsystem: calendar
tags: [ical.js, recurrence, rrule, dst, caldav, google-calendar]
requires: [04-01, 04-03]
provides:
  - CalendarProvider seam and shared calendar types
  - expand(): stored masters + overrides -> display instances
  - icsCreate / icsApply / googlePlan recurring-edit transformations
affects: [04-06, 04-08, 04-12]
tech-stack:
  added: []
  patterns: [floating wall-clock iteration + per-zone instant conversion, ical.js setters only for ICS writes]
key-files:
  created:
    - src/server/calendar/types.ts
    - src/server/calendar/expand.ts
    - src/server/calendar/recurrence-edit.ts
    - tests/unit/expand.test.ts
    - tests/unit/recurrence-edit.test.ts
    - tests/fixtures/calendar/icloud-recurring.ics
    - tests/fixtures/calendar/icloud-floating.ics
    - tests/fixtures/calendar/icloud-allday.ics
    - tests/fixtures/calendar/icloud-windows-tz.ics
  modified: [.gitattributes]
key-decisions:
  - "EXDATE/RECURRENCE-ID matching is done on instants (or dates) by our own code, not ical.js relateException, so Google and ICS share one path"
  - "UNTIL is the instance minus 1s in UTC (21:59:59Z for a 09:00 Sydney AEDT instance)"
metrics:
  tasks: 2
  completed: 2026-10-10
---

# Phase 4 Plan 07: Recurrence core Summary

Provider seam plus a pure, fixture-tested recurrence core: one DST-correct expander for Google rows and iCloud ICS, and this/following/all edit transformations for both providers, with ICS written only through ical.js setters.

## Commits
- 8e04a73 feat(04-07): provider seam types and DST-correct recurrence expander
- 3d6ebd6 feat(04-07): pure recurring-edit transformations for ICS and Google

## Verification
`npx vitest run tests/unit` (28 files, 209 tests) passes; `tsc --noEmit` and eslint clean. No rrule-temporal/rrule imports.

## Deviations from Plan

**1. [Rule 1 - Bug] UNTIL literal in plan is arithmetically inconsistent**
- The plan says a split at 2026-10-22 09:00 Sydney gives `UNTIL=20261021T225959Z`. That instant is 2026-10-21T22:00:00Z (AEDT +11), so instance minus 1s is `20261021T215959Z`, which also matches the plan's own Google id `_20261021T220000Z`. Implemented the correct arithmetic; the test asserts `215959Z` for the 09:00 case and `20261021T225959Z` for a 10:00 Sydney instance (23:00Z) so both the rule and the literal are covered.

**2. [Rule 2 - Safety] Extra inputs/guards**
- `googlePlan` master accepts optional `occurrencesBefore` (COUNT conversion for the new series) and `first` (following at first occurrence behaves as all); callers (adapters) should supply them from `expand()`.
- Text values normalise bare `\r` before ical.js setters (CRLF-injection test).
- Added `.gitattributes` `-text` for the .ics fixtures so CRLF is preserved in git.

## Known ceilings (ponytail)
- 2000 occurrences per series, iterated from DTSTART (very old daily series fall off the window).
- Only Australia/Sydney VTIMEZONE is bundled; other zones are written as UTC.
- RDATE-only series are treated as single events when editing; ICS declined state is not parsed (false).

## Self-Check: PASSED
Files and commits 8e04a73, 3d6ebd6 verified present.
