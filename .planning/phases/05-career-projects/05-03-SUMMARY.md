---
phase: 05-career-projects
plan: 03
subsystem: github-sync, career-queries
tags: [github, sync, languages, career, drizzle]
requires: [05-01, 05-02]
provides: [github_repos.languages sync, src/server/career.ts (loadCareer, loadRepoDetail, repoCards, repoActivity)]
affects: [05-06 project queries, career pages]
key-files:
  created: [src/server/career.ts, tests/db/career-queries.test.ts, tests/fixtures/github/languages.json]
  modified: [src/server/github/sync.ts, tests/db/github-sync.test.ts]
decisions:
  - tiles.ciFailing uses ciHealth state (failing) so a running re-run does not hide a failing repo
metrics:
  completed: 2026-10-13
---

# Phase 5 Plan 03: Languages sync + career query layer Summary

Existing 15-min GitHub sync now stores per-repo language bytes via an ETag-conditional call (zod-validated, per-repo 404 skipped), commits raised to per_page=100, plus a read-only `career.ts` query layer producing CareerDTO/RepoDetailDTO from synced tables.

## Tasks
1. Sync languages + per_page=100 (1091760): `/languages` cond GET after runs block; not_found skipped, other errors rethrown; test covers 200, `{}` vs null, 304 keeps, 404 continues.
2. Career queries (see git log): open counts via grouped count filtered by `state='open'`, latest 5 runs per repo into ciChip/ciHealth, 14-day sparkline, `synced` mirrors 90-day window, activity merge (20), review state from latest-per-reviewer, `isSafeGithubUrl` hrefs.

## Verification
`npx tsc --noEmit` and eslint clean. DB tests (github-sync, career-queries) were written but NOT run locally (no DB); owner runs them on the VM at the 05-12 gate.

## Deviations from Plan
None. Minor design choices: DISMISSED reviews clear a reviewer's earlier approval; COMMENTED reviews are ignored; PR/issue activity uses ghUpdatedAt and skips rows with null dates.

## Known Stubs
None.

## Self-Check: PASSED
