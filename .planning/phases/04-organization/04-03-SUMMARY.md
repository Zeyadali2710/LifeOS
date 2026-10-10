---
phase: 04-organization
plan: 03
subsystem: calendar
tags: [dependencies, env, google-oauth, owner-setup]
requires: []
provides: [tsdav, ical.js, optional GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET env]
key-files:
  modified:
    - package.json
    - package-lock.json
    - src/server/env.ts
    - .env.example
    - tests/unit/env.test.ts
requirements-completed: [ORG-01]
completed: 2026-10-10
---

# Phase 4 Plan 03: Calendar deps and Google OAuth setup Summary

tsdav 2.4.0 and ical.js 2.2.1 installed after owner-approved legitimacy check; GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET added as optional env (app boots without them); owner configured the Google OAuth client and the credentials are live in the `web` and `worker` containers.

## Tasks
1. Package legitimacy check (verification-only, no commit). tsdav 2.4.0 (natelindev/tsdav; deps debug + xml-js; no postinstall) and ical.js 2.2.1 (kewisch/ical.js; no deps; no postinstall). Owner replied "approved".
2. Install deps and optional Google env: commit e3e98bb (env tests 6/6, typecheck clean).
3. Owner configured Google OAuth client and consent screen (owner action, no commit). Owner replied "approved".

## Owner setup outcome
- redirect: accepted
- publishing: In production
- GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set in the VM `.env` and present in both the `web` and `worker` containers (owner verified with `lc exec <svc> printenv`). Values are not recorded here.

## Owner-setup note for docs (plan 04-22)
The Google Auth Platform Branding page required an app home page URL and privacy policy URL on the authorised domain `<tailnet>.ts.net` before Google allowed publishing to In production. Document this in the setup guide.

## Deviations from Plan
None - plan executed as written.

## Known Stubs
None.

## Self-Check: PASSED
