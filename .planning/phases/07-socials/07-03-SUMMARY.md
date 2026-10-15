---
phase: 07-socials
plan: 03
subsystem: socials
tags: [publish-worker, analytics, tiktok-oauth, token-refresh]
requires: [07-01, 07-02]
provides: [bound publish execution, overdue sweep, social analytics sync, TikTok web OAuth]
affects: [07-04, 07-05, 07-06, 07-07]
tech-stack:
  added: []
  patterns: [approval-ID queue payload, conditional publish claim, token refresh compare-and-swap]
key-files:
  created: [src/server/socials/publish.ts, src/server/socials/sync.ts, src/app/api/connections/tiktok/start/route.ts, src/app/api/connections/tiktok/callback/route.ts, tests/unit/social-publish-executor.test.ts]
  modified: [src/server/socials/connections.ts, src/server/socials/providers.ts, src/server/agents/tools/socials.ts, src/server/queue.ts, src/server/socials-actions.ts, src/worker/index.ts, tests/unit/socials-providers.test.ts]
key-decisions:
  - Scheduled jobs carry the approval ID so an old job cannot target a newly approved variant.
  - Instagram media adoption requires a unique caption match; inconclusive results require owner review.
  - TikTok granted scopes come from the token response, and rotated tokens are stored atomically without changing credential generation.
requirements-completed: [SOC-01, SOC-02, SOC-03]
duration: 13 min
completed: 2026-10-15
---

# Phase 7 Plan 03: Bound publishing, sync and TikTok OAuth

Approved LinkedIn and Instagram variants now pass a persisted payload and credential check before the worker calls a provider. The worker claims a variant once, records Instagram containers and remote IDs before finalizing, and pauses ambiguous real results for owner review. A one-minute publish sweep recovers overdue jobs; the six-hour sync updates available real metrics and refreshes eligible tokens. TikTok web OAuth validates state and stores only actually granted scopes with an encrypted token pair.

## Task commits

- `08d5e28` Task 1 RED: failing publish guard tests.
- `ff9c136` Task 1 GREEN: bound publish execution, idempotent retry handling and startup sweep.
- `2fd45ff` Task 2 RED: failing TikTok OAuth and token rotation tests.
- `6404d09` Task 2 GREEN: TikTok OAuth, analytics sync, refresh and worker scheduling.
- `1748da0` safety follow-up: scan all returned Instagram media pages before adopting a caption match.
- `5fd2b36` continuation follow-up: retry stored Instagram containers after the stale claim and recover enqueue failures with a one-minute publish sweep.

## Verification

- Focused publish, approval and provider tests: 26 passed across three files.
- Full unit suite: 493 passed across 55 files.
- `npx tsc --noEmit`: passed.
- Focused ESLint over changed source and tests: passed without warnings.
- `npm run lint`: passed with 19 pre-existing warnings outside this plan.
- `npm run build:worker`: passed.
- `npm run build`: passed after Windows sandbox path escalation. The sandboxed attempt stopped before compilation on Turbopack path canonicalization.
- No local PostgreSQL access or owner VM DB test; transactional publish, snapshot and token tests remain assigned to Plan 07-04 and the owner VM gate.
- Continuation follow-up: 19 focused unit tests passed across publish guard and provider tests; `npx tsc --noEmit`, focused ESLint, `npm run build:worker`, and `git diff --check` passed. PostgreSQL-backed continuation and pg-boss scheduling were not run locally.

## Deviations from Plan

### Auto-fixed issues

1. **[Rule 2 - Safety] Bind queue jobs to their approval.** The existing enqueue and reschedule paths carried only the variant ID, so an old delayed job could publish a replacement approval. The queue payload, reschedule helper and caller now include the approval ID. Files: `src/server/agents/tools/socials.ts`, `src/server/queue.ts`, `src/server/socials-actions.ts`. Commit: `ff9c136`.
2. **[Rule 1 - Bug] Allow owner resolution of ambiguous LinkedIn posts.** The planned failure message offered Mark as posted, but that action rejected LinkedIn. Failed LinkedIn variants can now be marked after owner review, with LinkedIn URL host validation. File: `src/server/socials-actions.ts`. Commit: `ff9c136`.
3. **[Rule 2 - Safety] Reject ambiguous Instagram media matching.** Adoption requires one matching caption across all returned media pages; an incomplete scan or a duplicate stops for owner review. File: `src/server/socials/providers.ts`. Commits: `ff9c136`, `1748da0`.
4. **[Rule 2 - Safety] Guard token refresh against owner replacement.** Refresh writes compare the previous ciphertext and preserve credential generation, so a racing owner reconnection is not overwritten. File: `src/server/socials/connections.ts`. Commit: `6404d09`.
5. **[Rule 1 - Bug] Resume stored Instagram containers promptly.** The delayed retry could fire at the exact two-minute stale boundary and no-op; enqueue failure then depended on a six-hour sweep. The retry now starts five seconds after the persisted claim becomes stale, and the worker runs a publish-only overdue sweep every minute on the existing queue. Terminal Instagram container statuses fail the variant instead of polling indefinitely. Files: `src/server/socials/publish.ts`, `src/server/socials/providers.ts`, `src/worker/index.ts`, focused unit tests. Commit: `5fd2b36`.

## Known stubs and owner checks

- Instagram per-image insights remain unavailable in `src/server/socials/providers.ts` until the owner supplies a real image insight response and confirms token provenance, expiry and refresh behavior (D-03). The real provider remains locked while `verification_pending`; connected account totals use only returned fields.
- Instagram adoption scans up to 5,000 media items. A larger account remains in owner review rather than risking a false match.
- TikTok start and callback routes are ready, while the Settings Connect control is assigned to Plan 07-07.
- Owner VM migration 0009, DB/e2e checks, deployment, developer-app setup, token entry and live provider smoke tests remain D-03 owner actions. No migration, external post, live provider call, deployment or push occurred.

## Self-Check: PASSED

- All five created source/test files exist.
- All six task and follow-up commit hashes resolve in Git.
- Focused tests, typecheck, lint and both production builds passed as reported above.
