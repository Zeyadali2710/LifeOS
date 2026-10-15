---
phase: 07-socials
plan: 04
subsystem: socials
requires: [07-03]
provides: [database contract tests, integration capability documentation, owner homelab checklist]
affects: [07-07]
key-files:
  created: [tests/db/socials.test.ts]
  modified: [docs/integrations.md, .planning/OWNER-ACTIONS.md]
completed: 2026-10-15
---

# Phase 7 Plan 04: Database contracts and owner gates

Added fake-provider DB contracts for owner and agent approvals, edited payload persistence, scheduling, cancellation, binding changes, retry safety, connection verification, partial TikTok grants, token rotation and analytics snapshots. Integration documentation records actual capabilities and the unresolved Instagram live verification. The owner checklist gives the VM migration, isolated database tests, later Playwright/UAT and provider setup steps.

## Commits

- `0292903` — DB contract spec, integrations matrix and owner VM/provider checklist.

## Verification

The interrupted executor reported these completed checks before its usage limit:

- Typecheck passed.
- Focused approval and executor unit tests: 13 passed using the stable temporary directory.
- Focused ESLint and diff checks passed.
- DB suite reached setup; its cases were skipped because local PostgreSQL port 5433 returned `EACCES`. No transactional DB result is claimed. Owner VM execution remains a blocking acceptance item.

## Recovery and gates

The usage limit interrupted summary writing after the task commit. Recovery confirmed a clean working tree and the committed task files before creating this summary. No implementation was repeated.

No VM migration, deployment, push, external post or live provider call occurred. STATE and ROADMAP remain unchanged pending acceptance. Plans 07-05 through 07-07 supply the UI before the owner performs the Phase 7 deployment and browser checks.

## Self-check

- [x] Task commit and its three files exist.
- [x] Local typecheck, focused unit tests, lint and diff checks passed as reported above.
- [ ] Owner VM DB tests, migration, Playwright, UAT and real provider smoke remain open.
