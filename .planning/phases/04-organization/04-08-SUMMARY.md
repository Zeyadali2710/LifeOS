---
phase: 04-organization
plan: 08
subsystem: calendar
tags: [calendar, crypto, connections]
requires: [04-06, 04-07]
provides: [calendar connection store, calendar list store]
key-files:
  created:
    - src/server/calendar/connections.ts
    - src/server/calendar/calendars.ts
    - tests/db/calendar-store.test.ts
requirements-completed: [ORG-01]
completed: 2026-10-10
---

# Phase 4 Plan 08: Calendar connection and list stores Summary

Encrypted (AES-256-GCM JSON) calendar secret store with in-place rotation, plus an opt-in calendar list store (category, default, last-used).

## Done
- connections.ts: saveCalendarSecret (upsert, last4 "", audit {id, account}), readCalendarSecret, updateCalendarSecret, markCalendarError, recordCalendarSync, removeCalendarConnection (cascade), getCalendarConnections. The DTO path selects explicit columns, so ciphertext is never read there (reviewed manually).
- calendars.ts: refreshCalendarList, setCalendarEnabled, setCalendarCategory, setDefaultCalendar, setLastUsedCalendar ("calendar.last_used"), calendarRef, calendarById.
- Commit: see git log (feat(04-08)).

## Deviations
- [Rule 2] setCalendarEnabled(false) also clears isDefault, so a disabled calendar is never the default. Not in the plan; it follows from "default only for enabled writable calendars".
- refreshCalendarList defaults a new primary/owned calendar to enabled with category "personal", as the plan specifies.

## Verification
- `npm run typecheck`: pass. `npm run lint`: 0 errors (5 existing warnings in unrelated files).
- DB tests UNVERIFIED here (no local Postgres). Run on the VM: `bash scripts/vm-db-test.sh tests/db/calendar-store.test.ts`. The file includes "rotation overwrites the stored secret".

## Self-Check: PASSED
Files exist, commit made.
