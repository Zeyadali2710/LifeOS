---
phase: 02-shell
plan: 09
subsystem: shell
tags: [routes, e2e, next-conventions]
requires: [02-04, 02-08]
provides: [DomainPage, 10 domain routes, (os) template/loading/error, shell-nav e2e]
key-files:
  created: [src/shell/domain-page.tsx, "src/app/(os)/{career,socials,outreach,organization,projects,knowledge,goals,agents,approvals,settings}/page.tsx", "src/app/(os)/template.tsx", "src/app/(os)/loading.tsx", "src/app/(os)/error.tsx", tests/e2e/shell-nav.spec.ts]
decisions:
  - error.tsx uses retry() (Next 16.4) and never renders error fields
metrics:
  completed: 2026-10-08
requirements: [SHL-01]
---

# Phase 2 Plan 09: Domain pages and nav e2e Summary

Ten honest empty domain pages (PageHeader + EmptyState, UI-SPEC copy), (os) fade template, skeleton loading and fixed-copy error boundary wired to retry(), plus an e2e proving SHL-01 on desktop and mobile.

## Commits
- b1cc60f feat: domain pages and template/loading/error
- 87e2b6a test: shell-nav e2e

## Verification
- typecheck clean; eslint src tests: 0 errors (2 accepted location.assign warnings).
- `npx playwright test shell-nav`: 4 passed, 2 skipped (project-specific tests skipped on the other project). Actually ran against prod build with lifeos_e2e DB.

## Deviations
- [Rule 1] e2e: login redirect carries `?next=%2Fcareer`, so regex allows a query string; mobile bottom-bar assertions use role queries (getByText missed link text).
- error.tsx: UI-SPEC says `reset`, plan/Next 16.4 use `retry`; followed plan.

## Self-Check: PASSED
