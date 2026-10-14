---
phase: 07
slug: socials
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-15
---

# Phase 7 — Validation Strategy

Validation contract derived from 07-RESEARCH.md Validation Architecture and D-24. All provider calls in automated tests use fakes; owner-only live checks are listed below.

## Test Infrastructure

| Property | Value |
|---|---|
| Framework | Existing Vitest 5, Playwright, TypeScript and ESLint |
| Config | `vitest.config.ts`, `playwright.config.ts`, `package.json` |
| Quick run | `npm run typecheck` plus the focused test named in the active task |
| Full local suite | `npm run lint && npm test && npm run build` |
| VM suite | `scripts/vm-db-test.sh` and Playwright e2e, owner-run per D-03 |
| Feedback target | Focused tests and typecheck in under 60 seconds each; report actual runtime during execution |

## Sampling Rate

- After each task: run that task's `<verify><automated>` command and record result in its summary.
- After each plan wave: run `npm run typecheck && npm run lint && npm test` where the new files are runnable; record any environment-specific deferral.
- Before Phase 7 verification: run the full local suite and owner VM DB/e2e checks, then record live provider smoke separately.
- Do not call a real LinkedIn, Instagram or TikTok API from unit, DB or Playwright tests.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure behavior | Test type and command | File at planning | Status |
|---|---:|---:|---|---|---|---|---|---|
| 07-01-01 | 01 | 1 | SOC-01/02/03 | T-07-02 | Binding columns and unique variants | Unit `npx vitest run tests/unit/social-types.test.ts`; typecheck | create in task | pending |
| 07-01-02 | 01 | 1 | SOC-01/03 | T-07-01/03 | Honest mock/real capability and fixed hosts | Unit `npx vitest run tests/unit/socials-providers.test.ts`; typecheck | create in task | pending |
| 07-02-01 | 02 | 2 | SOC-02/03 | T-07-05 | Owner guard, scheduled read-only, audit | Typecheck and focused ESLint; DB case in 07-04 | DB test in 07-04 | pending |
| 07-02-02 | 02 | 2 | SOC-02 | T-07-04/06/07 | Edited payload atomic; bound provider | Unit `npx vitest run tests/unit/social-publish-kind.test.ts`; typecheck | create in task | pending |
| 07-03-01 | 03 | 3 | SOC-02 | T-07-08/09 | No stale, switched or duplicate publish | Unit `npx vitest run tests/unit/social-publish-executor.test.ts`; typecheck | create in task | pending |
| 07-03-02 | 03 | 3 | SOC-01/03 | T-07-10/11 | State, partial grants, token rotation | Unit `npx vitest run tests/unit/socials-providers.test.ts`; typecheck | extend in task | pending |
| 07-04-01 | 04 | 4 | SOC-01/02/03 | T-07-12/13 | Transactional DB and owner evidence | Typecheck; unit approval/executor; owner VM `scripts/vm-db-test.sh` | create in task | pending |
| 07-05-01 | 05 | 4 | SOC-01/03 | T-07-14/15 | Mock/pending/partial states, safe render | Typecheck and focused ESLint; e2e in 07-07 | e2e in 07-07 | pending |
| 07-06-01 | 06 | 5 | SOC-02 | T-07-16/17/18 | Scheduled sheet read-only; capability gate | Unit `npx vitest run tests/unit/socials-ui.test.ts`; typecheck | create in task | pending |
| 07-06-02 | 06 | 5 | SOC-02/03 | T-07-17 | Missing metric vs returned zero | Unit `npx vitest run tests/unit/socials-ui.test.ts`; typecheck | extend in task | pending |
| 07-07-01 | 07 | 6 | SOC-02 | T-07-19/21 | Locked approval destination and server recheck | Typecheck and focused ESLint; e2e in 07-07-02 | e2e in 07-07-02 | pending |
| 07-07-02 | 07 | 6 | SOC-01/02/03 | T-07-20/21 | Secret-safe settings and full mock flow | Typecheck, ESLint, unit; owner VM Playwright | create in task | pending |

## Wave 0 Requirements

Existing Vitest, Playwright, ESLint and TypeScript infrastructure covers the phase. Each named test file is created before its production behavior within its task; no package install or framework scaffold is needed. The owner VM DB/e2e environment remains a D-03 action.

## Requirement Coverage

| Requirement | Evidence |
|---|---|
| SOC-01 | Provider fixtures, capability and partial-scope unit tests; connection UI e2e; owner-app smoke for each real provider |
| SOC-02 | Pure validation, approval and publish-executor unit tests; VM DB transaction tests; mock Playwright flow |
| SOC-03 | Returned-field normalization/missing-metric tests; snapshot DB upsert; UI honest-state tests; owner Instagram/TikTok live smoke |

## Source Coverage Audit

| Source | Covered by | Status |
|---|---|---|
| GOAL — draft once, platform variants, calendar, approved publish, honest analytics | Plans 01–07 | covered |
| REQ — SOC-01, SOC-02, SOC-03 | Plans 01/03/04/05/07; 01/02/03/04/06/07; 01/03/04/05/06/07 respectively | covered |
| RESEARCH — LinkedIn 202609/little text/plain link; TikTok web OAuth/partial grants/POST list/rotation; Instagram live uncertainties | Plans 01/04/06; 01/03/07; 01/02/03/04/05/07 | covered |
| CONTEXT — D-01..D-09 providers/credentials, D-10..D-20 data/approval/sync/agent, D-21..D-24 UI/testing | Plans 01–04, 01–04/06, 04–07 | covered |
| Deferred Ideas in 07-CONTEXT.md | No plan | excluded by decision |

## Manual-Only Verifications

| Behavior | Requirement | Why manual | Owner action |
|---|---|---|---|
| VM migration 0009 and DB/e2e | SOC-01/02/03 | Owner VM is the approved test/deploy environment | Run migration, `scripts/vm-db-test.sh`, Playwright and UAT; record results in OWNER-ACTIONS.md |
| LinkedIn app and 202609 publish | SOC-01/02 | Requires owner app/product/token | Confirm OIDC/Share scopes, little-text escaping and plain URL on one owner post |
| TikTok Sandbox grants | SOC-01/03 | Requires target-user consent and app settings | Confirm user.info.basic, user.info.stats, video.list actually granted; inspect public-video metrics |
| Instagram real capability | SOC-01/02/03 | Exact token/refresh/publish/insight details unverified in research | Confirm token provenance, scopes/expiry/refresh, public-image publish and actual insight response; then owner confirms in Settings. Until then real publish/analytics remain unavailable, while mocks work. |

## Validation Sign-Off

- [x] Every task has an automated verify command or named downstream behavior test.
- [x] No three consecutive tasks lack automated verification.
- [x] No watch-mode commands or new dependencies.
- [ ] Execute tasks and record green focused checks.
- [ ] Run full local suite and owner VM acceptance checks.
- [ ] Owner reviews live provider smoke and accepts Phase 7.

**Approval:** pending owner plan review.
