---
phase: 03-agent-infrastructure-github
plan: 08
subsystem: github-sync
tags: [github, sync, etag, activity]
requires: [03-01, 03-04]
provides: [createSync, handleGithubSync]
affects: [plan 18 worker registration]
key-files:
  created:
    - src/server/github/sync.ts
    - src/worker/jobs/github-sync.ts
    - tests/db/github-sync.test.ts
    - tests/fixtures/github/pulls.json
    - tests/fixtures/github/issues.json
    - tests/fixtures/github/commits.json
    - tests/fixtures/github/runs.json
requirements-completed: [AGT-06]
duration: ~20min
completed: 2026-10-08
---

# Phase 3 Plan 08: GitHub read sync Summary

createSync({handle, fetch, emit, now}).run() syncs repos, PRs (+reviews for open), owner issues, default-branch commits and latest runs using only readToken, with per-URL ETags and transition-only activity.

## Behavior
- First observation of a repo is silent; emits "Pull request merged", "Review requested", "CI failed" (+IMPORTANT, actionUrl only if isSafeGithubUrl); "GitHub synced" summary only when events > 0 and not first sync.
- 401: connection marked error, one IMPORTANT (only on connected->error), returns {error:"auth"}. Rate limit/other: lastSyncError recorded, no throw.
- Bounds: active (non-archived, pushed <90d) repos, max 30; text truncated to 2000.
- Job handler logs counts only; queue registration is left to plan 18.

## Deviations
None functionally. Notes: repo list uses a single ETag-conditional first page (per_page=100, ponytail comment: >100 repos need paging). Test sets env vars itself since readToken uses the env master key; saveToken's audit write logs a harmless connection error to the unused DATABASE_URL.

## Verification
`npx vitest run tests/db/github-sync.test.ts` 4/4 pass; `npm run typecheck` clean; `grep -c writeToken sync.ts` = 0.

## Self-Check: PASSED
