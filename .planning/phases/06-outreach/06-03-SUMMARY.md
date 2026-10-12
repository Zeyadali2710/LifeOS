---
phase: 06-outreach
plan: 03
subsystem: outreach-parsers
tags: [ical, json-ld]
requires: [06-01, 06-02]
provides: [parseFeed/FeedError, extractEvent, normalizeVevent]
key-files:
  created: [src/server/outreach/ics.ts, src/server/outreach/jsonld.ts, tests/unit/outreach-ics.test.ts, tests/unit/outreach-jsonld.test.ts, tests/fixtures/outreach/*]
  modified: [src/server/calendar/caldav/provider.ts]
metrics:
  completed: 2026-10-13
---

# Phase 6 Plan 03: Feed + JSON-LD parsers Summary

iCal feeds parse into 60-day-windowed, 500-capped RawEvents via the existing expand/icsSeries code; schema.org Event JSON-LD (@graph, array/subtype @type, offers arrays, virtual locations) parses leniently with zod; no new dependencies.

## Commits
- feat(06-03): iCal feed parser reusing calendar expansion
- feat(06-03): schema.org Event JSON-LD extraction

## Tests
- tests/unit: 45 files, 412 tests passed (outreach-ics 8, outreach-jsonld 7; caldav + expand unchanged and green)
- tests/db: 45 files, 310 tests passed
- tsc clean; eslint clean on touched files

## Deviations
- normalizeVevent returns raw: null; normalizeIcs overrides raw with { ics } so caldav behaviour is identical.
- parseFeed builds each row's raw.ics as VCALENDAR + the feed's VTIMEZONEs + the single VEVENT so custom TZIDs still resolve in expand.

## Owner actions
None.

## Self-Check: PASSED
