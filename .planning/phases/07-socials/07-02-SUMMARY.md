---
phase: 07-socials
plan: 02
subsystem: socials
tags: [server-actions, agent-tools, approvals, scheduling]
requires: [07-01]
provides: [owner draft actions, social read models, live Social agent, provider-bound publish approvals]
affects: [07-03, 07-04, 07-05, 07-06, 07-07]
tech-stack:
  added: []
  patterns: [synthetic owner agent run through gateway, atomic approval-to-variant binding, hash of approved platform and content]
key-files:
  created: [src/server/socials/queries.ts, src/server/socials-actions.ts, src/server/agents/tools/socials.ts, tests/unit/social-publish-kind.test.ts]
  modified: [src/lib/approval-kinds.ts, src/server/agents/gateway.ts, src/server/agents/approvals.ts, src/server/agents/registry.ts, src/server/queue.ts]
key-decisions:
  - Owner and agent publish requests use the same gateway path; unsupported providers fail before approval creation.
  - Approval commits edited content and binding before the resumed run enqueues a scheduled publish job.
requirements-completed: [SOC-02, SOC-03]
metrics:
  completed: 2026-10-15
---

# Phase 7 Plan 02: Social drafts and publish approvals

Owner actions and the Social agent can prepare platform drafts. Publish requests create a seven-day approval bound to the current provider mode and credential generation. Approval stores the owner's final text, image, link and hash on the variant before a publish job can be enqueued.

## Task commits

- `580f17a` Task 1: owner draft actions and read models.
- `a6de67f` Task 2 RED: failing approval contract tests.
- `8467611` Task 2 GREEN: Social agent, approval lifecycle, queue scheduling and tests.
- `35f179a` Task 2 safety fix: clear prior approval binding when a failed variant is redrafted.
- `ca3e1a7` Task 1 correction: offer only saved or attended events as starters.
- `e032179` Task 1 safety fix: conditional manual-post transition and secret-safe action logging.

## Verification

- `npx tsc --noEmit`: passed.
- Focused ESLint over changed source and tests: passed without warnings.
- Focused approval, agent contract and social publish tests: 38 passed.
- Focused manual-post race and approval tests after review fix: 13 passed; typecheck and focused ESLint passed.
- Full unit suite: 483 passed across 53 files.
- `npm run build`: passed after Windows sandbox path escalation. The sandboxed attempt stopped on a path-canonicalization permission error before compilation.
- Full Vitest attempt: 483 unit tests passed; 441 DB cases skipped and 55 DB suites failed setup because local PostgreSQL port 5433 is inaccessible (`EACCES`). VM DB verification remains the owner action in Plan 04.

## Deviations from plan

- Rule 3: registered Social tools in `src/server/agents/tools/index.ts` and updated the existing agent registry test. Without those changes, gateway calls cannot resolve the tool and the suite fails.
- Rule 3: added minimal Social entries to existing approval UI maps for typecheck and a truthful AI approval card. The full edit sheet remains assigned to Plan 07-07.
- Rule 2: added pg-boss `startAfter`, reschedule and cancel helpers to `src/server/queue.ts`; scheduling otherwise runs immediately or keeps an old delayed job.
- Rule 1: corrected calendar read filtering for manually posted variants and kept rescheduling conditional on an approved snapshot.
- Rule 1: a redraft after a failed publish now clears the old approval ID, schedule and binding so the next request starts from a clean draft.
- Rule 1: starter queries now match D-13's saved or attended event scope.
- Rule 1: `markPosted` now checks draft/failed state in the update itself and denies a lost race; owner action logs omit raw error objects that could contain pasted tokens.

## Known stubs and next checks

- `src/approvals/approval-detail.tsx` routes `social_publish` to `UnreadableApproval` until Plan 07-07 adds its editable approval sheet. The AI approval card can show and approve the exact original payload; edits are server-supported but not yet exposed in the page.
- Plan 07-03 must supply the publish worker, binding recheck and due-schedule sweep. No provider call occurs in this plan.
- Plan 07-04 must run transactional DB tests on the owner VM, including synthetic owner requests, approval edits, rejection and expiry. Local DB setup cannot run them.
- No VM migration, live provider call, deployment, external post or push was performed.

## Self-check

- [x] Task commits exist and their source files are present.
- [x] Typecheck, focused lint, unit tests and production build passed.
- [ ] Owner VM DB and live provider checks remain open under D-03.
