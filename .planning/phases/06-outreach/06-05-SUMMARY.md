---
phase: 06-outreach
plan: 05
subsystem: google-oauth-gmail
tags: [oauth, gmail, scopes]
requires: [06-01]
provides: [CALENDAR_SCOPES, GOOGLE_SCOPES, GMAIL_BASE, createGmail, gmailAllowed, hasGmail, ProviderErrorKind scope, CalendarConnectionDTO.gmail]
affects: [calendar connect flow, settings connections UI (reads dto.gmail)]
key-files:
  created: [src/server/mail/client.ts, tests/unit/gmail-client.test.ts]
  modified: [src/server/calendar/google/client.ts, src/server/calendar/google/oauth.ts, src/server/calendar/connections.ts, src/server/calendar/errors.ts, src/lib/calendar-types.ts, src/app/api/connections/google/callback/route.ts, tests/helpers/fake-google.ts, tests/db/google-oauth.test.ts, tests/unit/google-client.test.ts]
decisions:
  - Only calendar scopes are required at callback; Gmail scopes are requested and recorded when granted.
  - createGoogle takes a base limited to the two constants; a Gmail-base 403 insufficientPermissions is kind "scope" so Calendar is never paused.
metrics:
  completed: 2026-10-13
---

# Phase 6 Plan 05: Google scope split and Gmail client Summary

One Google grant now covers Calendar plus gmail.readonly/gmail.compose: calendar-only grants still connect, granted scopes are stored per reconnect, and a typed Gmail client reuses createGoogle with Gmail-specific scope errors.

## Commits
- 5841def feat(06-05): split Google scopes, store granted scopes, expose Gmail status
- b9b5432 feat(06-05): Gmail client on the createGoogle base

## Tests
- `npx vitest run tests/unit`: 48 files, 435 passed
- `npx vitest run tests/db`: 45 files, 311 passed (incl. google-oauth, calendar-settings-actions)
- Playwright `settings.spec.ts` + `organization.spec.ts`: 16 passed, 2 skipped (pre-existing skips)
- `npx tsc --noEmit` and eslint clean; no `gmail.modify`/`gmail.send` in src/server.

## Deviations from Plan
- `hasGmail` lives in connections.ts, which imports scope constants from google/client.ts (a lazily-used import cycle, harmless at runtime).
- Updated the existing google-client unit test that asserted the old two-scope string.
- Added a `scope` message ("Gmail access wasn't granted.") to the Google error message map.

No other deviations. No stubs.

## Owner actions
- Live check: reconnect Google from Settings and confirm the consent screen lists Gmail; untick Gmail once to confirm Calendar still connects (`gmail=0` in the redirect). Requires the Gmail API enabled in the Google Cloud project and gmail.readonly/gmail.compose added to the OAuth consent screen scopes (Google consent change, owner only).
- The existing connection must be reconnected once to store its granted scopes (scopes defaults to []).

## Self-Check: PASSED
