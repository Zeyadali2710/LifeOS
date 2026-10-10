---
phase: 04-organization
plan: 12
subsystem: calendar
tags: [icloud, caldav, tsdav, ical.js]
requires: [04-03, 04-07, 04-08]
provides: [createCaldavProvider, connectIcloud, icloudProviderFor, realDav, ICLOUD_SERVER]
key-files:
  created:
    - src/server/calendar/caldav/provider.ts
    - tests/helpers/fake-dav.ts
    - tests/unit/caldav-provider.test.ts
    - tests/db/icloud-connect.test.ts
metrics:
  completed: 2026-10-10
---

# Phase 4 Plan 12: iCloud CalDAV provider Summary

iCloud CalDAV provider over a narrow `DavClient` interface (tsdav only inside `realDav`), content edits via recurrence-edit, plus validated/encrypted `connectIcloud`.

## Commits
- c681ab2 provider, fake DAV, unit tests
- 36c3e15 DB test for connectIcloud

## Behaviour
- ctag short-circuit, time-range fetch, `reset: true` complete-set sync; 256 KB cap and per-resource try/catch (skipped count only logged); 5000-object cap.
- Every calendar/object URL must be https and end with `.icloud.com` (`assertIcloudUrl`).
- Writes: tsdav sets If-Match (update/delete) and If-None-Match: * (create). 412 -> ProviderError conflict with the plan's fixed message; 412 on create adopts the existing resource; delete 404 = done. "following" creates the split-off resource.
- Errors use fixed messages only; password lives only in `realDav`'s closure.

## Deviations
- Read-only detection: tsdav does not expose `current-user-privilege-set`, so `access: "reader"` is only set if it appears in `projectedProps`; otherwise "owner". Shared read-only calendars may show as owner until verified live (plan 04-21).
- After each write the provider re-fetches the object to get the fresh etag (PUT responses may omit it).

## Verification
- `npx vitest run tests/unit/caldav-provider.test.ts`: 8/8 pass. `npm run typecheck`: clean. `npm run lint`: 0 errors (5 pre-existing warnings).
- UNVERIFIED (no local Postgres): `tests/db/icloud-connect.test.ts` — run on the VM: `bash scripts/vm-db-test.sh tests/db/icloud-connect.test.ts`.
- Live iCloud untested (plan 04-21).

## Self-Check: PASSED
