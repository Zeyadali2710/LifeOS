---
phase: 04-organization
plan: 11
subsystem: calendar
tags: [google-calendar, oauth, pkce, sync]
requires: [04-03, 04-07, 04-08, 04-10]
provides: [google-calendar-provider, google-oauth-routes]
affects: [04-15, 04-21]
key-files:
  created:
    - src/server/calendar/google/client.ts
    - src/server/calendar/google/provider.ts
    - src/server/calendar/google/oauth.ts
    - src/app/api/connections/google/start/route.ts
    - src/app/api/connections/google/callback/route.ts
    - tests/helpers/fake-google.ts
    - tests/fixtures/calendar/google-events.json
    - tests/fixtures/calendar/google-calendar-list.json
    - tests/unit/google-client.test.ts
    - tests/unit/google-provider.test.ts
    - tests/db/google-oauth.test.ts
  modified:
    - src/server/calendar/recurrence-edit.ts
decisions:
  - "Redirect flow only (owner confirmed redirect: accepted); no manual-paste fallback built."
metrics:
  tasks: 3
  completed: 2026-10-10
---

# Phase 4 Plan 11: Google Calendar provider and OAuth routes Summary

Fetch-based Google Calendar client, provider (list, syncToken sync with 410 full resync, writes with sendUpdates=none and If-Match, deterministic-id idempotent create), and owner-only PKCE connect routes with an encrypted single-use state cookie.

## Commits
- cea9cb8 client + fake-google helper + unit tests
- db5648f provider + fixtures + unit tests (also exports `ruleFor` from recurrence-edit.ts)
- Task 3 commit: oauth service, start/callback routes, DB test

## Verification
- `npx vitest run tests/unit` passes (google-client 7 tests, google-provider 6 tests); `npm run typecheck` clean; lint has no new warnings.
- UNVERIFIED (no local Postgres): `tests/db/google-oauth.test.ts`. Run on the VM: `bash scripts/vm-db-test.sh tests/db/google-oauth.test.ts`.
- Live Google connect is for the owner in plan 04-21.

## Notes for downstream
- Start link must be a plain GET link to `/api/connections/google/start` (CSP form-action 'self'). Callback redirects to `/settings?section=connections&google=connected&n={count}` or `&google={cancelled|state|scope|failed|not_configured}`.
- All redirects use BETTER_AUTH_URL; `request.nextUrl` is used only for query params.
- Tokens stored via saveCalendarSecret as `{ refreshToken, accessToken, expiresAt }`; `googleTokenSource(h)` refreshes and persists. The sync worker needs `createGoogleProvider({ google: createGoogle({ getToken: googleTokenSource(h) }) })`; wiring this into the worker/provider registry was not part of this plan.

## Deviations
- [Rule 3] Exported `ruleFor` from `recurrence-edit.ts` (one-word change) to reuse the repeat-to-RRULE mapping rather than duplicate it.

## Known limitations (ponytail)
- "following" Google edits do not pass `occurrencesBefore`, so a COUNT series continues without its COUNT (documented in googlePlan).
- Switching an event between all-day and timed on PATCH does not null the old `date`/`dateTime` field.
- Timed events with no `start.timeZone` fall back to Australia/Sydney.

## Self-Check: PASSED
