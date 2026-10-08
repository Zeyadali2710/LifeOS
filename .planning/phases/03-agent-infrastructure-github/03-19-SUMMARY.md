---
phase: 03-agent-infrastructure-github
plan: 19
subsystem: phase-gate
tags: [e2e, docs, live-verification, chat, approvals]
requires: [03-01, 03-18]
provides: [phase 3 e2e coverage, shipped-infrastructure docs, live production verification]
requirements-completed: [AGT-01, AGT-02, AGT-03, AGT-04, AGT-05, AGT-06]
key-files:
  created:
    - tests/e2e/owner.ts
    - tests/e2e/approvals.spec.ts
    - tests/e2e/agents.spec.ts
    - tests/e2e/chat.spec.ts
    - tests/e2e/settings.spec.ts
  modified:
    - src/app/api/chat/route.ts
    - src/server/queue.ts
    - tests/db/chat-route.test.ts
    - tests/e2e/home.spec.ts
    - tests/e2e/palette.spec.ts
    - tests/e2e/shell-nav.spec.ts
    - playwright.config.ts
    - docs/agents.md
    - docs/integrations.md
metrics:
  tasks: 3
  completed: 2026-10-09
---

# Phase 3 Plan 19: Phase gate Summary

E2E specs for approvals, agents, chat and settings plus shipped-infrastructure docs, and live owner verification of all 7 steps on the production homelab deployment (Docker Compose on the Proxmox VM behind `tailscale serve` HTTPS); the owner approved: "All my steps worked."

## Commits
- Task 1: 62298df test(03-19) e2e specs for approvals, agents, chat, settings; fix stale specs
- Task 2: 1c95013 docs(03-19) document shipped agent infrastructure and GitHub integration
- Task 3 (checkpoint, live verification): approved; bug found during it fixed in 2e28d3f fix(03) chat origin check behind tailscale serve

## Live verification (Task 3)
Run by the owner on the production deployment, not the local dev stack. This is a stronger check than planned: real reverse proxy, real HTTPS, and streaming through Tailscale. Steps 1-7 all passed.

## Deviations from Plan

**1. [Rule 1 - Bug] Chat POST rejected with 403 behind tailscale serve** (found in live step 3, fixed in 2e28d3f)
- Symptom: toast "That request couldn't be sent. Try again."
- Root cause: `src/app/api/chat/route.ts` compared the browser Origin to `new URL(request.url).origin`. Behind tailscale serve that is the internal `http://...:3000`, so every chat POST got 403, and the client mapped the unknown response to the generic "invalid" toast.
- Fix: compare against `new URL(env().BETTER_AUTH_URL).origin` (the deployment already requires BETTER_AUTH_URL to equal the browser URL). Regression test in `tests/db/chat-route.test.ts`: public origin with an internal `request.url` is not 403.
- Why tests missed it: local and e2e use localhost for both origins.

**2. [Rule 1 - Bug] `enqueue()` 5s timeout fix** (62298df), found while writing e2e.

**3. [Rule 3 - Blocking] Playwright `workers: 1`** to avoid shared-DB/state interference between specs.

**4. Stale spec updates:** older specs updated to match Phase 3 UI.

**5. Plan wording corrections in specs:** 11 agent cards; empty state not asserted (ponytail comment in spec); approvals write flow is desktop-only.

**6. Dev DB migrated** via `npm run db:migrate` (additive migration 0001).

## Assumptions A1-A7 (03-RESEARCH.md)
| # | Outcome |
|---|---------|
| A1 | Confirmed: live chat with zod-derived tool schemas ran with no API error |
| A2 | Unverified: owner did not report whether the token-expiry header/expiry was shown |
| A3 | Not individually reported; no live issue raised |
| A4 | Not individually reported; cost fixture test covers it, no live issue raised |
| A5 | Repo sync and PR/issue citations worked live (steps passed); no shape issues reported |
| A6 | Not exercised (Haiku titling deferred) |
| A7 | Confirmed: Sonnet 5.5 ids worked, delegation and streaming succeeded |

## Verification
typecheck clean; lint 0 errors; vitest 41 files / 182 tests pass (plus the new regression assertion); e2e on production build 62 passed, 14 skipped by design, 0 failed.

## Lessons
- Any same-origin or CSRF-style check must use the public URL (`BETTER_AUTH_URL`), never `request.url`, since the app runs behind a proxy.
- Local/e2e cannot catch proxy-origin bugs; the live production check did.

## Follow-ups (non-blocking)
- Ops: owner hit `permission denied ... docker.sock` on the VM (user not in docker group / stale session); resolved by re-login. Add to docs/deployment.md troubleshooting.
- Gaps for /gsd:plan-phase --gaps: none blocking.

## Self-Check: PASSED
