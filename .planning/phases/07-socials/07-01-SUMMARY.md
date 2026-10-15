---
phase: 07-socials
plan: 01
subsystem: socials
tags: [drizzle, providers, credentials, validation]
requires: []
provides: [migration 0009, social data contract, social provider seam, encrypted connection helpers]
affects: [07-02, 07-03, 07-04, 07-05, 07-06, 07-07]
key-files:
  created: [drizzle/0009_socials.sql, src/lib/social-types.ts, src/server/socials/providers.ts, src/server/socials/connections.ts, src/server/socials/markdown.ts]
  modified: [src/server/db/schema.ts, src/server/queue.ts, tests/db/migrations.test.ts]
decisions:
  - Drizzle generated migration 0009_socials with a journal and snapshot; neither was hand-edited.
  - A real Instagram connection remains verification_pending until the owner confirms live publish and insights behavior.
  - An ambiguous Instagram container or publish response stops for review instead of retrying a potentially duplicated post.
metrics:
  completed: 2026-10-15
---

# Phase 7 Plan 01: Socials data and providers

Added social posts, platform variants, account snapshots and credential-generation binding. Shared rules cover platform limits, board state and token expiry. Provider contracts cover LinkedIn, Instagram, TikTok, Portfolio and explicit mocks; connection helpers encrypt credentials and return status without raw tokens.

## Commits

- `7382054` test(07-01): add failing social rules tests
- `b23c919` feat(07-01): add social schema and validation rules
- `ba0dddc` test(07-01): add failing social provider tests
- `7f9c756` feat(07-01): add social provider contracts and fixtures

## Verification

- `npx vitest run tests/unit/socials-providers.test.ts`: 7 passed.
- `npx vitest run tests/unit/social-types.test.ts`: 3 passed during Task 1.
- `npx tsc --noEmit`: passed.
- `npx eslint src/server/socials tests/unit/socials-providers.test.ts tests/helpers/fake-socials.ts`: passed without warnings.
- `npm run lint`: passed with 19 warnings in existing files outside Plan 01.
- Full Vitest with stable temp directory and `--maxWorkers=1`: 472 unit tests passed; 441 DB tests skipped because local Postgres connection to port 5433 is denied (`EACCES`).
- `npm run build`: passed with elevated filesystem access. The sandboxed run stopped before compilation on a Windows path-canonicalization access error.

## Deviations and gates

- The interrupted executor left Task 2 provider files uncommitted after a usage limit. The resumed run fixed the TikTok fixture dispatch and handled ambiguous Instagram container responses before committing Task 2.
- The VM migration and DB tests remain owner actions under D-03. No migration, live API call, deployment or external post was run.
- This plan is ready for owner review; GSD phase tracking remains unchanged pending its acceptance gates.

## Self-check

- [x] Plan 01 files committed and working tree clean.
- [x] Focused provider and shared-rule tests, typecheck, lint and production build passed.
- [ ] VM DB migration and provider smoke checks recorded by the owner.
