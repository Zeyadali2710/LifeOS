---
phase: 02-shell
plan: 02
subsystem: ui-helpers
tags: [time, dst, weather, open-meteo, snooze, grouping]
requires: []
provides: [sydney-time-helpers, isSafePath, getSydneyWeather, dateLine, lead]
affects: [home, notifications-drawer, login]
tech-stack:
  added: []
  patterns: [Intl formatToParts with hourCycle h23, offset recheck for DST, fetch next.revalidate]
key-files:
  created: [src/server/time.ts, src/lib/safe-url.ts, src/server/weather.ts, src/server/home.ts, tests/unit/time.test.ts, tests/unit/safe-url.test.ts, tests/unit/weather.test.ts, tests/unit/home.test.ts]
  modified: []
key-decisions:
  - "Unread-important lead with unknown health omits the systems suffix"
requirements-completed: [SHL-03, SHL-05]
duration: 15min
completed: 2026-10-08
---

# Phase 2 Plan 02: Pure helpers Summary

Sydney time math (no date lib, DST-pinned by fixed-instant tests), snooze presets, notification grouping, Open-Meteo weather (30 min revalidate, 2.5s timeout, silent null), Home date line and lead sentence, and the same-origin path validator.

## Tasks
1. Sydney time helpers + isSafePath: 7879fde
2. Weather + dateLine + lead: 159d68f

## Verification
`npx vitest run tests/unit` 32/32 pass; `npm run typecheck` clean; `eslint src tests` clean.

## Deviations
- [Rule 3] `fmt` return typed `Record<Intl.DateTimeFormatPartTypes, string>` and tests use `!` to satisfy noUncheckedIndexedAccess.
- Lead behavior for unread > 0 with null health (unspecified): suffix omitted.

## Known Stubs
None.

## Self-Check: PASSED
